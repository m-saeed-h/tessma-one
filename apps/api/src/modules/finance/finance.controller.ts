import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { RequirePermissions } from '../../core/permissions/permissions.decorators';
import { PERMISSIONS } from '../../core/permissions/permissions.registry';
import { RequireEntitlement } from '../../core/subscriptions/entitlements.decorators';
import { FEATURE_KEYS } from '../../core/subscriptions/entitlements.registry';
import { validate } from '../../shared/validation/validate';
import { createInvoiceDraftSchema } from '../../shared/validation/schemas';
import { FinanceService } from './finance.service';

// Serialise BigInt (pence) to string so JSON is lossless.
function serialise(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

@Controller('invoices')
@RequireEntitlement(FEATURE_KEYS.FINANCE)
export class FinanceController {
  constructor(private finance: FinanceService) {}

  @RequirePermissions(PERMISSIONS.INVOICE_CREATE)
  @Post('draft')
  async draft(@Req() req: any, @Body() body: unknown) {
    const b = validate(createInvoiceDraftSchema, body);
    const { tenantId, userId } = req.ctx;
    return serialise(await this.finance.createDraft(tenantId, userId, b.partyId, b.lines));
  }

  @RequirePermissions(PERMISSIONS.INVOICE_ISSUE)
  @Post(':id/issue')
  async issue(@Req() req: any, @Param('id') id: string) {
    const { tenantId, userId } = req.ctx;
    return serialise(await this.finance.issue(tenantId, userId, id));
  }

  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @Get('trial-balance')
  async tb(@Req() req: any) {
    return serialise(await this.finance.trialBalance(req.ctx.tenantId));
  }
}
