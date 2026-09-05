import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../../../core/permissions/permissions.decorators';
import { PERMISSIONS } from '../../../core/permissions/permissions.registry';
import { RequireEntitlement } from '../../../core/subscriptions/entitlements.decorators';
import { FEATURE_KEYS } from '../../../core/subscriptions/entitlements.registry';
import { validate } from '../../../shared/validation/validate';
import { serialise } from '../../../shared/http/serialise';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { SupplierPaymentsService } from './supplier-payments.service';

const recordSchema = z.object({
  supplierId: z.string().uuid(),
  method: z.enum(['BANK_TRANSFER', 'CARD', 'CASH', 'OTHER']),
  reference: z.string().trim().max(200).optional(),
  amountPence: z.number().int().positive(),
  paidDate: z.string().datetime().optional(),
});
const allocateSchema = z.object({ purchaseInvoiceId: z.string().uuid(), amountPence: z.number().int().positive() });
const listQuerySchema = z.object({ supplierId: z.string().uuid().optional() });

@Controller('supplier-payments')
@RequireEntitlement(FEATURE_KEYS.FINANCE)
export class SupplierPaymentsController {
  constructor(private supplierPayments: SupplierPaymentsService, private idempotency: IdempotencyService) {}

  @RequirePermissions(PERMISSIONS.SUPPLIER_PAYMENT_RECORD)
  @Post()
  async record(@Req() req: any, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const b = validate(recordSchema, body);
    return this.idempotency.wrap(req.ctx.tenantId, 'supplierpayments.record', idempotencyKey, () =>
      this.supplierPayments.record(req.ctx.tenantId, req.ctx.userId, b).then(serialise),
    );
  }

  @RequirePermissions(PERMISSIONS.SUPPLIER_PAYMENT_READ)
  @Get()
  async list(@Req() req: any, @Query() query: unknown) {
    const q = validate(listQuerySchema, query);
    return serialise(await this.supplierPayments.list(req.ctx.tenantId, q.supplierId));
  }

  @RequirePermissions(PERMISSIONS.SUPPLIER_PAYMENT_RECORD)
  @Post(':id/allocate')
  async allocate(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(allocateSchema, body);
    return serialise(await this.supplierPayments.allocate(req.ctx.tenantId, req.ctx.userId, id, b.purchaseInvoiceId, b.amountPence));
  }
}
