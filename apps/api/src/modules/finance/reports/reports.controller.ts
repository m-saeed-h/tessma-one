import { Controller, Get, Req } from '@nestjs/common';
import { RequirePermissions } from '../../../core/permissions/permissions.decorators';
import { PERMISSIONS } from '../../../core/permissions/permissions.registry';
import { RequireEntitlement } from '../../../core/subscriptions/entitlements.decorators';
import { FEATURE_KEYS } from '../../../core/subscriptions/entitlements.registry';
import { serialise } from '../../../shared/http/serialise';
import { ReportsService } from './reports.service';

@Controller('reports')
@RequireEntitlement(FEATURE_KEYS.FINANCE)
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @Get('aged-receivables')
  async agedReceivables(@Req() req: any) {
    return serialise(await this.reports.agedReceivables(req.ctx.tenantId));
  }

  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @Get('invoice-metrics')
  async invoiceMetrics(@Req() req: any) {
    return serialise(await this.reports.invoiceMetrics(req.ctx.tenantId));
  }
}
