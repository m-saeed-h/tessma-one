import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../../../core/permissions/permissions.decorators';
import { PERMISSIONS } from '../../../core/permissions/permissions.registry';
import { RequireEntitlement } from '../../../core/subscriptions/entitlements.decorators';
import { FEATURE_KEYS } from '../../../core/subscriptions/entitlements.registry';
import { validate } from '../../../shared/validation/validate';
import { createQuotationSchema, decideQuotationSchema } from '../../../shared/validation/schemas';
import { serialise } from '../../../shared/http/serialise';
import { QuotationsService } from './quotations.service';

const listQuerySchema = z.object({ partyId: z.string().uuid().optional() });
const convertSchema = z.object({ allowExpired: z.boolean().optional() });

@Controller('quotations')
@RequireEntitlement(FEATURE_KEYS.FINANCE)
export class QuotationsController {
  constructor(private quotations: QuotationsService) {}

  @RequirePermissions(PERMISSIONS.QUOTATION_CREATE)
  @Post()
  async create(@Req() req: any, @Body() body: unknown) {
    const b = validate(createQuotationSchema, body);
    const { tenantId, userId } = req.ctx;
    return serialise(await this.quotations.create(tenantId, userId, b.partyId, b.lines, b.expiryDate));
  }

  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @Get()
  async list(@Req() req: any, @Query() query: unknown) {
    const q = validate(listQuerySchema, query);
    return serialise(await this.quotations.list(req.ctx.tenantId, q.partyId));
  }

  @RequirePermissions(PERMISSIONS.QUOTATION_CREATE)
  @Post(':id/decide')
  async decide(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(decideQuotationSchema, body);
    const { tenantId, userId } = req.ctx;
    return serialise(await this.quotations.decide(tenantId, userId, id, b.decision));
  }

  @RequirePermissions(PERMISSIONS.INVOICE_CREATE)
  @Post(':id/convert')
  async convert(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(convertSchema, body ?? {});
    const { tenantId, userId } = req.ctx;
    return serialise(await this.quotations.convertToInvoice(tenantId, userId, id, b.allowExpired ?? false));
  }
}
