import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC, PERMISSIONS_KEY } from './permissions.decorators';
import { PermissionsService } from './permissions.service';

// Global authorisation guard. Runs after AuthGuard. Deny by default: if a route
// declares required permissions, the user must hold ALL of them.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector, private permissions: PermissionsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true; // authenticated is enough

    const req = ctx.switchToHttp().getRequest();
    const { tenantId, userId } = req.ctx;
    const held = await this.permissions.permissionsForUser(tenantId, userId);
    const ok = required.every((p) => held.has(p));
    if (!ok) {
      throw new ForbiddenException({
        code: 'permission.denied',
        message: 'You do not have permission to perform this action.',
        required,
      });
    }
    return true;
  }
}
