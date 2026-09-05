import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { RequirePermissions } from '../../../core/permissions/permissions.decorators';
import { PERMISSIONS } from '../../../core/permissions/permissions.registry';
import { RequireEntitlement } from '../../../core/subscriptions/entitlements.decorators';
import { FEATURE_KEYS } from '../../../core/subscriptions/entitlements.registry';
import { validate } from '../../../shared/validation/validate';
import { financeProfileSchema } from '../../../shared/validation/schemas';
import { FinanceSettingsService } from './settings.service';

@Controller('finance/settings')
@RequireEntitlement(FEATURE_KEYS.FINANCE)
export class FinanceSettingsController {
  constructor(private settings: FinanceSettingsService) {}

  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @Get()
  async get(@Req() req: any) {
    return this.settings.get(req.ctx.tenantId);
  }

  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @Put()
  async upsert(@Req() req: any, @Body() body: unknown) {
    const b = validate(financeProfileSchema, body);
    return this.settings.upsert(req.ctx.tenantId, b);
  }
}
