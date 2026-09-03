import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './shared/prisma/prisma.service';
import { AuditService } from './core/audit/audit.service';
import { AuthGuard } from './core/identity/auth.guard';
import { CsrfGuard } from './core/identity/csrf.guard';
import { PermissionsGuard } from './core/permissions/permissions.guard';
import { PermissionsService } from './core/permissions/permissions.service';
import { EntitlementsGuard } from './core/subscriptions/entitlements.guard';
import { EntitlementsService } from './core/subscriptions/entitlements.service';
import { IdentityController } from './core/identity/identity.controller';
import { PartyController } from './core/party/party.controller';
import { BrandingController } from './core/branding/branding.controller';
import { BrandingService } from './core/branding/branding.service';
import { HealthController } from './core/health/health.controller';
import { FinanceController } from './modules/finance/finance.controller';
import { FinanceService } from './modules/finance/finance.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [
    HealthController,
    IdentityController,
    PartyController,
    BrandingController,
    FinanceController,
  ],
  providers: [
    PrismaService,
    AuditService,
    PermissionsService,
    EntitlementsService,
    BrandingService,
    FinanceService,
    // Global guards run in registration order, deny by default:
    // 1. AuthGuard      — who are you (token, from cookie or header only)
    // 2. CsrfGuard       — for cookie-authenticated mutations, prove same-origin
    // 3. PermissionsGuard — does your role hold the required permission
    // 4. EntitlementsGuard — does your tenant's subscription include this feature
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: EntitlementsGuard },
  ],
})
export class AppModule {}
