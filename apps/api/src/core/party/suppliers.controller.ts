import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { RequirePermissions } from '../permissions/permissions.decorators';
import { PERMISSIONS } from '../permissions/permissions.registry';
import { validate } from '../../shared/validation/validate';
import { createSupplierSchema, updateSupplierBankDetailsSchema } from '../../shared/validation/schemas';
import { serialise } from '../../shared/http/serialise';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(private suppliers: SuppliersService) {}

  @RequirePermissions(PERMISSIONS.SUPPLIER_CREATE)
  @Post()
  create(@Req() req: any, @Body() body: unknown) {
    const b = validate(createSupplierSchema, body);
    return this.suppliers.create(req.ctx.tenantId, req.ctx.userId, b);
  }

  @RequirePermissions(PERMISSIONS.SUPPLIER_READ)
  @Get()
  async list(@Req() req: any) {
    return serialise(await this.suppliers.list(req.ctx.tenantId));
  }

  @RequirePermissions(PERMISSIONS.SUPPLIER_CREATE)
  @Post(':id/bank-details')
  async updateBankDetails(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(updateSupplierBankDetailsSchema, body);
    return serialise(
      await this.suppliers.updateBankDetails(req.ctx.tenantId, req.ctx.userId, id, b.password, b),
    );
  }
}
