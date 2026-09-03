import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../permissions/permissions.decorators';
import { PERMISSIONS } from '../permissions/permissions.registry';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { validate } from '../../shared/validation/validate';
import { serialise } from '../../shared/http/serialise';
import { WorkflowService } from './workflow.service';

const approvalRuleSchema = z.object({
  subjectType: z.string().trim().min(1).max(100),
  minAmountPence: z.number().int().min(0).optional(),
  steps: z.array(z.object({
    sequence: z.number().int().positive(),
    approverRole: z.string().trim().min(1).max(50),
  })).min(1).max(10),
});

const submitSchema = z.object({
  subjectType: z.string().trim().min(1).max(100),
  subjectId: z.string().trim().min(1).max(200),
  amountPence: z.number().int().min(0).optional(),
});

const decideSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().trim().max(2000).optional(),
});

@Controller('approvals')
export class WorkflowController {
  constructor(private workflow: WorkflowService, private prisma: PrismaService) {}

  // Tenant configuration (Charter §5.2 "rules are tenant configuration",
  // FR-APR-001) — who approves what for a given subjectType and above what
  // amount, and the sequence of roles that must sign off.
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @Post('rules')
  async upsertRule(@Req() req: any, @Body() body: unknown) {
    const b = validate(approvalRuleSchema, body);
    const { tenantId } = req.ctx;
    const rule = await this.prisma.forTenant(tenantId, (tx) =>
      tx.approvalRule.upsert({
        where: { tenantId_subjectType: { tenantId, subjectType: b.subjectType } },
        update: {
          minAmount: b.minAmountPence !== undefined ? BigInt(b.minAmountPence) : null,
          steps: b.steps,
          active: true,
        },
        create: {
          tenantId, subjectType: b.subjectType,
          minAmount: b.minAmountPence !== undefined ? BigInt(b.minAmountPence) : null,
          steps: b.steps,
        },
      }),
    );
    return serialise(rule);
  }

  // Any authenticated user/module submits a subject for approval — the
  // generic platform capability a future expense claim or payment run will
  // call into (no Finance-specific code lives here, per FR-APR-009).
  @Post('submit')
  async submit(@Req() req: any, @Body() body: unknown) {
    const b = validate(submitSchema, body);
    const { tenantId, userId } = req.ctx;
    const result = await this.prisma.forTenant(tenantId, (tx) =>
      this.workflow.submitForApproval(
        tx, tenantId, b.subjectType, b.subjectId, userId,
        b.amountPence !== undefined ? BigInt(b.amountPence) : undefined,
      ),
    );
    return serialise(result);
  }

  @RequirePermissions(PERMISSIONS.APPROVAL_ACT)
  @Get()
  async myQueue(@Req() req: any) {
    return serialise(await this.workflow.myQueue(req.ctx.tenantId, req.ctx.userId));
  }

  @RequirePermissions(PERMISSIONS.APPROVAL_ACT)
  @Post(':id/decide')
  async decide(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(decideSchema, body);
    return this.workflow.decide(req.ctx.tenantId, id, req.ctx.userId, b.decision, b.comment);
  }
}
