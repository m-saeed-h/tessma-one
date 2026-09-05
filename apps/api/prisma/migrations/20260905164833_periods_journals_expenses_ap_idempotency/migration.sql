-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "expenseId" TEXT,
ADD COLUMN     "journalId" TEXT,
ADD COLUMN     "purchaseInvoiceId" TEXT,
ADD COLUMN     "supplierPaymentId" TEXT;

-- AlterTable
ALTER TABLE "NumberSequence" ADD COLUMN     "padding" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "prefix" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "suffix" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "useYearToken" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TenantFinanceProfile" ADD COLUMN     "accountingBasis" TEXT NOT NULL DEFAULT 'ACCRUAL',
ADD COLUMN     "baseCurrency" TEXT NOT NULL DEFAULT 'GBP',
ADD COLUMN     "baseCurrencyLockedAt" TIMESTAMP(3),
ADD COLUMN     "financialYearStartDay" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "financialYearStartMonth" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedByUserId" TEXT,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "supplierId" TEXT,
    "category" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "net" BIGINT NOT NULL,
    "vat" BIGINT NOT NULL,
    "gross" BIGINT NOT NULL,
    "vatRecoverable" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethod" TEXT NOT NULL,
    "receiptDocId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "reference" TEXT,
    "purchaseOrderRef" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "netTotal" BIGINT NOT NULL DEFAULT 0,
    "vatTotal" BIGINT NOT NULL DEFAULT 0,
    "grossTotal" BIGINT NOT NULL DEFAULT 0,
    "allocatedTotal" BIGINT NOT NULL DEFAULT 0,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoiceLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "nominalCode" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" BIGINT NOT NULL,
    "vatRatePct" INTEGER NOT NULL DEFAULT 20,
    "net" BIGINT NOT NULL,
    "vat" BIGINT NOT NULL,
    "total" BIGINT NOT NULL,

    CONSTRAINT "PurchaseInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "amount" BIGINT NOT NULL,
    "unallocated" BIGINT NOT NULL,
    "paidDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPaymentAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierPaymentId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "SupplierPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "postedByUserId" TEXT NOT NULL,
    "reversalOfJournalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountingPeriod_tenantId_idx" ON "AccountingPeriod"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_tenantId_startDate_key" ON "AccountingPeriod"("tenantId", "startDate");

-- CreateIndex
CREATE INDEX "Expense_tenantId_idx" ON "Expense"("tenantId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_tenantId_idx" ON "PurchaseInvoice"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_tenantId_supplierId_number_key" ON "PurchaseInvoice"("tenantId", "supplierId", "number");

-- CreateIndex
CREATE INDEX "PurchaseInvoiceLine_tenantId_idx" ON "PurchaseInvoiceLine"("tenantId");

-- CreateIndex
CREATE INDEX "SupplierPayment_tenantId_idx" ON "SupplierPayment"("tenantId");

-- CreateIndex
CREATE INDEX "SupplierPaymentAllocation_tenantId_idx" ON "SupplierPaymentAllocation"("tenantId");

-- CreateIndex
CREATE INDEX "Journal_tenantId_idx" ON "Journal"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_tenantId_endpoint_key_key" ON "IdempotencyKey"("tenantId", "endpoint", "key");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
