import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../../../core/permissions/permissions.decorators';
import { PERMISSIONS } from '../../../core/permissions/permissions.registry';
import { RequireEntitlement } from '../../../core/subscriptions/entitlements.decorators';
import { FEATURE_KEYS } from '../../../core/subscriptions/entitlements.registry';
import { validate } from '../../../shared/validation/validate';
import { serialise } from '../../../shared/http/serialise';
import { PeriodsService } from '../../../shared/periods/periods.service';

const generateYearSchema = z.object({
  startYear: z.number().int().min(2000).max(2100),
  startMonth: z.number().int().min(1).max(12),
  startDay: z.number().int().min(1).max(31),
});

@Controller('finance/periods')
@RequireEntitlement(FEATURE_KEYS.FINANCE)
export class PeriodsController {
  constructor(private periods: PeriodsService) {}

  @RequirePermissions(PERMISSIONS.PERIOD_READ)
  @Get()
  async list(@Req() req: any) {
    return serialise(await this.periods.list(req.ctx.tenantId));
  }

  // FR-SET-001: generates twelve monthly periods for one financial year.
  @RequirePermissions(PERMISSIONS.PERIOD_MANAGE)
  @Post('generate')
  async generate(@Req() req: any, @Body() body: unknown) {
    const b = validate(generateYearSchema, body);
    return serialise(await this.periods.generateYear(req.ctx.tenantId, b.startYear, b.startMonth, b.startDay));
  }

  @RequirePermissions(PERMISSIONS.PERIOD_MANAGE)
  @Post(':id/close')
  async close(@Req() req: any, @Param('id') id: string) {
    return serialise(await this.periods.close(req.ctx.tenantId, req.ctx.userId, id));
  }

  // FR-SET-012: reopening is a distinct, more sensitive permission.
  @RequirePermissions(PERMISSIONS.PERIOD_REOPEN)
  @Post(':id/reopen')
  async reopen(@Req() req: any, @Param('id') id: string) {
    return serialise(await this.periods.reopen(req.ctx.tenantId, req.ctx.userId, id));
  }
}
