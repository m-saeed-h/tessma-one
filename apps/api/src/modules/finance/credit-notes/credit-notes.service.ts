import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';
import { NumberingService } from '../../../shared/numbering/numbering.service';
import { PeriodsService } from '../../../shared/periods/periods.service';
import { computeLine, penceToGBP } from '../../../shared/money/money';

interface LineInput { description: string; quantity: number; unitPrice: number; vatRatePct?: number; }
interface CreateInput {
  partyId: string; invoiceId?: string; reasonCode: string; reasonText: string; lines: LineInput[];
}

@Injectable()
export class CreditNotesService {
  constructor(
    private prisma: PrismaService, private audit: AuditService,
    private numbering: NumberingService, private periods: PeriodsService,
  ) {}

  // FR-CRN-001 to 005: full, partial or line-level credit note against an
  // invoice, or standalone. Always posts a reversing ledger entry — the
  // original invoice's postings are never touched (BR-FIN-04). A BAD_DEBT
  // credit posts to the bad-debt expense account instead of reversing Sales
  // (the sale happened; it's the collectability that failed) with the VAT
  // portion posted as VAT relief — FR-CRN-008.
  async create(tenantId: string, userId: string, b: CreateInput) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const computed = b.lines.map((l) => ({
        ...l,
        ...computeLine({ quantity: l.quantity, unitPrice: BigInt(l.unitPrice), discountPct: 0, vatRatePct: l.vatRatePct ?? 20 }),
      }));
      const netTotal = computed.reduce((s, l) => s + l.net, 0n);
      const vatTotal = computed.reduce((s, l) => s + l.vat, 0n);
      const grossTotal = netTotal + vatTotal;

      const number = await this.numbering.allocate(tx, tenantId, 'CREDIT_NOTE', 'CN');
      const creditNote = await tx.creditNote.create({
        data: {
          tenantId, partyId: b.partyId, invoiceId: b.invoiceId, number, status: 'ISSUED',
          reasonCode: b.reasonCode, reasonText: b.reasonText, issueDate: new Date(),
          netTotal, vatTotal, grossTotal,
          lines: {
            create: computed.map((l) => ({
              tenantId, description: l.description, quantity: l.quantity, unitPrice: BigInt(l.unitPrice),
              vatRatePct: l.vatRatePct ?? 20, net: l.net, vat: l.vat, total: l.total,
            })),
          },
        },
      });

      const accounts = await tx.account.findMany({ where: { tenantId } });
      const acc = (code: string) => {
        const a = accounts.find((x) => x.code === code);
        if (!a) throw new BadRequestException(`Missing account ${code}`);
        return a.id;
      };

      const entries = b.reasonCode === 'BAD_DEBT'
        ? [
            { accountId: acc('1100'), debit: 0n, credit: grossTotal, narrative: `Credit note ${number} (bad debt write-off)` },
            { accountId: acc('7900'), debit: netTotal, credit: 0n, narrative: `Credit note ${number} (bad debt write-off)` },
            { accountId: acc('2200'), debit: vatTotal, credit: 0n, narrative: `Credit note ${number} (VAT relief)` },
          ]
        : [
            { accountId: acc('1100'), debit: 0n, credit: grossTotal, narrative: `Credit note ${number}` },
            { accountId: acc('4000'), debit: netTotal, credit: 0n, narrative: `Credit note ${number}` },
            { accountId: acc('2200'), debit: vatTotal, credit: 0n, narrative: `Credit note ${number}` },
          ];
      const debits = entries.reduce((s, e) => s + e.debit, 0n);
      const credits = entries.reduce((s, e) => s + e.credit, 0n);
      if (debits !== credits) throw new Error('Ledger not balanced — refusing to post');

      await this.periods.assertPeriodOpen(tx, tenantId, new Date());
      await tx.ledgerEntry.createMany({
        data: entries.map((e) => ({ ...e, tenantId, creditNoteId: creditNote.id })),
      });
      await this.audit.write(tx, {
        tenantId, userId, action: 'creditnote.issued', resourceType: 'CreditNote',
        resourceId: creditNote.id, after: { number, grossTotal: grossTotal.toString(), reasonCode: b.reasonCode },
      });
      return creditNote;
    });
  }

  // FR-CRN-006: allocate this credit note's unallocated balance to a
  // specific invoice, reducing what the customer still owes on it.
  async allocateToInvoice(tenantId: string, userId: string, creditNoteId: string, invoiceId: string, amountPence: number) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const creditNote = await tx.creditNote.findUniqueOrThrow({ where: { id: creditNoteId } });
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      const amount = BigInt(amountPence);

      const creditRemaining = creditNote.grossTotal - creditNote.allocatedTotal;
      const invoiceOutstanding = invoice.grossTotal - invoice.allocatedTotal;
      if (amount > creditRemaining) {
        throw new BadRequestException({
          code: 'creditnote.exceeds_remaining',
          message: `Only ${penceToGBP(creditRemaining)} of this credit note is unallocated.`,
        });
      }
      if (amount > invoiceOutstanding) {
        throw new BadRequestException({
          code: 'creditnote.exceeds_invoice_outstanding',
          message: `The invoice only has ${penceToGBP(invoiceOutstanding)} outstanding.`,
        });
      }

      const [updatedCreditNote, updatedInvoice] = await Promise.all([
        tx.creditNote.update({ where: { id: creditNoteId }, data: { allocatedTotal: creditNote.allocatedTotal + amount } }),
        tx.invoice.update({
          where: { id: invoiceId },
          data: {
            allocatedTotal: invoice.allocatedTotal + amount,
            status: invoice.allocatedTotal + amount >= invoice.grossTotal ? 'PAID' : 'PARTIALLY_PAID',
          },
        }),
      ]);
      await this.audit.write(tx, {
        tenantId, userId, action: 'creditnote.allocated', resourceType: 'CreditNote',
        resourceId: creditNoteId, after: { invoiceId, amountPence },
      });
      return { creditNote: updatedCreditNote, invoice: updatedInvoice };
    });
  }

  async list(tenantId: string, partyId?: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.creditNote.findMany({
        where: partyId ? { partyId } : undefined,
        include: { party: true, lines: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }
}
