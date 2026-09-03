/**
 * RBAC test — proves BOTH allow and deny (the definition of done requires the
 * denial path to be tested, not just the grant).
 *
 * Registers a tenant with two users: an OWNER (all permissions) and a
 * SALES_USER (can create customers/invoices but NOT issue an invoice or read
 * reports). Asserts the SALES_USER's effective permission set excludes the
 * issue/report permissions while the OWNER's includes them.
 *
 * Requires a running database + migrations + seeded roles. Run: npm run test:rbac
 */
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { PermissionsService } from '../src/core/permissions/permissions.service';
import { PERMISSIONS } from '../src/core/permissions/permissions.registry';

describe('RBAC (allow + deny)', () => {
  const prisma = new PrismaService();
  const permissions = new PermissionsService(prisma);

  it('OWNER holds issue/report; SALES_USER does not', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'RBAC Test Ltd' } });
    // Email is globally unique (schema.prisma) — stamp it so re-runs don't
    // collide with a previous run's leftover rows.
    const stamp = Date.now();

    const roleIds = await prisma.forTenant(tenant.id, (tx) =>
      permissions.seedRolesForTenant(tx, tenant.id),
    );

    const { ownerId, salesId } = await prisma.forTenant(tenant.id, async (tx) => {
      const owner = await tx.user.create({
        data: { tenantId: tenant.id, email: `owner-${stamp}@t.test`, passwordHash: 'x', displayName: 'Owner' },
      });
      const sales = await tx.user.create({
        data: { tenantId: tenant.id, email: `sales-${stamp}@t.test`, passwordHash: 'x', displayName: 'Sales' },
      });
      await tx.userRole.create({ data: { tenantId: tenant.id, userId: owner.id, roleId: roleIds['OWNER'] } });
      await tx.userRole.create({ data: { tenantId: tenant.id, userId: sales.id, roleId: roleIds['SALES_USER'] } });
      return { ownerId: owner.id, salesId: sales.id };
    });

    const ownerPerms = await permissions.permissionsForUser(tenant.id, ownerId);
    const salesPerms = await permissions.permissionsForUser(tenant.id, salesId);

    // Allow: owner can issue and read reports
    expect(ownerPerms.has(PERMISSIONS.INVOICE_ISSUE)).toBe(true);
    expect(ownerPerms.has(PERMISSIONS.REPORT_READ)).toBe(true);

    // Deny: sales user cannot issue or read reports...
    expect(salesPerms.has(PERMISSIONS.INVOICE_ISSUE)).toBe(false);
    expect(salesPerms.has(PERMISSIONS.REPORT_READ)).toBe(false);
    // ...but can create customers and draft invoices
    expect(salesPerms.has(PERMISSIONS.CUSTOMER_CREATE)).toBe(true);
    expect(salesPerms.has(PERMISSIONS.INVOICE_CREATE)).toBe(true);
  });

  afterAll(() => prisma.$disconnect());
});
