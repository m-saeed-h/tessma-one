import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';
import { NumberingService } from '../../../shared/numbering/numbering.service';
import { computeLine } from '../../../shared/money/money';

interface LineInput { description: string; quantity: number; unitPrice: number; discountPct?: number; vatRatePct?: number; }

@Injectable()
export class QuotationsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private numbering: NumberingService) {}

  // FR-QUO-001: created and issued as a branded PDF in the full spec; this
  // slice creates and numbers it (the document itself is Stage 3+ scope,
  // once the documents/template pairing described in Charter §7.8 rule 3 exists).
  async create(tenantId: string, userId: string, partyId: string, lines: LineInput[], expiryDate?: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const computed = lines.map((l) => ({
        ...l,
        ...computeLine({ quantity: l.quantity, unitPrice: BigInt(l.unitPrice), discountPct: l.discountPct ?? 0, vatRatePct: l.vatRatePct ?? 20 }),
      }));
      const netTotal = computed.reduce((s, l) => s + l.net, 0n);
      const vatTotal = computed.reduce((s, l) => s + l.vat, 0n);
      const number = await this.numbering.allocate(tx, tenantId, 'QUOTE', 'QUO');

      const quotation = await tx.quotation.create({
        data: {
          tenantId, partyId, number, status: 'SENT',
          expiryDate: expiryDate ? new Date(expiryDate) : undefined,
          netTotal, vatTotal, grossTotal: netTotal + vatTotal,
          lines: {
            create: computed.map((l) => ({
              tenantId, description: l.description, quantity: l.quantity, unitPrice: BigInt(l.unitPrice),
              discountPct: l.discountPct ?? 0, vatRatePct: l.vatRatePct ?? 20, net: l.net, vat: l.vat, total: l.total,
            })),
          },
        },
        include: { lines: true },
      });
      await this.audit.write(tx, {
        tenantId, userId, action: 'quotation.created', resourceType: 'Quotation',
        resourceId: quotation.id, after: { number },
      });
      return quotation;
    });
  }

  // FR-QUO-003: record acceptance or decline with date and actor.
  async decide(tenantId: string, userId: string, quotationId: string, decision: 'ACCEPTED' | 'DECLINED') {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const quotation = await tx.quotation.findUniqueOrThrow({ where: { id: quotationId } });
      if (quotation.status !== 'SENT') {
        throw new BadRequestException({ code: 'quotation.not_decidable', message: 'Only a sent quotation can be accepted or declined.' });
      }
      const updated = await tx.quotation.update({
        where: { id: quotationId },
        data: { status: decision, decidedAt: new Date() },
      });
      await this.audit.write(tx, {
        tenantId, userId, action: `quotation.${decision.toLowerCase()}`, resourceType: 'Quotation',
        resourceId: quotationId, after: { decision },
      });
      return updated;
    });
  }

  // FR-QUO-002: convert an accepted quotation into a draft invoice, retaining
  // line detail and a link back to the source. An expired quotation requires
  // an explicit override, audited (FR-QUO's spec note on expired conversion).
  async convertToInvoice(tenantId: string, userId: string, quotationId: string, allowExpired: boolean) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const quotation = await tx.quotation.findUniqueOrThrow({ where: { id: quotationId }, include: { lines: true } });
      if (quotation.status !== 'ACCEPTED') {
        throw new BadRequestException({ code: 'quotation.not_accepted', message: 'Only an accepted quotation can be converted.' });
      }
      const isExpired = quotation.expiryDate && quotation.expiryDate.getTime() < Date.now();
      if (isExpired && !allowExpired) {
        throw new BadRequestException({
          code: 'quotation.expired',
          message: 'This quotation has expired. Resubmit with allowExpired: true to convert it anyway.',
        });
      }

      const invoice = await tx.invoice.create({
        data: {
          tenantId, partyId: quotation.partyId, status: 'DRAFT', sourceQuotationId: quotation.id,
          netTotal: quotation.netTotal, vatTotal: quotation.vatTotal, grossTotal: quotation.grossTotal,
          lines: {
            create: quotation.lines.map((l) => ({
              tenantId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice,
              discountPct: l.discountPct, vatRatePct: l.vatRatePct, net: l.net, vat: l.vat, total: l.total,
            })),
          },
        },
        include: { lines: true },
      });
      await this.audit.write(tx, {
        tenantId, userId, action: 'quotation.converted', resourceType: 'Quotation',
        resourceId: quotationId, after: { invoiceId: invoice.id, expiredOverride: !!isExpired },
      });
      return invoice;
    });
  }

  async list(tenantId: string, partyId?: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.quotation.findMany({ where: partyId ? { partyId } : undefined, orderBy: { createdAt: 'desc' } }),
    );
  }
}
