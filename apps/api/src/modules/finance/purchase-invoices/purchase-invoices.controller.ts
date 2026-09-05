import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../../../core/permissions/permissions.decorators';
import { PERMISSIONS } from '../../../core/permissions/permissions.registry';
import { RequireEntitlement } from '../../../core/subscriptions/entitlements.decorators';
import { FEATURE_KEYS } from '../../../core/subscriptions/entitlements.registry';
import { validate } from '../../../shared/validation/validate';
import { serialise } from '../../../shared/http/serialise';
import { PurchaseInvoicesService } from './purchase-invoices.service';

const lineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  nominalCode: z.string().trim().min(1).max(20),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  vatRatePct: z.number().int().min(0).max(100).optional(),
});
const createSchema = z.object({
  supplierId: z.string().uuid(),
  number: z.string().trim().min(1).max(100),
  reference: z.string().trim().max(200).optional(),
  purchaseOrderRef: z.string().trim().max(100).optional(),
  invoiceDate: z.string().datetime(),
  dueDate: z.string().datetime().optional(),
  documentId: z.string().uuid(),
  lines: z.array(lineSchema).min(1).max(200),
});
const decideSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), comment: z.string().trim().max(1000).optional() });
const listQuerySchema = z.object({ supplierId: z.string().uuid().optional() });

@Controller('purchase-invoices')
@RequireEntitlement(FEATURE_KEYS.FINANCE)
export class PurchaseInvoicesController {
  constructor(private purchaseInvoices: PurchaseInvoicesService) {}

  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICE_CREATE)
  @Post()
  async create(@Req() req: any, @Body() body: unknown) {
    const b = validate(createSchema, body);
    return serialise(await this.purchaseInvoices.create(req.ctx.tenantId, req.ctx.userId, b));
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICE_READ)
  @Get()
  async list(@Req() req: any, @Query() query: unknown) {
    const q = validate(listQuerySchema, query);
    return serialise(await this.purchaseInvoices.list(req.ctx.tenantId, q.supplierId));
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICE_READ)
  @Get(':id')
  async get(@Req() req: any, @Param('id') id: string) {
    return serialise(await this.purchaseInvoices.get(req.ctx.tenantId, id));
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICE_CREATE)
  @Post(':id/submit')
  async submit(@Req() req: any, @Param('id') id: string) {
    return serialise(await this.purchaseInvoices.submit(req.ctx.tenantId, req.ctx.userId, id));
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICE_APPROVE)
  @Post(':id/decide')
  async decide(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(decideSchema, body);
    return serialise(await this.purchaseInvoices.decide(req.ctx.tenantId, req.ctx.userId, id, b.decision, b.comment));
  }
}
