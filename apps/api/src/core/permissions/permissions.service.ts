import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { SYSTEM_ROLES } from './permissions.registry';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  // Seed the system roles + their permissions for a tenant, inside the tenant
  // scope. Returns the roles by name so callers can assign one to a user.
  async seedRolesForTenant(tx: any, tenantId: string): Promise<Record<string, string>> {
    const byName: Record<string, string> = {};
    for (const [name, perms] of Object.entries(SYSTEM_ROLES)) {
      const role = await tx.role.create({
        data: { tenantId, name, isSystem: true },
      });
      byName[name] = role.id;
      if (perms.length) {
        await tx.rolePermission.createMany({
          data: perms.map((permission) => ({ tenantId, roleId: role.id, permission })),
        });
      }
    }
    return byName;
  }

  // Resolve a user's effective permission set (union across their roles).
  async permissionsForUser(tenantId: string, userId: string): Promise<Set<string>> {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const userRoles = await tx.userRole.findMany({
        where: { userId },
        include: { role: { include: { permissions: true } } },
      });
      const set = new Set<string>();
      for (const ur of userRoles)
        for (const rp of ur.role.permissions) set.add(rp.permission);
      return set;
    });
  }
}
