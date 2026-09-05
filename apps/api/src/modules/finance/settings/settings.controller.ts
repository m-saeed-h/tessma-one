import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { RequirePermissions } from '../../../core/permissions/permissions.decorators';
import { PERMISSIONS } from '../../../core/permissions/permissions.registry';
import { RequireEntitlement } from '../../../core/subscriptions/entitlements.decorators';
import { FEATURE_KEYS } from '../../../core/subscriptions/entitlements.registry';
import { validate } from '../../../shared/validation/validate';
import { financeProfileSchema, numberingSchemeSchema } from '../../../shared/validation/schemas';
import { serialise } from '../../../shared/http/serialise';
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

  // FR-SET-004: numbering scheme configuration, per document type.
  @RequirePermissions(PERMISSIONS.NUMBERING_MANAGE)
  @Get('numbering')
  async listNumbering(@Req() req: any) {
    return serialise(await this.settings.listNumberingSchemes(req.ctx.tenantId));
  }

  @RequirePermissions(PERMISSIONS.NUMBERING_MANAGE)
  @Put('numbering/:docType')
  async configureNumbering(@Req() req: any, @Param('docType') docType: string, @Body() body: unknown) {
    const b = validate(numberingSchemeSchema, body);
    return serialise(await this.settings.configureNumbering(req.ctx.tenantId, docType, b));
  }
}
