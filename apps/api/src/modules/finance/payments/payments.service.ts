import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';
import { penceToGBP } from '../../../shared/money/money';

interface AllocationInput { invoiceId: string; amountPence: number; }
interface RecordPaymentInput {
  partyId: string; method: string; reference?: string; amountPence: number;
  receivedDate?: string; allocations?: AllocationInput[];
}

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // FR-ARC-003/004/005: record a receipt, then allocate it across one or
  // more invoices (fully or partially), with any unallocated remainder held
  // on account. The cash receipt itself (Dr Bank / Cr Debtors) posts
  // immediately and is independent of allocation — that's a subledger
  // concern (which invoice(s) it clears), same pattern as invoice issuance
  // posting one Debtors line regardless of which invoice.
  async record(tenantId: string, userId: string, b: RecordPaymentInput) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const amount = BigInt(b.amountPence);
      const payment = await tx.payment.create({
        data: {
          tenantId, partyId: b.partyId, method: b.method, reference: b.reference,
          amount, unallocated: amount,
          receivedDate: b.receivedDate ? new Date(b.receivedDate) : new Date(),
        },
      });

      const accounts = await tx.account.findMany({ where: { tenantId } });
      const acc = (code: string) => {
        const a = accounts.find((x) => x.code === code);
        if (!a) throw new BadRequestException(`Missing account ${code}`);
        return a.id;
      };
      const narrative = `Payment received${b.reference ? `: ${b.reference}` : ''}`;
      await tx.ledgerEntry.createMany({
        data: [
          { tenantId, paymentId: payment.id, accountId: acc('1200'), debit: amount, credit: 0n, narrative },
          { tenantId, paymentId: payment.id, accountId: acc('1100'), debit: 0n, credit: amount, narrative },
        ],
      });
      await this.audit.write(tx, {
        tenantId, userId, action: 'payment.recorded', resourceType: 'Payment',
        resourceId: payment.id, after: { amountPence: b.amountPence, method: b.method },
      });

      let current = payment;
      for (const allocation of b.allocations ?? []) {
        current = await this.applyAllocation(tx, tenantId, userId, current, allocation.invoiceId, allocation.amountPence);
      }
      return current;
    });
  }

  // FR-ARC-006: allocation may never exceed the lesser of the payment's
  // unallocated amount and the invoice's outstanding balance (BR-FIN-07).
  async allocate(tenantId: string, userId: string, paymentId: string, invoiceId: string, amountPence: number) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      return this.applyAllocation(tx, tenantId, userId, payment, invoiceId, amountPence);
    });
  }

  private async applyAllocation(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    payment: { id: string; unallocated: bigint },
    invoiceId: string,
    amountPence: number,
  ) {
    const amount = BigInt(amountPence);
    if (amount > payment.unallocated) {
      throw new BadRequestException({
        code: 'payment.exceeds_unallocated',
        message: `Only ${penceToGBP(payment.unallocated)} of this payment is unallocated.`,
      });
    }
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const outstanding = invoice.grossTotal - invoice.allocatedTotal;
    if (amount > outstanding) {
      throw new BadRequestException({
        code: 'payment.exceeds_invoice_outstanding',
        message: `The invoice only has ${penceToGBP(outstanding)} outstanding.`,
      });
    }

    await tx.paymentAllocation.create({ data: { tenantId, paymentId: payment.id, invoiceId, amount } });
    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: { unallocated: payment.unallocated - amount },
    });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        allocatedTotal: invoice.allocatedTotal + amount,
        status: invoice.allocatedTotal + amount >= invoice.grossTotal ? 'PAID' : 'PARTIALLY_PAID',
      },
    });
    await this.audit.write(tx, {
      tenantId, userId, action: 'payment.allocated', resourceType: 'Payment',
      resourceId: payment.id, after: { invoiceId, amountPence },
    });
    return updatedPayment;
  }

  // Includes party (name) and each allocation's invoice (number) — the UI
  // renders "£60 to INV-00002", not raw ids.
  async list(tenantId: string, partyId?: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.payment.findMany({
        where: partyId ? { partyId } : undefined,
        include: { party: true, allocations: { include: { invoice: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }
}
