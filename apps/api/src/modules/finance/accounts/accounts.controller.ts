import { Controller, Get, Req } from '@nestjs/common';
import { RequirePermissions } from '../../../core/permissions/permissions.decorators';
import { PERMISSIONS } from '../../../core/permissions/permissions.registry';
import { RequireEntitlement } from '../../../core/subscriptions/entitlements.decorators';
import { FEATURE_KEYS } from '../../../core/subscriptions/entitlements.registry';
import { serialise } from '../../../shared/http/serialise';
import { AccountsService } from './accounts.service';

@Controller('accounts')
@RequireEntitlement(FEATURE_KEYS.FINANCE)
export class AccountsController {
  constructor(private accounts: AccountsService) {}

  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @Get()
  async list(@Req() req: any) {
    return serialise(await this.accounts.list(req.ctx.tenantId));
  }
}
