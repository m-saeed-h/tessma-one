import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

interface AgedRow {
  partyId: string;
  legalName: string;
  current: bigint;
  d30: bigint;
  d60: bigint;
  d90: bigint;
  d120plus: bigint;
  total: bigint;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // FR-ARC-001: aged receivables at 30/60/90/120 days, with drill-down to
  // transactions (the invoices array per row — the UI/caller already has the
  // invoice id to follow).
  async agedReceivables(tenantId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const invoices = await tx.invoice.findMany({
        where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
        include: { party: true },
      });

      const today = Date.now();
      const byParty = new Map<string, AgedRow & { invoices: unknown[] }>();

      for (const inv of invoices) {
        const outstanding = inv.grossTotal - inv.allocatedTotal;
        if (outstanding <= 0n) continue;

        const dueDate = inv.dueDate ?? inv.issueDate ?? inv.createdAt;
        const daysOverdue = Math.floor((today - dueDate.getTime()) / 86_400_000);
        const bucket: keyof AgedRow =
          daysOverdue <= 0 ? 'current' :
          daysOverdue <= 30 ? 'd30' :
          daysOverdue <= 60 ? 'd60' :
          daysOverdue <= 90 ? 'd90' : 'd120plus';

        let row = byParty.get(inv.partyId);
        if (!row) {
          row = { partyId: inv.partyId, legalName: inv.party.legalName, current: 0n, d30: 0n, d60: 0n, d90: 0n, d120plus: 0n, total: 0n, invoices: [] };
          byParty.set(inv.partyId, row);
        }
        (row[bucket] as bigint) += outstanding;
        row.total += outstanding;
        row.invoices.push({ id: inv.id, number: inv.number, dueDate: inv.dueDate, outstanding, daysOverdue });
      }

      return Array.from(byParty.values()).sort((a, b) => (b.total > a.total ? 1 : -1));
    });
  }

  // Backs the dashboard metric strip. Real aggregates, not placeholders —
  // outstanding/overdue reuse the same status set and cutoff logic as
  // agedReceivables above; paidThisMonth and avgDaysToPay are the two that
  // genuinely need their own queries (Payment data isn't on the Invoice list).
  async invoiceMetrics(tenantId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const openInvoices = await tx.invoice.findMany({
        where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
      });
      const today = Date.now();
      let outstanding = 0n;
      let overdue = 0n;
      for (const inv of openInvoices) {
        const remaining = inv.grossTotal - inv.allocatedTotal;
        if (remaining <= 0n) continue;
        outstanding += remaining;
        const dueDate = inv.dueDate ?? inv.issueDate ?? inv.createdAt;
        if (dueDate.getTime() < today) overdue += remaining;
      }

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const paymentsThisMonth = await tx.payment.findMany({ where: { receivedDate: { gte: monthStart } } });
      const paidThisMonth = paymentsThisMonth.reduce((s, p) => s + p.amount, 0n);

      // Average days from issue to "fully paid" — the latest allocation's
      // payment date, since a PAID invoice may have been settled across
      // several partial payments (PaymentAllocation itself carries no
      // timestamp; the payment it belongs to does, which is close enough —
      // allocation happens in the same request as recording the payment).
      const paidInvoices = await tx.invoice.findMany({
        where: { status: 'PAID', issueDate: { not: null } },
        include: { allocations: { include: { payment: true } } },
      });
      let totalDays = 0;
      let countedInvoices = 0;
      for (const inv of paidInvoices) {
        if (!inv.issueDate || inv.allocations.length === 0) continue;
        const latestPayment = inv.allocations.reduce((latest, a) =>
          a.payment.receivedDate > latest ? a.payment.receivedDate : latest, inv.allocations[0].payment.receivedDate);
        totalDays += Math.round((latestPayment.getTime() - inv.issueDate.getTime()) / 86_400_000);
        countedInvoices += 1;
      }
      const avgDaysToPay = countedInvoices > 0 ? Math.round(totalDays / countedInvoices) : null;

      return {
        outstandingPence: outstanding,
        overduePence: overdue,
        paidThisMonthPence: paidThisMonth,
        avgDaysToPay,
      };
    });
  }
}
