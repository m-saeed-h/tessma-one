import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../../../core/permissions/permissions.decorators';
import { PERMISSIONS } from '../../../core/permissions/permissions.registry';
import { RequireEntitlement } from '../../../core/subscriptions/entitlements.decorators';
import { FEATURE_KEYS } from '../../../core/subscriptions/entitlements.registry';
import { validate } from '../../../shared/validation/validate';
import { productSchema } from '../../../shared/validation/schemas';
import { serialise } from '../../../shared/http/serialise';
import { ProductsService } from './products.service';

const listQuerySchema = z.object({ includeArchived: z.enum(['true', 'false']).optional() });

@Controller('products')
@RequireEntitlement(FEATURE_KEYS.FINANCE)
export class ProductsController {
  constructor(private products: ProductsService) {}

  @RequirePermissions(PERMISSIONS.PRODUCT_CREATE)
  @Post()
  async create(@Req() req: any, @Body() body: unknown) {
    const b = validate(productSchema, body);
    return serialise(await this.products.create(req.ctx.tenantId, b));
  }

  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @Get()
  async list(@Req() req: any, @Query() query: unknown) {
    const q = validate(listQuerySchema, query);
    return serialise(await this.products.list(req.ctx.tenantId, q.includeArchived === 'true'));
  }

  @RequirePermissions(PERMISSIONS.PRODUCT_CREATE)
  @Post(':id/archive')
  async archive(@Req() req: any, @Param('id') id: string) {
    return serialise(await this.products.archive(req.ctx.tenantId, id));
  }
}
