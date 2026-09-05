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
import { SuppliersController } from './core/party/suppliers.controller';
import { SuppliersService } from './core/party/suppliers.service';
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
import { NumberingService } from './shared/numbering/numbering.service';
import { FinanceController } from './modules/finance/finance.controller';
import { FinanceService } from './modules/finance/finance.service';
import { ProductsController } from './modules/finance/products/products.controller';
import { ProductsService } from './modules/finance/products/products.service';
import { QuotationsController } from './modules/finance/quotations/quotations.controller';
import { QuotationsService } from './modules/finance/quotations/quotations.service';
import { CreditNotesController } from './modules/finance/credit-notes/credit-notes.controller';
import { CreditNotesService } from './modules/finance/credit-notes/credit-notes.service';
import { PaymentsController } from './modules/finance/payments/payments.controller';
import { PaymentsService } from './modules/finance/payments/payments.service';
import { ReportsController } from './modules/finance/reports/reports.controller';
import { ReportsService } from './modules/finance/reports/reports.service';
import { FinanceSettingsController } from './modules/finance/settings/settings.controller';
import { FinanceSettingsService } from './modules/finance/settings/settings.service';
import { InvoicePdfService } from './modules/finance/pdf/invoice-pdf.service';
import { ConsoleInvoiceEmailProvider } from './modules/finance/pdf/invoice-email.provider';
import { PeriodsService } from './shared/periods/periods.service';
import { PeriodsController } from './modules/finance/periods/periods.controller';
import { JournalsController } from './modules/finance/journals/journals.controller';
import { JournalsService } from './modules/finance/journals/journals.service';
import { IdempotencyService } from './shared/idempotency/idempotency.service';
import { ExpensesController } from './modules/finance/expenses/expenses.controller';
import { ExpensesService } from './modules/finance/expenses/expenses.service';
import { PurchaseInvoicesController } from './modules/finance/purchase-invoices/purchase-invoices.controller';
import { PurchaseInvoicesService } from './modules/finance/purchase-invoices/purchase-invoices.service';
import { SupplierPaymentsController } from './modules/finance/supplier-payments/supplier-payments.controller';
import { SupplierPaymentsService } from './modules/finance/supplier-payments/supplier-payments.service';
import { AccountsController } from './modules/finance/accounts/accounts.controller';
import { AccountsService } from './modules/finance/accounts/accounts.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [
    HealthController,
    IdentityController,
    PartyController,
    SuppliersController,
    BrandingController,
    DocumentsController,
    NotificationsController,
    WorkflowController,
    AiGatewayController,
    FinanceController,
    ProductsController,
    QuotationsController,
    CreditNotesController,
    PaymentsController,
    ReportsController,
    FinanceSettingsController,
    PeriodsController,
    JournalsController,
    ExpensesController,
    PurchaseInvoicesController,
    SupplierPaymentsController,
    AccountsController,
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
    NumberingService,
    SuppliersService,
    FinanceService,
    ProductsService,
    QuotationsService,
    CreditNotesService,
    PaymentsService,
    ReportsService,
    FinanceSettingsService,
    InvoicePdfService,
    ConsoleInvoiceEmailProvider,
    PeriodsService,
    JournalsService,
    IdempotencyService,
    ExpensesService,
    PurchaseInvoicesService,
    SupplierPaymentsService,
    AccountsService,
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
