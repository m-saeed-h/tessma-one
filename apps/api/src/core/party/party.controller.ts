import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { RequirePermissions } from '../permissions/permissions.decorators';
import { PERMISSIONS } from '../permissions/permissions.registry';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { validate } from '../../shared/validation/validate';
import { createCustomerSchema } from '../../shared/validation/schemas';
import { serialise } from '../../shared/http/serialise';
import { checkForDuplicateParty } from './duplicate-detection';

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
      await checkForDuplicateParty(tx, tenantId, b, b.confirmDuplicate);

      const party = await tx.party.create({
        data: {
          tenantId, type: b.type ?? 'COMPANY', legalName: b.legalName,
          tradingName: b.tradingName, companyNumber: b.companyNumber, vatNumber: b.vatNumber,
          email: b.email, phone: b.phone,
          addressLine1: b.addressLine1, addressLine2: b.addressLine2,
          city: b.city, postcode: b.postcode, country: b.country, notes: b.notes,
        },
      });
      const customer = await tx.customerRole.create({
        data: {
          tenantId, partyId: party.id, paymentTerms: b.paymentTerms ?? 30,
          creditLimit: b.creditLimitPence ?? 0,
          creditLimitBehaviour: b.creditLimitBehaviour ?? 'WARN',
        },
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
    return serialise(
      await this.prisma.forTenant(tenantId, (tx) =>
        tx.party.findMany({ where: { customer: { isNot: null } }, include: { customer: true } }),
      ),
    );
  }

  // FR-PTY-010: "a customer account view showing balance, aged position,
  // open items..." — the balance/open-items half; aged buckets live in the
  // dedicated aged-receivables report (reports.controller.ts) since that
  // view spans all customers, not just one.
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @Get(':id/account')
  async account(@Req() req: any, @Param('id') id: string) {
    const { tenantId } = req.ctx;
    return serialise(
      await this.prisma.forTenant(tenantId, async (tx) => {
        const party = await tx.party.findUniqueOrThrow({ where: { id }, include: { customer: true } });
        const invoices = await tx.invoice.findMany({
          where: { partyId: id, status: { not: 'DRAFT' } },
          orderBy: { issueDate: 'desc' },
          include: { allocations: true },
        });
        const openInvoices = invoices.filter((i) => i.grossTotal - i.allocatedTotal > 0n && i.status !== 'CANCELLED');
        const balance = openInvoices.reduce((s, i) => s + (i.grossTotal - i.allocatedTotal), 0n);
        return {
          party,
          balance,
          availableCredit: party.customer && party.customer.creditLimit > 0n
            ? party.customer.creditLimit - balance
            : null,
          openInvoices,
          invoiceCount: invoices.length,
        };
      }),
    );
  }
}
