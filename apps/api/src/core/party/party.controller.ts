import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { RequirePermissions } from '../permissions/permissions.decorators';
import { PERMISSIONS } from '../permissions/permissions.registry';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { validate } from '../../shared/validation/validate';
import { createCustomerSchema } from '../../shared/validation/schemas';

// A customer is created as a ROLE on a shared Party — not a private customers table.
@Controller('customers')
export class PartyController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @RequirePermissions(PERMISSIONS.CUSTOMER_CREATE)
  @Post()
  async create(@Req() req: any, @Body() body: unknown) {
    const b = validate(createCustomerSchema, body);
    const { tenantId, userId } = req.ctx;
    return this.prisma.forTenant(tenantId, async (tx) => {
      const party = await tx.party.create({
        data: { tenantId, type: b.type ?? 'COMPANY', legalName: b.legalName, vatNumber: b.vatNumber },
      });
      const customer = await tx.customerRole.create({
        data: { tenantId, partyId: party.id, paymentTerms: b.paymentTerms ?? 30 },
      });
      await this.audit.write(tx, {
        tenantId, userId, action: 'customer.created',
        resourceType: 'Party', resourceId: party.id, after: { legalName: b.legalName },
      });
      return { id: party.id, legalName: party.legalName, customerId: customer.id };
    });
  }

  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @Get()
  async list(@Req() req: any) {
    const { tenantId } = req.ctx;
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.party.findMany({ where: { customer: { isNot: null } }, include: { customer: true } }),
    );
  }
}
