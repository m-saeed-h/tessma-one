import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';
import { WorkflowService } from '../../../core/workflow/workflow.service';
import { PeriodsService } from '../../../shared/periods/periods.service';
import { computeLine } from '../../../shared/money/money';

interface LineInput { description: string; nominalCode: string; quantity: number; unitPrice: number; vatRatePct?: number; }
interface CreateInput {
  supplierId: string; number: string; reference?: string; purchaseOrderRef?: string;
  invoiceDate: string; dueDate?: string; documentId: string; lines: LineInput[];
}

// FR-PIN-001 to 016: manual purchase-invoice entry (supplier email ingestion
// and AI extraction — FR-PIN-006 to 010 — are Phase 3 and both land in this
// same create() regardless of how the data arrived). FR-PIN-004: duplicate
// detection is enforced at the database level via the (tenantId, supplierId,
// number) unique constraint on PurchaseInvoice, not just a UI warning.
@Injectable()
export class PurchaseInvoicesService {
  constructor(
    private prisma: PrismaService, private audit: AuditService,
    private workflow: WorkflowService, private periods: PeriodsService,
  ) {}

  // FR-PIN-002: an original document must already be attached (uploaded via
  // the shared documents service) before a purchase invoice can be entered.
  async create(tenantId: string, userId: string, b: CreateInput) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const computed = b.lines.map((l) => ({
        ...l,
        ...computeLine({ quantity: l.quantity, unitPrice: BigInt(l.unitPrice), discountPct: 0, vatRatePct: l.vatRatePct ?? 20 }),
      }));
      const netTotal = computed.reduce((s, l) => s + l.net, 0n);
      const vatTotal = computed.reduce((s, l) => s + l.vat, 0n);

