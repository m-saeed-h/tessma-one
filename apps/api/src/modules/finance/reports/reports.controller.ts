import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { RequirePermissions } from '../../../core/permissions/permissions.decorators';
import { PERMISSIONS } from '../../../core/permissions/permissions.registry';
import { RequireEntitlement } from '../../../core/subscriptions/entitlements.decorators';
import { FEATURE_KEYS } from '../../../core/subscriptions/entitlements.registry';
import { validate } from '../../../shared/validation/validate';
import { serialise } from '../../../shared/http/serialise';
import { toCsv } from '../../../shared/http/csv';
import { ReportsService } from './reports.service';
import { PurchaseInvoicesService } from '../purchase-invoices/purchase-invoices.service';

const dateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});
const asOfSchema = z.object({
  asOf: z.string().datetime().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});
const formatOnlySchema = z.object({ format: z.enum(['json', 'csv']).default('json') });

@Controller('reports')
@RequireEntitlement(FEATURE_KEYS.FINANCE)
export class ReportsController {
  constructor(private reports: ReportsService, private purchaseInvoices: PurchaseInvoicesService) {}

  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @Get('aged-receivables')
  async agedReceivables(@Req() req: any, @Query() query: unknown, @Res({ passthrough: true }) res: Response) {
    const q = validate(formatOnlySchema, query);
    const rows = await this.reports.agedReceivables(req.ctx.tenantId);
    if (q.format === 'csv') return this.csv(res, 'aged-receivables', rows.map(flattenAgedRow));
    return serialise(rows);
  }

  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @Get('aged-payables')
  async agedPayables(@Req() req: any, @Query() query: unknown, @Res({ passthrough: true }) res: Response) {
    const q = validate(formatOnlySchema, query);
    const rows = await this.purchaseInvoices.agedPayables(req.ctx.tenantId);
    if (q.format === 'csv') return this.csv(res, 'aged-payables', rows.map(flattenAgedRow));
    return serialise(rows);
  }

  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @Get('invoice-metrics')
  async invoiceMetrics(@Req() req: any) {
    return serialise(await this.reports.invoiceMetrics(req.ctx.tenantId));
  }

  // FR-RPT-002.
  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @Get('profit-and-loss')
  async profitAndLoss(@Req() req: any, @Query() query: unknown, @Res({ passthrough: true }) res: Response) {
    const q = validate(dateRangeSchema, query);
    const now = new Date();
    const from = q.from ? new Date(q.from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = q.to ? new Date(q.to) : now;
    const report = await this.reports.profitAndLoss(req.ctx.tenantId, from, to);
    if (q.format === 'csv') {
      const rows = [
        ...Object.entries(report.income).map(([code, v]) => ({ section: 'Income', code, name: v.name, amountPence: v.amount.toString() })),
        ...Object.entries(report.expense).map(([code, v]) => ({ section: 'Expense', code, name: v.name, amountPence: v.amount.toString() })),
        { section: 'Total', code: '', name: 'Net profit', amountPence: report.netProfit.toString() },
      ];
      return this.csv(res, 'profit-and-loss', rows);
    }
    return serialise(report);
  }

  // FR-RPT-003.
  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @Get('balance-sheet')
  async balanceSheet(@Req() req: any, @Query() query: unknown, @Res({ passthrough: true }) res: Response) {
    const q = validate(asOfSchema, query);
    const report = await this.reports.balanceSheet(req.ctx.tenantId, q.asOf ? new Date(q.asOf) : new Date());
    if (q.format === 'csv') {
      const rows = [
        ...Object.entries(report.assets).map(([code, v]) => ({ section: 'Asset', code, name: v.name, amountPence: v.amount.toString() })),
        ...Object.entries(report.liabilities).map(([code, v]) => ({ section: 'Liability', code, name: v.name, amountPence: v.amount.toString() })),
        { section: 'Equity', code: '', name: 'Retained earnings (calculated)', amountPence: report.retainedEarnings.toString() },
      ];
      return this.csv(res, 'balance-sheet', rows);
    }
    return serialise(report);
  }

  private csv(res: Response, name: string, rows: Record<string, unknown>[]) {
    res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${name}.csv"` });
    return toCsv(rows);
  }
}

function flattenAgedRow(r: any) {
  return {
    party: r.legalName, current: r.current.toString(), d30: r.d30.toString(),
    d60: r.d60.toString(), d90: r.d90.toString(), d120plus: r.d120plus.toString(), total: r.total.toString(),
  };
}
