/**
 * Cross-tenant isolation test (the build-blocker).
 * Registers two tenants, creates a customer under each, then asserts that
 * tenant A's scoped client CANNOT see tenant B's data. If this ever passes
 * a leak through, the build must fail.
 *
 * Requires a running database + migrations. Run with: npm run test:e2e
 */
import { PrismaService } from '../src/shared/prisma/prisma.service';

describe('tenant isolation (RLS)', () => {
  const prisma = new PrismaService();

  it('tenant A cannot read tenant B rows', async () => {
    // Arrange: two tenants each with one party, written under their own tenant scope.
    const a = await prisma.tenant.create({ data: { name: 'Alpha Ltd' } });
    const b = await prisma.tenant.create({ data: { name: 'Bravo Ltd' } });

    await prisma.forTenant(a.id, (tx) =>
      tx.party.create({ data: { tenantId: a.id, type: 'COMPANY', legalName: 'A-Customer' } }),
    );
    await prisma.forTenant(b.id, (tx) =>
      tx.party.create({ data: { tenantId: b.id, type: 'COMPANY', legalName: 'B-Customer' } }),
    );

    // Act: read parties while scoped to tenant A.
    const seenByA = await prisma.forTenant(a.id, (tx) => tx.party.findMany());

    // Assert: A sees only its own row, never B's.
    expect(seenByA.every((p) => p.tenantId === a.id)).toBe(true);
    expect(seenByA.some((p) => p.legalName === 'B-Customer')).toBe(false);
  });

  afterAll(() => prisma.$disconnect());
});