      const invoice = await tx.purchaseInvoice.create({
        data: {
          tenantId, supplierId: b.supplierId, number: b.number, reference: b.reference,
          purchaseOrderRef: b.purchaseOrderRef, invoiceDate: new Date(b.invoiceDate),
          dueDate: b.dueDate ? new Date(b.dueDate) : undefined, documentId: b.documentId,
          netTotal, vatTotal, grossTotal: netTotal + vatTotal,
          lines: {
            create: computed.map((l) => ({
              tenantId, description: l.description, nominalCode: l.nominalCode,
              quantity: l.quantity, unitPrice: BigInt(l.unitPrice), vatRatePct: l.vatRatePct ?? 20,
              net: l.net, vat: l.vat, total: l.total,
            })),
          },
        },
        include: { lines: true },
      });
      await this.audit.write(tx, {
        tenantId, userId, action: 'purchaseinvoice.created', resourceType: 'PurchaseInvoice',
        resourceId: invoice.id, after: { number: b.number, grossTotal: invoice.grossTotal.toString() },
      });
      return invoice;
    });
  }

  async submit(tenantId: string, userId: string, purchaseInvoiceId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const invoice = await tx.purchaseInvoice.findUniqueOrThrow({ where: { id: purchaseInvoiceId } });
      if (invoice.status !== 'DRAFT') {
        throw new BadRequestException({ code: 'purchaseinvoice.not_draft', message: 'Only a draft purchase invoice can be submitted for approval.' });
      }
      const result = await this.workflow.submitForApproval(tx, tenantId, 'finance.purchase_invoice', purchaseInvoiceId, userId, invoice.grossTotal);
      if (result.status === 'APPROVED') return this.postAndApprove(tx, tenantId, invoice.id);
      return tx.purchaseInvoice.update({ where: { id: purchaseInvoiceId }, data: { status: 'SUBMITTED' } });
    });
  }

  async decide(tenantId: string, approverId: string, purchaseInvoiceId: string, decision: 'APPROVED' | 'REJECTED', comment?: string) {
    const request = await this.prisma.forTenant(tenantId, (tx) =>
      tx.approvalRequest.findFirstOrThrow({ where: { tenantId, subjectType: 'finance.purchase_invoice', subjectId: purchaseInvoiceId } }),
    );
    const result = await this.workflow.decide(tenantId, request.id, approverId, decision, comment);
    return this.prisma.forTenant(tenantId, async (tx) => {
      if (result.status === 'REJECTED') {
        return tx.purchaseInvoice.update({ where: { id: purchaseInvoiceId }, data: { status: 'REJECTED' } });
      }
      if (result.status === 'APPROVED') return this.postAndApprove(tx, tenantId, purchaseInvoiceId);
      return tx.purchaseInvoice.findUniqueOrThrow({ where: { id: purchaseInvoiceId } });
    });
  }

  // FR-PIN-003: debit expense/asset per line's nominal account, debit
  // recoverable VAT, credit Trade Creditors — the accounts-payable mirror of
  // finance.service.ts's sales-invoice posting.
  private async postAndApprove(tx: Prisma.TransactionClient, tenantId: string, purchaseInvoiceId: string) {
    await this.periods.assertPeriodOpen(tx, tenantId, new Date());
    const invoice = await tx.purchaseInvoice.findUniqueOrThrow({ where: { id: purchaseInvoiceId }, include: { lines: true } });
    const accounts = await tx.account.findMany({ where: { tenantId } });
    const acc = (code: string) => {
      const a = accounts.find((x) => x.code === code);
      if (!a) throw new BadRequestException(`Missing account ${code}`);
      return a.id;
    };
    const narrative = `Purchase invoice ${invoice.number}`;
    const entries = [
      ...invoice.lines.map((l) => ({ accountId: acc(l.nominalCode), debit: l.net, credit: 0n, narrative })),
      ...(invoice.vatTotal > 0n ? [{ accountId: acc('1300'), debit: invoice.vatTotal, credit: 0n, narrative }] : []),
      { accountId: acc('2100'), debit: 0n, credit: invoice.grossTotal, narrative },
    ];
    const debits = entries.reduce((s, e) => s + e.debit, 0n);
    const credits = entries.reduce((s, e) => s + e.credit, 0n);
    if (debits !== credits) throw new Error('Ledger not balanced — refusing to post');

    await tx.ledgerEntry.createMany({ data: entries.map((e) => ({ ...e, tenantId, purchaseInvoiceId })) });
    return tx.purchaseInvoice.update({ where: { id: purchaseInvoiceId }, data: { status: 'APPROVED' } });
  }

  // PurchaseInvoice.supplierId is a plain column, not a declared Prisma
  // relation (the model deliberately avoids a hard FK to Party the way
  // sales Invoice has, since Party ownership already belongs to core) — so
  // the supplier name is resolved with a manual join rather than `include`.
  async list(tenantId: string, supplierId?: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const invoices = await tx.purchaseInvoice.findMany({
        where: supplierId ? { supplierId } : undefined,
        include: { lines: true },
        orderBy: { createdAt: 'desc' },
      });
      return this.withSupplierNames(tx, invoices);
    });
  }

  async get(tenantId: string, id: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const invoice = await tx.purchaseInvoice.findUniqueOrThrow({
        where: { id },
        include: { lines: true, ledgerEntries: { include: { account: true } } },
      });
      const [withName] = await this.withSupplierNames(tx, [invoice]);
      return withName;
    });
  }

  private async withSupplierNames<T extends { supplierId: string }>(tx: Prisma.TransactionClient, invoices: T[]) {
    const supplierIds = [...new Set(invoices.map((i) => i.supplierId))];
    const suppliers = await tx.party.findMany({ where: { id: { in: supplierIds } } });
    const nameById = new Map(suppliers.map((s) => [s.id, s.legalName]));
    return invoices.map((i) => ({ ...i, supplierName: nameById.get(i.supplierId) ?? 'Unknown supplier' }));
  }

  // FR-PIN-015: aged payables — the mirror of reports.service.ts's
  // agedReceivables, bucketed on outstanding (not original) balance.
  async agedPayables(tenantId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const invoices = await tx.purchaseInvoice.findMany({
        where: { status: { in: ['APPROVED', 'PARTIALLY_PAID'] } },
      });
      // Fetch supplier names in one pass — PurchaseInvoice has no direct
      // Party relation declared (supplierId is a plain string), so this is
      // a manual join rather than an `include`.
      const supplierIds = [...new Set(invoices.map((i) => i.supplierId))];
      const suppliers = await tx.party.findMany({ where: { id: { in: supplierIds } } });
      const nameById = new Map(suppliers.map((s) => [s.id, s.legalName]));

      const today = Date.now();
      const byParty = new Map<string, { partyId: string; legalName: string; current: bigint; d30: bigint; d60: bigint; d90: bigint; d120plus: bigint; total: bigint; invoices: unknown[] }>();
      for (const inv of invoices) {
        const outstanding = inv.grossTotal - inv.allocatedTotal;
        if (outstanding <= 0n) continue;
        const dueDate = inv.dueDate ?? inv.invoiceDate;
        const daysOverdue = Math.floor((today - dueDate.getTime()) / 86_400_000);
        const bucket = daysOverdue <= 0 ? 'current' : daysOverdue <= 30 ? 'd30' : daysOverdue <= 60 ? 'd60' : daysOverdue <= 90 ? 'd90' : 'd120plus';
        let row = byParty.get(inv.supplierId);
        if (!row) {
          row = { partyId: inv.supplierId, legalName: nameById.get(inv.supplierId) ?? 'Unknown supplier', current: 0n, d30: 0n, d60: 0n, d90: 0n, d120plus: 0n, total: 0n, invoices: [] };
          byParty.set(inv.supplierId, row);
        }
        (row as any)[bucket] += outstanding;
        row.total += outstanding;
        row.invoices.push({ id: inv.id, number: inv.number, dueDate: inv.dueDate, outstanding, daysOverdue });
      }
      return Array.from(byParty.values()).sort((a, b) => (b.total > a.total ? 1 : -1));
    });
  }
}
