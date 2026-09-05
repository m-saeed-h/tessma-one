import { Body, ConflictException, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import type { Response } from 'express';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import { AuditService } from '../audit/audit.service';
import { Public } from '../permissions/permissions.decorators';
import { validate } from '../../shared/validation/validate';
import { loginSchema, registerSchema } from '../../shared/validation/schemas';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../../modules/finance/chart-of-accounts';

const ACCESS_TOKEN_TTL = '12h';
const COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

@Controller('auth')
export class IdentityController {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private permissions: PermissionsService,
    private entitlements: EntitlementsService,
    private audit: AuditService,
  ) {}

  // Sign-up: create tenant, then (scoped to it) the system roles, the owner user,
  // assign the OWNER role, the starter TRIAL entitlement, and seed the chart of
  // accounts + number sequence.
  @Public()
  @Post('register')
  async register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const b = validate(registerSchema, body);

    // Email is globally unique (schema.prisma) — check before hashing anything.
    const existing = await this.prisma.user.findUnique({ where: { email: b.email } });
    if (existing) {
      throw new ConflictException({
        code: 'auth.email_taken',
        message: 'An account with this email already exists.',
      });
    }

    const passwordHash = await argon2.hash(b.password);
    const tenant = await this.prisma.tenant.create({ data: { name: b.company } });

    const user = await this.prisma.forTenant(tenant.id, async (tx) => {
      const roles = await this.permissions.seedRolesForTenant(tx, tenant.id);
      const u = await tx.user.create({
        data: { tenantId: tenant.id, email: b.email, passwordHash, displayName: b.name },
      });
      await tx.userRole.create({
        data: { tenantId: tenant.id, userId: u.id, roleId: roles['OWNER'] },
      });
      await tx.account.createMany({
        data: DEFAULT_CHART_OF_ACCOUNTS.map((a) => ({ tenantId: tenant.id, ...a })),
      });
      await tx.numberSequence.create({ data: { tenantId: tenant.id, docType: 'INVOICE', next: 1 } });
      await this.entitlements.subscribeTenant(tx, tenant.id, 'TRIAL');
      await this.audit.write(tx, {
        tenantId: tenant.id, userId: u.id, action: 'tenant.registered',
        resourceType: 'Tenant', resourceId: tenant.id, after: { name: tenant.name },
      });
      return u;
    });

    const session = await this.issueSession(user.id, tenant.id);
    this.setSessionCookies(res, session);
    return { token: session.token, tenant: tenant.name };
  }

  @Public()
  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const b = validate(loginSchema, body);
    const user = await this.prisma.user.findUnique({ where: { email: b.email } });
    if (!user || !(await argon2.verify(user.passwordHash, b.password))) {
      // 401, not a 200 with an {error} body — the client and any middleware
      // (rate limiting, logging) should be able to tell success from failure
      // without parsing the body (AP-08 / FR-API-008).
      throw new UnauthorizedException({
        code: 'auth.invalid_credentials',
        message: 'Invalid email or password.',
      });
    }
    const session = await this.issueSession(user.id, user.tenantId);
    this.setSessionCookies(res, session);
    return { token: session.token };
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    // Browsers match a clearing Set-Cookie by name+path+domain, but some also
    // require SameSite/Secure to match the cookie being cleared, so mirror
    // setSessionCookies' attributes here rather than assuming defaults work.
    const crossSite = process.env.COOKIE_CROSS_SITE === 'true';
    const sameSite = crossSite ? ('none' as const) : ('lax' as const);
    const secure = crossSite || process.env.NODE_ENV === 'production';
    res.clearCookie('tsm_at', { path: '/', sameSite, secure });
    res.clearCookie('tsm_csrf', { path: '/', sameSite, secure });
    return { ok: true };
  }

  // Lets the browser app discover who is logged in without ever reading the
  // (httpOnly) access token itself.
  @Get('me')
  async me(@Req() req: any) {
    const { tenantId, userId } = req.ctx;
    return this.prisma.forTenant(tenantId, async (tx) => {
      const [user, tenant] = await Promise.all([
        tx.user.findUniqueOrThrow({ where: { id: userId } }),
        tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      ]);
      return { email: user.email, displayName: user.displayName, tenantName: tenant.name };
    });
  }

  private async issueSession(userId: string, tenantId: string) {
    const csrf = crypto.randomBytes(24).toString('hex');
    const token = await this.jwt.signAsync(
      { sub: userId, tenantId, csrf },
      { secret: process.env.JWT_SECRET, expiresIn: ACCESS_TOKEN_TTL },
    );
    return { token, csrf };
  }

  private setSessionCookies(res: Response, session: { token: string; csrf: string }) {
    // Deployments where the web app and API share a site (same host, or just
    // different ports as in local dev) can use SameSite=Lax. Split-domain
    // deployments (e.g. Vercel + Railway) are cross-site as far as the browser
    // is concerned, so the cookie needs SameSite=None — which browsers refuse
    // to store at all unless Secure is also set, hence tying the two together.
    const crossSite = process.env.COOKIE_CROSS_SITE === 'true';
    const sameSite = crossSite ? ('none' as const) : ('lax' as const);
    const secure = crossSite || process.env.NODE_ENV === 'production';
    // httpOnly access token: never readable by page script (SEC-IAM-03).
    res.cookie('tsm_at', session.token, { httpOnly: true, sameSite, secure, maxAge: COOKIE_MAX_AGE_MS, path: '/' });
    // Readable CSRF cookie: the double-submit half of CsrfGuard (SEC-APP-04).
    res.cookie('tsm_csrf', session.csrf, { httpOnly: false, sameSite, secure, maxAge: COOKIE_MAX_AGE_MS, path: '/' });
  }
}
