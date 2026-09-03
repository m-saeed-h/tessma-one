import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from '../permissions/permissions.decorators';
import { ENTITLEMENT_KEY } from './entitlements.decorators';
import { EntitlementsService } from './entitlements.service';

// Global guard, runs after auth + permissions. A route with no
// @RequireEntitlement is unaffected (most core/platform routes aren't a
// billable module capability).
@Injectable()
export class EntitlementsGuard implements CanActivate {
  constructor(private reflector: Reflector, private entitlements: EntitlementsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (isPublic) return true;

    const featureKey = this.reflector.getAllAndOverride<string>(ENTITLEMENT_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!featureKey) return true;

    const req = ctx.switchToHttp().getRequest();
    const { tenantId } = req.ctx;
    const ok = await this.entitlements.hasFeature(tenantId, featureKey);
    if (!ok) {
      throw new ForbiddenException({
        code: 'entitlement.missing',
        message: 'Your subscription does not include this feature.',
        featureKey,
      });
    }
    return true;
  }
}
