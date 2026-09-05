import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';
import { PeriodsService } from '../../../shared/periods/periods.service';
import { penceToGBP } from '../../../shared/money/money';

interface RecordInput { supplierId: string; method: string; reference?: string; amountPence: number; paidDate?: string; }

// FR-PIN-012: the accounts-payable mirror of payments.service.ts — a
// supplier payment posts immediately (Dr Trade Creditors / Cr Bank) and is
// independent of allocation, exactly like a customer receipt.
@Injectable()
export class SupplierPaymentsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private periods: PeriodsService) {}

  async record(tenantId: string, userId: string, b: RecordInput) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const amount = BigInt(b.amountPence);
      const paidDate = b.paidDate ? new Date(b.paidDate) : new Date();
      await this.periods.assertPeriodOpen(tx, tenantId, paidDate);

      const payment = await tx.supplierPayment.create({
        data: { tenantId, supplierId: b.supplierId, method: b.method, reference: b.reference, amount, unallocated: amount, paidDate },
      });
      const accounts = await tx.account.findMany({ where: { tenantId } });
      const acc = (code: string) => {
        const a = accounts.find((x) => x.code === code);
        if (!a) throw new BadRequestException(`Missing account ${code}`);
        return a.id;
      };
      const narrative = `Supplier payment${b.reference ? `: ${b.reference}` : ''}`;
      await tx.ledgerEntry.createMany({
        data: [
          { tenantId, supplierPaymentId: payment.id, accountId: acc('2100'), debit: amount, credit: 0n, narrative },
          { tenantId, supplierPaymentId: payment.id, accountId: acc('1200'), debit: 0n, credit: amount, narrative },
        ],
      });
      await this.audit.write(tx, {
        tenantId, userId, action: 'supplierpayment.recorded', resourceType: 'SupplierPayment',
        resourceId: payment.id, after: { amountPence: b.amountPence, method: b.method },
      });
      return payment;
    });
  }

  async allocate(tenantId: string, userId: string, supplierPaymentId: string, purchaseInvoiceId: string, amountPence: number) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const payment = await tx.supplierPayment.findUniqueOrThrow({ where: { id: supplierPaymentId } });
      const amount = BigInt(amountPence);
      if (amount > payment.unallocated) {
        throw new BadRequestException({
          code: 'supplierpayment.exceeds_unallocated',
          message: `Only ${penceToGBP(payment.unallocated)} of this payment is unallocated.`,
        });
      }
      const invoice = await tx.purchaseInvoice.findUniqueOrThrow({ where: { id: purchaseInvoiceId } });
      const outstanding = invoice.grossTotal - invoice.allocatedTotal;
      if (amount > outstanding) {
        throw new BadRequestException({
          code: 'supplierpayment.exceeds_invoice_outstanding',
          message: `The invoice only has ${penceToGBP(outstanding)} outstanding.`,
        });
      }

      await tx.supplierPaymentAllocation.create({ data: { tenantId, supplierPaymentId, purchaseInvoiceId, amount } });
      const updatedPayment = await tx.supplierPayment.update({ where: { id: supplierPaymentId }, data: { unallocated: payment.unallocated - amount } });
      await tx.purchaseInvoice.update({
        where: { id: purchaseInvoiceId },
        data: {
          allocatedTotal: invoice.allocatedTotal + amount,
          status: invoice.allocatedTotal + amount >= invoice.grossTotal ? 'PAID' : 'PARTIALLY_PAID',
        },
      });
      await this.audit.write(tx, {
        tenantId, userId, action: 'supplierpayment.allocated', resourceType: 'SupplierPayment',
        resourceId: supplierPaymentId, after: { purchaseInvoiceId, amountPence },
      });
      return updatedPayment;
    });
  }

  async list(tenantId: string, supplierId?: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const payments = await tx.supplierPayment.findMany({
        where: supplierId ? { supplierId } : undefined,
        include: { allocations: { include: { purchaseInvoice: true } } },
        orderBy: { createdAt: 'desc' },
      });
      const supplierIds = [...new Set(payments.map((p) => p.supplierId))];
      const suppliers = await tx.party.findMany({ where: { id: { in: supplierIds } } });
      const nameById = new Map(suppliers.map((s) => [s.id, s.legalName]));
      return payments.map((p) => ({ ...p, supplierName: nameById.get(p.supplierId) ?? 'Unknown supplier' }));
    });
  }
}
