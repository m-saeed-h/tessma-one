import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';
import { WorkflowService } from '../../../core/workflow/workflow.service';
import { PeriodsService } from '../../../shared/periods/periods.service';
import { roundDivHalfUp } from '../../../shared/money/money';

interface CreateExpenseInput {
  category: string; date: string; description: string; grossPence: number; vatRatePct?: number;
  paymentMethod: string; supplierId?: string; receiptDocId?: string; vatRecoverable?: boolean;
}

// FR-EXP-001 to 010: manual expense capture, submission and approval,
// reusing the shared platform workflow engine (FR-APR-009) rather than
// re-implementing approval logic here — this module is only the first
// Finance feature to actually submit into it. Receipt OCR/AI extraction
// (FR-EXP-003/004) is Phase 3; this is the manual path every extracted
// receipt still lands in.
@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService, private audit: AuditService,
    private workflow: WorkflowService, private periods: PeriodsService,
  ) {}

  async create(tenantId: string, userId: string, input: CreateExpenseInput) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const gross = BigInt(input.grossPence);
      // FR-EXP-008: recoverable only with a receipt attached (and, where a
      // merchant/supplier is on record, only if that party carries a VAT
      // number) — never just because the submitter ticked a box.
      let vatRecoverable = !!input.vatRecoverable && !!input.receiptDocId;
      if (vatRecoverable && input.supplierId) {
        const supplier = await tx.party.findUnique({ where: { id: input.supplierId } });
        vatRecoverable = !!supplier?.vatNumber;
      }
      const vatRatePct = BigInt(input.vatRatePct ?? 20);
      const vat = vatRecoverable ? roundDivHalfUp(gross * vatRatePct, 100n + vatRatePct) : 0n;
      const net = gross - vat;

      return tx.expense.create({
        data: {
          tenantId, userId, supplierId: input.supplierId, category: input.category,
          date: new Date(input.date), description: input.description,
          net, vat, gross, vatRecoverable, paymentMethod: input.paymentMethod,
          receiptDocId: input.receiptDocId, status: 'DRAFT',
        },
      });
    });
  }

  // FR-EXP-006 is satisfied at the UI layer (select several DRAFT expenses,
  // submit each) rather than a group entity — the domain event that matters
  // is "submitted for approval", and the workflow engine already handles a
  // multi-item queue.
  async submit(tenantId: string, userId: string, expenseId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const expense = await tx.expense.findUniqueOrThrow({ where: { id: expenseId } });
      if (expense.userId !== userId) {
        throw new ForbiddenException({ code: 'expense.not_yours', message: 'You can only submit your own expenses.' });
      }
      if (expense.status !== 'DRAFT') {
        throw new BadRequestException({ code: 'expense.not_draft', message: 'Only a draft expense can be submitted.' });
      }

      const result = await this.workflow.submitForApproval(tx, tenantId, 'finance.expense', expenseId, userId, expense.gross);
      if (result.status === 'APPROVED') {
        return this.postAndApprove(tx, tenantId, expense);
      }
      return tx.expense.update({ where: { id: expenseId }, data: { status: 'SUBMITTED', submittedAt: new Date() } });
    });
  }

  // FR-APR-004/005 live in WorkflowService; this only reacts to the outcome
  // by posting the ledger (or not) — approvals infrastructure is shared,
  // what an approval unlocks is this module's own business.
  async decide(tenantId: string, approverId: string, expenseId: string, decision: 'APPROVED' | 'REJECTED', comment?: string) {
    const request = await this.prisma.forTenant(tenantId, (tx) =>
      tx.approvalRequest.findFirstOrThrow({ where: { tenantId, subjectType: 'finance.expense', subjectId: expenseId } }),
    );
    const result = await this.workflow.decide(tenantId, request.id, approverId, decision, comment);

    return this.prisma.forTenant(tenantId, async (tx) => {
      const expense = await tx.expense.findUniqueOrThrow({ where: { id: expenseId } });
      if (result.status === 'REJECTED') {
        return tx.expense.update({ where: { id: expenseId }, data: { status: 'REJECTED', decidedAt: new Date() } });
      }
      if (result.status === 'APPROVED') {
        return this.postAndApprove(tx, tenantId, expense);
      }
      return expense; // still PENDING at a later step
    });
  }

  private async postAndApprove(tx: Prisma.TransactionClient, tenantId: string, expense: { id: string; net: bigint; vat: bigint; gross: bigint; paymentMethod: string }) {
    await this.periods.assertPeriodOpen(tx, tenantId, new Date());
    const accounts = await tx.account.findMany({ where: { tenantId } });
    const acc = (code: string) => {
      const a = accounts.find((x) => x.code === code);
      if (!a) throw new BadRequestException(`Missing account ${code}`);
      return a.id;
    };
    const creditAccount = expense.paymentMethod === 'COMPANY_CARD' ? acc('1200') : acc('2110');
    const narrative = `Expense ${expense.id.slice(0, 8)}`;
    const entries = [
      { accountId: acc('6000'), debit: expense.net, credit: 0n, narrative },
      ...(expense.vat > 0n ? [{ accountId: acc('1300'), debit: expense.vat, credit: 0n, narrative }] : []),
      { accountId: creditAccount, debit: 0n, credit: expense.gross, narrative },
    ];
    await tx.ledgerEntry.createMany({ data: entries.map((e) => ({ ...e, tenantId, expenseId: expense.id })) });
    return tx.expense.update({ where: { id: expense.id }, data: { status: 'APPROVED', decidedAt: new Date() } });
  }

  async listMine(tenantId: string, userId: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.expense.findMany({ where: { tenantId, userId }, orderBy: { createdAt: 'desc' } }),
    );
  }

  async listAll(tenantId: string) {
    return this.prisma.forTenant(tenantId, (tx) => tx.expense.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }));
  }

  // Pending approvals, hydrated with the Expense row so the UI shows
  // category/amount/description, not a bare ApprovalRequest.
  async pendingApprovals(tenantId: string, userId: string) {
    const requests = await this.workflow.myQueue(tenantId, userId);
    const expenseRequests = requests.filter((r) => r.subjectType === 'finance.expense');
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.expense.findMany({ where: { tenantId, id: { in: expenseRequests.map((r) => r.subjectId) } } }),
    );
  }
}
