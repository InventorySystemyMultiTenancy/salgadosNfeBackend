-- AlterEnum
ALTER TYPE "FiscalStatus" ADD VALUE 'PENDING';

-- AlterEnum
ALTER TYPE "GatewayProvider" ADD VALUE 'NFEIO';

-- AlterTable
ALTER TABLE "fiscal_settings" ADD COLUMN     "gateway_company_id" TEXT;
