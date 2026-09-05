import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';

// FR-SET-011/012, BR-FIN-06: the one control the Finance spec names as
// something that "must not be deferred under any circumstance" (§9.1).
// assertPeriodOpen is called, inside the caller's own transaction, by every
// service that writes a LedgerEntry — invoice issue, credit note issue,
// payment recording, manual journals, expense/purchase-invoice posting —
// immediately before the posting. Period control is opt-in until a tenant
// configures a financial year (no periods exist yet): a date with no
// matching period is never blocked, only a date inside a period that is
// explicitly CLOSED is.
@Injectable()
export class PeriodsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async assertPeriodOpen(tx: Prisma.TransactionClient, tenantId: string, date: Date) {
    const period = await tx.accountingPeriod.findFirst({
      where: { tenantId, startDate: { lte: date }, endDate: { gte: date } },
    });
    if (!period) return;
    if (period.status === 'CLOSED') {
      throw new BadRequestException({
        code: 'period.closed',
        message: `The accounting period covering ${date.toISOString().slice(0, 10)} is closed. Reopen it before posting.`,
      });
    }
  }

  async list(tenantId: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.accountingPeriod.findMany({ where: { tenantId }, orderBy: { startDate: 'asc' } }),
    );
  }

  // FR-SET-001: twelve monthly periods for one financial year, starting at
  // the tenant's configured (month, day).
  async generateYear(tenantId: string, startYear: number, startMonth: number, startDay: number) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const periods = [];
      for (let i = 0; i < 12; i++) {
        const start = new Date(Date.UTC(startYear, startMonth - 1 + i, startDay));
        const end = new Date(Date.UTC(startYear, startMonth - 1 + i + 1, startDay));
        end.setUTCDate(end.getUTCDate() - 1);
        periods.push({ tenantId, startDate: start, endDate: end });
      }
      await tx.accountingPeriod.createMany({ data: periods, skipDuplicates: true });
      return tx.accountingPeriod.findMany({ where: { tenantId }, orderBy: { startDate: 'asc' } });
    });
  }

  async close(tenantId: string, userId: string, periodId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const period = await tx.accountingPeriod.findUniqueOrThrow({ where: { id: periodId } });
      if (period.status === 'CLOSED') {
        throw new BadRequestException({ code: 'period.already_closed', message: 'This period is already closed.' });
      }
      const updated = await tx.accountingPeriod.update({
        where: { id: periodId },
        data: { status: 'CLOSED', closedAt: new Date(), closedByUserId: userId },
      });
      await this.audit.write(tx, {
        tenantId, userId, action: 'period.closed', resourceType: 'AccountingPeriod',
        resourceId: periodId, after: { startDate: period.startDate },
      });
      return updated;
    });
  }

  // FR-SET-012: reopening is gated behind the period-reopen permission at
  // the controller and always raises a high-visibility audit event here.
  async reopen(tenantId: string, userId: string, periodId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const period = await tx.accountingPeriod.findUniqueOrThrow({ where: { id: periodId } });
      if (period.status === 'OPEN') {
        throw new BadRequestException({ code: 'period.already_open', message: 'This period is already open.' });
      }
      const updated = await tx.accountingPeriod.update({
        where: { id: periodId },
        data: { status: 'OPEN', reopenedAt: new Date(), reopenedByUserId: userId },
      });
      await this.audit.write(tx, {
        tenantId, userId, action: 'period.reopened', resourceType: 'AccountingPeriod',
        resourceId: periodId, after: { startDate: period.startDate },
      });
      return updated;
    });
  }
}
