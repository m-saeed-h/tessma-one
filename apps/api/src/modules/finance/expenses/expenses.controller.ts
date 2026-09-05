import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../../../core/permissions/permissions.decorators';
import { PERMISSIONS } from '../../../core/permissions/permissions.registry';
import { RequireEntitlement } from '../../../core/subscriptions/entitlements.decorators';
import { FEATURE_KEYS } from '../../../core/subscriptions/entitlements.registry';
import { validate } from '../../../shared/validation/validate';
import { serialise } from '../../../shared/http/serialise';
import { ExpensesService } from './expenses.service';

const createExpenseSchema = z.object({
  category: z.string().trim().min(1).max(100),
  date: z.string().datetime(),
  description: z.string().trim().min(1).max(500),
  grossPence: z.number().int().positive(),
  vatRatePct: z.number().int().min(0).max(100).optional(),
  paymentMethod: z.enum(['COMPANY_CARD', 'EMPLOYEE_PAID', 'CASH']),
  supplierId: z.string().uuid().optional(),
  receiptDocId: z.string().uuid().optional(),
  vatRecoverable: z.boolean().optional(),
});
const decideSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), comment: z.string().trim().max(1000).optional() });

@Controller('expenses')
@RequireEntitlement(FEATURE_KEYS.FINANCE)
export class ExpensesController {
  constructor(private expenses: ExpensesService) {}

  @RequirePermissions(PERMISSIONS.EXPENSE_SUBMIT)
  @Post()
  async create(@Req() req: any, @Body() body: unknown) {
    const b = validate(createExpenseSchema, body);
    return serialise(await this.expenses.create(req.ctx.tenantId, req.ctx.userId, b));
  }

  @RequirePermissions(PERMISSIONS.EXPENSE_SUBMIT)
  @Post(':id/submit')
  async submit(@Req() req: any, @Param('id') id: string) {
    return serialise(await this.expenses.submit(req.ctx.tenantId, req.ctx.userId, id));
  }

  @RequirePermissions(PERMISSIONS.EXPENSE_APPROVE)
  @Post(':id/decide')
  async decide(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(decideSchema, body);
    return serialise(await this.expenses.decide(req.ctx.tenantId, req.ctx.userId, id, b.decision, b.comment));
  }

  // FR-EXP: "I can see the status of my claim at any time" — every holder
  // of EXPENSE_READ (including a plain Employee) sees their own claims.
  @RequirePermissions(PERMISSIONS.EXPENSE_READ)
  @Get('mine')
  async mine(@Req() req: any) {
    return serialise(await this.expenses.listMine(req.ctx.tenantId, req.ctx.userId));
  }

  @RequirePermissions(PERMISSIONS.EXPENSE_APPROVE)
  @Get()
  async all(@Req() req: any) {
    return serialise(await this.expenses.listAll(req.ctx.tenantId));
  }

  @RequirePermissions(PERMISSIONS.EXPENSE_APPROVE)
  @Get('pending')
  async pending(@Req() req: any) {
    return serialise(await this.expenses.pendingApprovals(req.ctx.tenantId, req.ctx.userId));
  }
}
