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
import { DocumentsController } from './core/documents/documents.controller';
import { DocumentsService } from './core/documents/documents.service';
import { S3Service } from './core/documents/storage/s3.service';
import { NotificationsController } from './core/notifications/notifications.controller';
import { NotificationsService } from './core/notifications/notifications.service';
import { ConsoleEmailProvider } from './core/notifications/providers/console-email.provider';
import { WorkflowController } from './core/workflow/workflow.controller';
import { WorkflowService } from './core/workflow/workflow.service';
import { AiGatewayController } from './core/ai/ai-gateway.controller';
import { AiGatewayService } from './core/ai/ai-gateway.service';
import { FinanceController } from './modules/finance/finance.controller';
import { FinanceService } from './modules/finance/finance.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [
    HealthController,
    IdentityController,
    PartyController,
    BrandingController,
    DocumentsController,
    NotificationsController,
    WorkflowController,
    AiGatewayController,
    FinanceController,
  ],
  providers: [
    PrismaService,
    AuditService,
    PermissionsService,
    EntitlementsService,
    BrandingService,
    S3Service,
    DocumentsService,
    ConsoleEmailProvider,
    NotificationsService,
    WorkflowService,
    AiGatewayService,
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
