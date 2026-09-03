import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC } from '../permissions/permissions.decorators';

// Global authentication guard. Establishes tenant + user context from the signed
// token (the ONLY source of tenant identity). Routes marked @Public() skip it.
//
// Two token sources are accepted: an `Authorization: Bearer` header (machine /
// API clients — SEC-IAM machine authentication) or the httpOnly `tsm_at`
// cookie (the browser app — SEC-IAM-03 requires the browser never hold the
// token in script-readable storage). Which one was used is recorded on the
// request context so CsrfGuard can apply CSRF protection only where it's
// actually needed: a cookie-authenticated request is auto-replayable by a
// third-party page, a header-authenticated one is not.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'] as string | undefined;

    let raw: string | undefined;
    let authMethod: 'header' | 'cookie' | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      raw = authHeader.slice(7);
      authMethod = 'header';
    } else if (req.cookies?.tsm_at) {
      raw = req.cookies.tsm_at;
      authMethod = 'cookie';
    }

    if (!raw) throw new UnauthorizedException('No token');
    try {
      const payload = await this.jwt.verifyAsync(raw, { secret: process.env.JWT_SECRET });
      req.ctx = { tenantId: payload.tenantId, userId: payload.sub, csrf: payload.csrf, authMethod };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
