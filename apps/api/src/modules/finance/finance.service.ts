import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { BrandingService } from '../../core/branding/branding.service';
import { NumberingService } from '../../shared/numbering/numbering.service';
import { PeriodsService } from '../../shared/periods/periods.service';
import { computeLine, penceToGBP } from '../../shared/money/money';
import { InvoicePdfService } from './pdf/invoice-pdf.service';
import { INVOICE_EMAIL_PROVIDER, type InvoiceEmailProvider } from './pdf/invoice-email.provider';

interface LineInput { description: string; quantity: number; unitPrice: number; discountPct?: number; vatRatePct?: number; }
interface DraftInput {
  purchaseOrderRef?: string; notes?: string; terms?: string; dueInDays?: number;
}
interface SendInvoiceInput {
  to: string[]; cc?: string[]; bcc?: string[]; subject: string; body: string;
}

@Injectable()
export class FinanceService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private branding: BrandingService,
    private numbering: NumberingService,
    private periods: PeriodsService,
    private pdf: InvoicePdfService,
    @Inject(INVOICE_EMAIL_PROVIDER) private emailProvider: InvoiceEmailProvider,
  ) {}

  // Create an editable DRAFT. No number is allocated yet, nothing is posted.
  async createDraft(tenantId: string, userId: string, partyId: string, lines: LineInput[], extra: DraftInput = {}) {
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
          purchaseOrderRef: extra.purchaseOrderRef, notes: extra.notes, terms: extra.terms,
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
      return { ...invoice, dueInDaysRequested: extra.dueInDays };
    });
  }

  // Issue: allocate a gap-free number, post a BALANCED double-entry, write audit,
  // and lock the invoice. This is the one-way door — after this it is immutable.
  async issue(tenantId: string, userId: string, invoiceId: string, dueInDays?: number) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      if (invoice.status !== 'DRAFT') throw new BadRequestException({ code: 'invoice.not_draft', message: 'Only a draft can be issued.' });

      // FR-PTY-011: credit limit is checked at issue, not at draft — a draft
      // is just working notes, issuing is the commitment.
      const customer = await tx.customerRole.findUnique({ where: { partyId: invoice.partyId } });
      let creditWarning: string | undefined;
      if (customer && customer.creditLimit > 0n) {
        const outstanding = await this.outstandingBalance(tx, invoice.partyId, invoiceId);
        const projected = outstanding + invoice.grossTotal;
        if (projected > customer.creditLimit) {
          if (customer.creditLimitBehaviour === 'BLOCK') {
            throw new ForbiddenException({
              code: 'invoice.credit_limit_exceeded',
              message: `Issuing this invoice would take the customer to ${penceToGBP(projected)}, over their ${penceToGBP(customer.creditLimit)} credit limit.`,
            });
          }
          creditWarning = `Customer is now over their credit limit (${penceToGBP(projected)} of ${penceToGBP(customer.creditLimit)}).`;
        }
      }

      const number = await this.numbering.allocate(tx, tenantId, 'INVOICE', 'INV');
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

      await this.periods.assertPeriodOpen(tx, tenantId, new Date());
      await tx.ledgerEntry.createMany({
        data: entries.map((e) => ({ ...e, tenantId, invoiceId })),
      });

      const financeProfile = await tx.tenantFinanceProfile.findUnique({ where: { tenantId } });
      const days = dueInDays ?? customer?.paymentTerms ?? financeProfile?.defaultPaymentTermsDays ?? 30;
      const issueDate = new Date();
      const dueDate = new Date(issueDate.getTime() + days * 24 * 60 * 60 * 1000);

      const issued = await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: 'ISSUED', number, issueDate, dueDate },
      });
      await this.audit.write(tx, {
        tenantId, userId, action: 'invoice.issued', resourceType: 'Invoice',
        resourceId: invoiceId, before: { status: 'DRAFT' }, after: { status: 'ISSUED', number },
      });
      await this.notifications.send(
        tx, tenantId, userId, 'IN_APP',
        `Invoice ${number} issued`,
        creditWarning
          ? `Invoice ${number} for ${penceToGBP(issued.grossTotal)} was issued. ${creditWarning}`
          : `Invoice ${number} for ${penceToGBP(issued.grossTotal)} was issued and posted to the ledger.`,
      );
      return { ...issued, creditWarning };
    });
  }

  // FR-SIN-008: cancellation only with a mandatory reason, generating a
  // reversing ledger posting. Only clean of any payment/credit allocation —
  // an invoice with real money already applied to it is corrected with a
  // credit note, not erased with cancel.
  async cancel(tenantId: string, userId: string, invoiceId: string, reason: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      if (invoice.status !== 'ISSUED') {
        throw new BadRequestException({ code: 'invoice.not_cancellable', message: 'Only an issued, unpaid invoice can be cancelled.' });
      }
      if (invoice.allocatedTotal > 0n) {
        throw new BadRequestException({
          code: 'invoice.has_allocations',
          message: 'This invoice has payments or credits applied — use a credit note instead of cancelling.',
        });
      }

      await this.periods.assertPeriodOpen(tx, tenantId, new Date());
      const originalEntries = await tx.ledgerEntry.findMany({ where: { invoiceId } });
      await tx.ledgerEntry.createMany({
        data: originalEntries.map((e) => ({
          tenantId, invoiceId, accountId: e.accountId,
          debit: e.credit, credit: e.debit, // reversed
          narrative: `Cancellation of invoice ${invoice.number}: ${reason}`,
        })),
      });

      const cancelled = await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: 'CANCELLED', cancelledReason: reason, cancelledAt: new Date() },
      });
      await this.audit.write(tx, {
        tenantId, userId, action: 'invoice.cancelled', resourceType: 'Invoice',
        resourceId: invoiceId, before: { status: 'ISSUED' }, after: { status: 'CANCELLED', reason },
      });
      return cancelled;
    });
  }

  // Includes ledgerEntries (with the account each posted to) — the UI's
  // invoice detail panel shows the actual balanced posting behind an issued
  // invoice, not a rendering of the invoice total; this is where that data
  // comes from. A draft invoice simply has none yet (nothing posted).
  async get(tenantId: string, invoiceId: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: {
          lines: true, party: true, ledgerEntries: { include: { account: true } },
          deliveries: { orderBy: { createdAt: 'desc' } },
        },
      }),
    );
  }

  // FR-SIN-013 (Should): duplicate an invoice as the basis for a new draft.
  // Line amounts are copied verbatim, not recomputed — the source line
  // already applied the discount/VAT percentages that were correct at the
  // time, and copying avoids any chance of drift from a rounding recompute.
  async duplicate(tenantId: string, userId: string, invoiceId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const source = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: true } });
      return tx.invoice.create({
        data: {
          tenantId, partyId: source.partyId, status: 'DRAFT',
          netTotal: source.netTotal, vatTotal: source.vatTotal, grossTotal: source.grossTotal,
          purchaseOrderRef: source.purchaseOrderRef, notes: source.notes, terms: source.terms,
          lines: {
            create: source.lines.map((l) => ({
              tenantId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice,
              discountPct: l.discountPct, vatRatePct: l.vatRatePct, net: l.net, vat: l.vat, total: l.total,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  // FR-SIN-009: render the branded VAT-invoice PDF on demand. Not persisted —
  // regenerated fresh from the current invoice/tenant state on every call.
  async renderPdf(tenantId: string, invoiceId: string): Promise<Buffer> {
    const { invoice, profile, tenant } = await this.prisma.forTenant(tenantId, async (tx) => {
      const [invoice, profile, tenant] = await Promise.all([
        tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: true, party: true } }),
        tx.tenantFinanceProfile.findUnique({ where: { tenantId } }),
        tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      ]);
      return { invoice, profile, tenant };
    });
    const brand = await this.branding.resolve(tenantId);
    return this.pdf.generate(invoice, tenant.name, profile, brand.primaryColor);
  }

  // FR-SIN-010/011/012: email the invoice PDF to the customer and record the
  // attempt. Only ever reachable for an issued invoice — a draft has no
  // allocated number yet (FR-SIN-005) and a cancelled one has nothing to bill.
  async send(tenantId: string, userId: string, invoiceId: string, input: SendInvoiceInput) {
    const { invoice, profile, tenant } = await this.prisma.forTenant(tenantId, async (tx) => {
      const [invoice, profile, tenant] = await Promise.all([
        tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: true, party: true } }),
        tx.tenantFinanceProfile.findUnique({ where: { tenantId } }),
        tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      ]);
      return { invoice, profile, tenant };
    });
    if (invoice.status === 'DRAFT' || invoice.status === 'CANCELLED') {
      throw new BadRequestException({
        code: 'invoice.not_sendable',
        message: 'Only an issued invoice can be emailed to a customer.',
      });
    }

    const brand = await this.branding.resolve(tenantId);
    const pdfBuffer = await this.pdf.generate(invoice, tenant.name, profile, brand.primaryColor);
    const result = await this.emailProvider.send({
      to: input.to, cc: input.cc, bcc: input.bcc, subject: input.subject, body: input.body,
      attachment: { filename: `${invoice.number ?? 'invoice'}.pdf`, mimeType: 'application/pdf', buffer: pdfBuffer },
    });

    return this.prisma.forTenant(tenantId, async (tx) => {
      const delivery = await tx.invoiceDelivery.create({
        data: {
          tenantId, invoiceId, sentByUserId: userId,
          to: input.to, cc: input.cc ?? [], bcc: input.bcc ?? [],
          subject: input.subject, body: input.body, status: result.status,
        },
      });
      await this.audit.write(tx, {
        tenantId, userId, action: 'invoice.sent', resourceType: 'Invoice', resourceId: invoiceId,
        after: { to: input.to, status: result.status },
      });
      return delivery;
    });
  }

  // Includes party (name) — the invoice list is a table with a Customer
  // column, not just a list of ids.
  async list(tenantId: string, partyId?: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.invoice.findMany({
        where: partyId ? { partyId } : undefined,
        include: { party: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  // Sum of gross-minus-allocated across every non-cancelled, non-draft
  // invoice for a party, excluding the invoice currently being issued (which
  // isn't posted yet at the point this is called).
  private async outstandingBalance(tx: Prisma.TransactionClient, partyId: string, excludeInvoiceId: string): Promise<bigint> {
    const invoices = await tx.invoice.findMany({
      where: { partyId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, id: { not: excludeInvoiceId } },
    });
    return invoices.reduce((s, i) => s + (i.grossTotal - i.allocatedTotal), 0n);
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
