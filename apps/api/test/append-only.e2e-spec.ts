/**
 * BR-FIN-04 / FR-LED-006 / FR-AUD-002: a posted ledger entry or audit event is
 * immutable. The application code never calls .update()/.delete() on either
 * table, but Charter §6.2 wants the control "that survives an application
 * bug" — so the restricted app-role's UPDATE/DELETE grant on these two
 * tables was revoked in rls.sql. This proves that grant actually holds by
 * attempting the mutation directly, bypassing the application layer entirely.
 */
import { PrismaService } from '../src/shared/prisma/prisma.service';

describe('append-only tables are enforced at the database grant, not just by convention', () => {
  const prisma = new PrismaService();

  it('the app role cannot UPDATE or DELETE an audit event', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'AppendOnly Ltd' } });
    const event = await prisma.forTenant(tenant.id, (tx) =>
      tx.auditEvent.create({
        data: { tenantId: tenant.id, action: 'test.action', resourceType: 'Test', resourceId: 'x' },
      }),
    );

    await expect(
      prisma.forTenant(tenant.id, (tx) =>
        tx.$executeRawUnsafe(`UPDATE "AuditEvent" SET action = 'tampered' WHERE id = $1`, event.id),
      ),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      prisma.forTenant(tenant.id, (tx) =>
        tx.$executeRawUnsafe(`DELETE FROM "AuditEvent" WHERE id = $1`, event.id),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('the app role cannot UPDATE or DELETE a ledger entry', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'AppendOnly Ledger Ltd' } });
    const entry = await prisma.forTenant(tenant.id, async (tx) => {
      const account = await tx.account.create({
        data: { tenantId: tenant.id, code: '1100', name: 'Trade Debtors', type: 'ASSET' },
      });
      return tx.ledgerEntry.create({
        data: { tenantId: tenant.id, accountId: account.id, debit: 100n, credit: 0n, narrative: 'test' },
      });
    });

    await expect(
      prisma.forTenant(tenant.id, (tx) =>
        tx.$executeRawUnsafe(`UPDATE "LedgerEntry" SET debit = 999 WHERE id = $1`, entry.id),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  afterAll(() => prisma.$disconnect());
});
