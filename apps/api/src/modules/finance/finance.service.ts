import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { computeLine } from '../../shared/money/money';

interface LineInput { description: string; quantity: number; unitPrice: number; discountPct?: number; vatRatePct?: number; }

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // Create an editable DRAFT. No number is allocated yet, nothing is posted.
  async createDraft(tenantId: string, userId: string, partyId: string, lines: LineInput[]) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const computed = lines.map((l) => {
        const r = computeLine({
          quantity: l.quantity, unitPrice: BigInt(l.unitPrice),
          discountPct: l.discountPct ?? 0, vatRatePct: l.vatRatePct ?? 20,
        });
        return { ...l, ...r };
      });
      const netTotal = computed.reduce((s, l) => s + l.net, 0n);
      const vatTotal = computed.reduce((s, l) => s + l.vat, 0n);
      const invoice = await tx.invoice.create({
        data: {
          tenantId, partyId, status: 'DRAFT',
          netTotal, vatTotal, grossTotal: netTotal + vatTotal,
          lines: {
            create: computed.map((l) => ({
              tenantId, description: l.description, quantity: l.quantity,
              unitPrice: BigInt(l.unitPrice), discountPct: l.discountPct ?? 0,
              vatRatePct: l.vatRatePct ?? 20, net: l.net, vat: l.vat, total: l.total,
            })),
          },
        },
        include: { lines: true },
      });
      return invoice;
    });
  }

  // Issue: allocate a gap-free number, post a BALANCED double-entry, write audit,
  // and lock the invoice. This is the one-way door — after this it is immutable.
  async issue(tenantId: string, userId: string, invoiceId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      if (invoice.status !== 'DRAFT') throw new BadRequestException('Only a draft can be issued');

      const number = await this.allocateNumber(tx, tenantId);
      const accounts = await tx.account.findMany({ where: { tenantId } });
      const acc = (code: string) => {
        const a = accounts.find((x) => x.code === code);
        if (!a) throw new BadRequestException(`Missing account ${code}`);
        return a.id;
      };

      // Debit Debtors (gross); credit Sales (net) + Output VAT (vat).
      const entries = [
        { accountId: acc('1100'), debit: invoice.grossTotal, credit: 0n, narrative: `Invoice ${number}` },
        { accountId: acc('4000'), debit: 0n, credit: invoice.netTotal, narrative: `Invoice ${number}` },
        { accountId: acc('2200'), debit: 0n, credit: invoice.vatTotal, narrative: `Invoice ${number}` },
      ];
      const debits = entries.reduce((s, e) => s + e.debit, 0n);
      const credits = entries.reduce((s, e) => s + e.credit, 0n);
      if (debits !== credits) throw new Error('Ledger not balanced — refusing to post');

      await tx.ledgerEntry.createMany({
        data: entries.map((e) => ({ ...e, tenantId, invoiceId })),
      });
      const issued = await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: 'ISSUED', number, issueDate: new Date() },
      });
      await this.audit.write(tx, {
        tenantId, userId, action: 'invoice.issued', resourceType: 'Invoice',
        resourceId: invoiceId, before: { status: 'DRAFT' }, after: { status: 'ISSUED', number },
      });
      return issued;
    });
  }

  // Atomic UPDATE ... RETURNING guarantees no two concurrent issues get the same number.
  private async allocateNumber(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
    const rows = await tx.$queryRawUnsafe<{ next: number }[]>(
      `UPDATE "NumberSequence" SET "next" = "next" + 1
       WHERE "tenantId" = $1 AND "docType" = 'INVOICE' RETURNING "next" - 1 AS next`,
      tenantId,
    );
    const n = rows[0].next;
    return `INV-${String(n).padStart(5, '0')}`;
  }

  async trialBalance(tenantId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const entries = await tx.ledgerEntry.findMany({ include: { account: true } });
      const byAccount: Record<string, { name: string; debit: bigint; credit: bigint }> = {};
      for (const e of entries) {
        const k = e.account.code;
        byAccount[k] ??= { name: e.account.name, debit: 0n, credit: 0n };
        byAccount[k].debit += e.debit;
        byAccount[k].credit += e.credit;
      }
      return byAccount;
    });
  }
}
