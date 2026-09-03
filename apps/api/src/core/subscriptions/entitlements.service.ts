import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

// Charter §6.4: "Entitlement shall be verified server-side on every request
// that touches a gated capability. Hiding a menu item is a usability
// behaviour, not an access control." This service is that server-side check.
//
// Plan/PlanFeature are the Platform-Operator-owned catalogue and are seeded
// once by prisma/seed.ts under the DB *owner* role (see rls.sql: the
// restricted app role only ever has SELECT on those two tables). This service
// runs under the restricted app role, so it only ever reads a Plan by code
// and writes the tenant's own TenantSubscription row — never the catalogue.
@Injectable()
export class EntitlementsService {
  constructor(private prisma: PrismaService) {}

  // Subscribe a tenant to a plan by code, inside the tenant-scoped transaction.
  async subscribeTenant(tx: Prisma.TransactionClient, tenantId: string, planCode: string) {
    const plan = await tx.plan.findUniqueOrThrow({ where: { code: planCode } });
    await tx.tenantSubscription.create({
      data: { tenantId, planId: plan.id, status: 'TRIALING' },
    });
  }

  async hasFeature(tenantId: string, featureKey: string): Promise<boolean> {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const sub = await tx.tenantSubscription.findUnique({
        where: { tenantId },
        include: { plan: { include: { features: true } } },
      });
      if (!sub || sub.status === 'CANCELLED') return false;
      return sub.plan.features.some((f) => f.featureKey === featureKey);
    });
  }
}
