import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface ApprovalStep {
  sequence: number;
  approverRole: string;
}

// Charter §5.2 platform/workflow: "reusable approval and state machine
// engine." FR-APR-009: Finance approvals must use this, never re-implement
// their own — so this is deliberately generic. `subjectType` is an opaque
// string like "finance.expense"; the engine has no idea what an expense is.
@Injectable()
export class WorkflowService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // Called by a module when a subject needs approval. If the tenant hasn't
  // configured a rule for this subjectType, there is nothing to approve
  // against — the subject is auto-approved rather than stuck forever, so a
  // tenant that hasn't set up approvals isn't blocked from working
  // (mirrors FR-APR-001's rules being tenant configuration, not mandatory).
  async submitForApproval(
    tx: Prisma.TransactionClient,
    tenantId: string,
    subjectType: string,
    subjectId: string,
    submittedByUserId: string,
    amount?: bigint,
  ): Promise<{ id: string; status: 'APPROVED' | 'PENDING' }> {
    const rule = await tx.approvalRule.findFirst({ where: { tenantId, subjectType, active: true } });
    const applies = !!rule && (rule.minAmount === null || (amount !== undefined && amount >= rule.minAmount));

    if (!applies) {
      const request = await tx.approvalRequest.create({
        data: {
          tenantId, subjectType, subjectId, submittedByUserId, amount,
          status: 'APPROVED', currentStep: 0, decidedAt: new Date(),
        },
      });
      return { id: request.id, status: 'APPROVED' };
    }

    const request = await tx.approvalRequest.create({
      data: { tenantId, subjectType, subjectId, submittedByUserId, amount, status: 'PENDING', currentStep: 1 },
    });
    return { id: request.id, status: 'PENDING' };
  }

  async decide(
    tenantId: string,
    requestId: string,
    approverId: string,
    decision: 'APPROVED' | 'REJECTED',
    comment?: string,
  ) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const request = await tx.approvalRequest.findUniqueOrThrow({ where: { id: requestId } });
      if (request.status !== 'PENDING') {
        throw new BadRequestException({ code: 'approval.not_pending', message: 'This request has already been decided.' });
      }
      // FR-APR-004: a user cannot approve an item they submitted.
      if (request.submittedByUserId === approverId) {
        throw new ForbiddenException({ code: 'approval.self_approval', message: 'You cannot approve your own submission.' });
      }

      const rule = await tx.approvalRule.findFirstOrThrow({ where: { tenantId, subjectType: request.subjectType } });
      const steps = (rule.steps as unknown as ApprovalStep[]).slice().sort((a, b) => a.sequence - b.sequence);
      const step = steps.find((s) => s.sequence === request.currentStep);
      if (!step) throw new BadRequestException({ code: 'approval.invalid_step', message: 'No such approval step.' });

      const holdsRole = await tx.userRole.findFirst({
        where: { tenantId, userId: approverId, role: { name: step.approverRole } },
      });
      if (!holdsRole) {
        throw new ForbiddenException({
          code: 'approval.wrong_role',
          message: `This step requires the ${step.approverRole} role.`,
        });
      }

      await tx.approvalDecision.create({
        data: { tenantId, requestId, step: request.currentStep, approverId, decision, comment },
      });
      await this.audit.write(tx, {
        tenantId, userId: approverId, action: `approval.${decision.toLowerCase()}`,
        resourceType: 'ApprovalRequest', resourceId: requestId, after: { step: request.currentStep, decision, comment },
      });

      if (decision === 'REJECTED') {
        await tx.approvalRequest.update({ where: { id: requestId }, data: { status: 'REJECTED', decidedAt: new Date() } });
        return { status: 'REJECTED' as const };
      }

      const isLastStep = request.currentStep >= steps.length;
      if (isLastStep) {
        await tx.approvalRequest.update({ where: { id: requestId }, data: { status: 'APPROVED', decidedAt: new Date() } });
        return { status: 'APPROVED' as const };
      }
      await tx.approvalRequest.update({ where: { id: requestId }, data: { currentStep: request.currentStep + 1 } });
      return { status: 'PENDING' as const };
    });
  }

  // Items awaiting a decision from THIS user specifically: pending, at a
  // step whose required role this user holds, and not self-submitted.
  async myQueue(tenantId: string, userId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const userRoles = await tx.userRole.findMany({ where: { tenantId, userId }, include: { role: true } });
      const roleNames = new Set(userRoles.map((r) => r.role.name));

      const pending = await tx.approvalRequest.findMany({ where: { tenantId, status: 'PENDING' } });
      const result = [];
      for (const request of pending) {
        if (request.submittedByUserId === userId) continue;
        const rule = await tx.approvalRule.findFirst({ where: { tenantId, subjectType: request.subjectType } });
        const steps = rule?.steps as unknown as ApprovalStep[] | undefined;
        const step = steps?.find((s) => s.sequence === request.currentStep);
        if (step && roleNames.has(step.approverRole)) result.push(request);
      }
      return result;
    });
  }
}
