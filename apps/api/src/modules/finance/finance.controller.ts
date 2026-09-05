import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { RequirePermissions } from '../../core/permissions/permissions.decorators';
import { PERMISSIONS } from '../../core/permissions/permissions.registry';
import { RequireEntitlement } from '../../core/subscriptions/entitlements.decorators';
import { FEATURE_KEYS } from '../../core/subscriptions/entitlements.registry';
import { validate } from '../../shared/validation/validate';
import { cancelInvoiceSchema, createInvoiceDraftSchema, sendInvoiceSchema } from '../../shared/validation/schemas';
import { serialise } from '../../shared/http/serialise';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { FinanceService } from './finance.service';

const listQuerySchema = z.object({ partyId: z.string().uuid().optional() });
const issueSchema = z.object({ dueInDays: z.number().int().min(0).max(365).optional() });

@Controller('invoices')
@RequireEntitlement(FEATURE_KEYS.FINANCE)
export class FinanceController {
  constructor(private finance: FinanceService, private idempotency: IdempotencyService) {}

  @RequirePermissions(PERMISSIONS.INVOICE_CREATE)
  @Post('draft')
  async draft(@Req() req: any, @Body() body: unknown) {
    const b = validate(createInvoiceDraftSchema, body);
    const { tenantId, userId } = req.ctx;
    return serialise(await this.finance.createDraft(tenantId, userId, b.partyId, b.lines, b));
  }

  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @Get()
  async list(@Req() req: any, @Query() query: unknown) {
    const q = validate(listQuerySchema, query);
    return serialise(await this.finance.list(req.ctx.tenantId, q.partyId));
  }

  // Declared BEFORE the `:id` route below — NestJS/Express match in
  // registration order, and `:id` (one dynamic segment) would otherwise
  // greedily swallow this literal one-segment path.
  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @Get('trial-balance')
  async tb(@Req() req: any) {
    return serialise(await this.finance.trialBalance(req.ctx.tenantId));
  }

  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @Get(':id')
  async get(@Req() req: any, @Param('id') id: string) {
    return serialise(await this.finance.get(req.ctx.tenantId, id));
  }

  @RequirePermissions(PERMISSIONS.INVOICE_ISSUE)
  @Post(':id/issue')
  async issue(@Req() req: any, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const b = validate(issueSchema, body ?? {});
    const { tenantId, userId } = req.ctx;
    return this.idempotency.wrap(tenantId, `invoices.issue.${id}`, idempotencyKey, () =>
      this.finance.issue(tenantId, userId, id, b.dueInDays).then(serialise),
    );
  }

  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @Get(':id/pdf')
  async pdf(@Req() req: any, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const buffer = await this.finance.renderPdf(req.ctx.tenantId, id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="invoice-${id}.pdf"` });
    return new StreamableFile(buffer);
  }

  @RequirePermissions(PERMISSIONS.INVOICE_SEND)
  @Post(':id/send')
  async send(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(sendInvoiceSchema, body);
    return serialise(await this.finance.send(req.ctx.tenantId, req.ctx.userId, id, b));
  }

  @RequirePermissions(PERMISSIONS.INVOICE_CREATE)
  @Post(':id/duplicate')
  async duplicate(@Req() req: any, @Param('id') id: string) {
    return serialise(await this.finance.duplicate(req.ctx.tenantId, req.ctx.userId, id));
  }

  @RequirePermissions(PERMISSIONS.INVOICE_VOID)
  @Post(':id/cancel')
  async cancel(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(cancelInvoiceSchema, body);
    const { tenantId, userId } = req.ctx;
    return serialise(await this.finance.cancel(tenantId, userId, id, b.reason));
  }
}
