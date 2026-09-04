import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../../../core/permissions/permissions.decorators';
import { PERMISSIONS } from '../../../core/permissions/permissions.registry';
import { RequireEntitlement } from '../../../core/subscriptions/entitlements.decorators';
import { FEATURE_KEYS } from '../../../core/subscriptions/entitlements.registry';
import { validate } from '../../../shared/validation/validate';
import { allocatePaymentSchema, recordPaymentSchema } from '../../../shared/validation/schemas';
import { serialise } from '../../../shared/http/serialise';
import { PaymentsService } from './payments.service';

const listQuerySchema = z.object({ partyId: z.string().uuid().optional() });

@Controller('payments')
@RequireEntitlement(FEATURE_KEYS.FINANCE)
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @RequirePermissions(PERMISSIONS.PAYMENT_RECORD)
  @Post()
  async record(@Req() req: any, @Body() body: unknown) {
    const b = validate(recordPaymentSchema, body);
    return serialise(await this.payments.record(req.ctx.tenantId, req.ctx.userId, b));
  }

  @RequirePermissions(PERMISSIONS.PAYMENT_READ)
  @Get()
  async list(@Req() req: any, @Query() query: unknown) {
    const q = validate(listQuerySchema, query);
    return serialise(await this.payments.list(req.ctx.tenantId, q.partyId));
  }

  @RequirePermissions(PERMISSIONS.PAYMENT_RECORD)
  @Post(':id/allocate')
  async allocate(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(allocatePaymentSchema, body);
    const { tenantId, userId } = req.ctx;
    return serialise(await this.payments.allocate(tenantId, userId, id, b.invoiceId, b.amountPence));
  }
}
