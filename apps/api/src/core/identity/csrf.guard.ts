import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from '../permissions/permissions.decorators';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// SEC-APP-04: CSRF protection on all cookie-authenticated state-changing
// requests. Double-submit pattern: login/register set a second, non-httpOnly
// cookie (`tsm_csrf`) holding a random value that is also embedded as a claim
// in the JWT itself, so it can't be forged without the secret. A mutating
// request must echo that value back in an `X-CSRF-Token` header — something
// only same-origin JS (which can read the readable cookie) can do; a
// third-party page forging a cross-site request cannot read it and so cannot
// supply it, even though the browser attaches the httpOnly auth cookie
// automatically.
//
// A request authenticated via the Authorization header instead (machine/API
// clients) is exempt: a cross-origin page cannot make the browser attach an
// arbitrary custom header, so that path was never CSRF-able to begin with —
// which is exactly the scope SEC-APP-04 asks for ("cookie-authenticated").
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    if (SAFE_METHODS.has(req.method)) return true;
    if (req.ctx?.authMethod !== 'cookie') return true;

    const header = req.headers['x-csrf-token'];
    if (!header || header !== req.ctx.csrf) {
      throw new ForbiddenException({ code: 'csrf.invalid', message: 'Missing or invalid CSRF token.' });
    }
    return true;
  }
}
