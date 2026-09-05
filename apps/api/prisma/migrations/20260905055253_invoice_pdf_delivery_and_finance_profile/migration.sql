-- CreateTable
CREATE TABLE "TenantFinanceProfile" (
    "tenantId" TEXT NOT NULL,
    "legalName" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "postcode" TEXT,
    "country" TEXT DEFAULT 'GB',
    "vatNumber" TEXT,
    "companyNumber" TEXT,
    "footerText" TEXT,
    "defaultPaymentTermsDays" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "TenantFinanceProfile_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "InvoiceDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sentByUserId" TEXT NOT NULL,
    "to" TEXT[],
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceDelivery_tenantId_idx" ON "InvoiceDelivery"("tenantId");

-- CreateIndex
CREATE INDEX "InvoiceDelivery_tenantId_invoiceId_idx" ON "InvoiceDelivery"("tenantId", "invoiceId");

-- AddForeignKey
ALTER TABLE "TenantFinanceProfile" ADD CONSTRAINT "TenantFinanceProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDelivery" ADD CONSTRAINT "InvoiceDelivery_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
