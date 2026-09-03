import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Charter §7.7 / FR-PTN-017: an audit trail that cannot tell a tenant user
// apart from a partner user under standing access or support elevation is not
// fit for purpose. No partner-user actor exists yet in this slice (the
// partner console is Phase 3), so every event today is TENANT_USER — but the
// type exists now so that feature never needs a migration against live audit
// history.
export type AuditActorType = 'TENANT_USER' | 'PARTNER_STANDING' | 'PARTNER_ELEVATION' | 'SYSTEM';

// Append-only audit. Writes go through the tenant-scoped tx so they are isolated
// like everything else. There is deliberately no update/delete method — and the
// database grant backs that up (see rls.sql: UPDATE/DELETE revoked on this table).
@Injectable()
export class AuditService {
  async write(
    tx: Prisma.TransactionClient,
    e: {
      tenantId: string;
      userId?: string;
      actorType?: AuditActorType;
      action: string;
      resourceType: string;
      resourceId: string;
      before?: any;
      after?: any;
    },
  ) {
    await tx.auditEvent.create({
      data: {
        tenantId: e.tenantId,
        userId: e.userId,
        actorType: e.actorType ?? 'TENANT_USER',
        action: e.action,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        before: e.before ?? undefined,
        after: e.after ?? undefined,
      },
    });
  }
}
