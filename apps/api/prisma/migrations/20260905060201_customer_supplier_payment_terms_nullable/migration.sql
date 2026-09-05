-- AlterTable
ALTER TABLE "CustomerRole" ALTER COLUMN "paymentTerms" DROP NOT NULL,
ALTER COLUMN "paymentTerms" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SupplierRole" ALTER COLUMN "paymentTerms" DROP NOT NULL,
ALTER COLUMN "paymentTerms" DROP DEFAULT;
