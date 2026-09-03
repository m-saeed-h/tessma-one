// Seeds the platform plan catalogue and one demo tenant with system roles, so
// the demo has data + an owner who can do everything. Runs as the DB OWNER
// role, before row-level security is applied — this is also the only place
// Plan/PlanFeature are ever written (see rls.sql: the restricted app role has
// SELECT-only on those two tables).
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { SYSTEM_ROLES } from '../src/core/permissions/permissions.registry';
import { SEED_PLANS } from '../src/core/subscriptions/entitlements.registry';

const prisma = new PrismaClient();

async function ensurePlans(): Promise<Record<string, string>> {
  const planIdByCode: Record<string, string> = {};
  for (const [code, features] of Object.entries(SEED_PLANS)) {
    const plan = await prisma.plan.upsert({
      where: { code },
      update: {},
      create: { code, name: code },
    });
    planIdByCode[code] = plan.id;
    for (const featureKey of features) {
      await prisma.planFeature.upsert({
        where: { planId_featureKey: { planId: plan.id, featureKey } },
        update: {},
        create: { planId: plan.id, featureKey },
      });
    }
  }
  return planIdByCode;
}

async function main() {
  const planIdByCode = await ensurePlans();

  const existing = await prisma.user.findUnique({ where: { email: 'demo@tessma.one' } });
  if (existing) { console.log('Seed already applied (plans re-checked idempotently).'); return; }

  const passwordHash = await argon2.hash('demo1234');
  const tenant = await prisma.tenant.create({ data: { name: 'Demo Trading Ltd' } });

  // System roles + permissions
  const roleIdByName: Record<string, string> = {};
  for (const [name, perms] of Object.entries(SYSTEM_ROLES)) {
    const role = await prisma.role.create({ data: { tenantId: tenant.id, name, isSystem: true } });
    roleIdByName[name] = role.id;
    if (perms.length)
      await prisma.rolePermission.createMany({
        data: perms.map((permission) => ({ tenantId: tenant.id, roleId: role.id, permission })),
      });
  }

  const user = await prisma.user.create({
    data: { tenantId: tenant.id, email: 'demo@tessma.one', passwordHash, displayName: 'Demo Owner' },
  });
  await prisma.userRole.create({
    data: { tenantId: tenant.id, userId: user.id, roleId: roleIdByName['OWNER'] },
  });

  await prisma.account.createMany({
    data: [
      { tenantId: tenant.id, code: '1100', name: 'Trade Debtors', type: 'ASSET' },
      { tenantId: tenant.id, code: '4000', name: 'Sales', type: 'INCOME' },
      { tenantId: tenant.id, code: '2200', name: 'Output VAT', type: 'LIABILITY' },
    ],
  });
  await prisma.numberSequence.create({ data: { tenantId: tenant.id, docType: 'INVOICE', next: 1 } });
  await prisma.tenantSubscription.create({
    data: { tenantId: tenant.id, planId: planIdByCode['TRIAL'], status: 'TRIALING' },
  });

  console.log('Seeded plan catalogue + demo tenant + roles. Login: demo@tessma.one / demo1234 (OWNER — all permissions)');
}
main().finally(() => prisma.$disconnect());
