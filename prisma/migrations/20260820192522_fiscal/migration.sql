-- CreateEnum
CREATE TYPE "GatewayProvider" AS ENUM ('NONE', 'FOCUS_NFE', 'PLUGNOTAS');

-- CreateEnum
CREATE TYPE "FiscalEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "fiscal_error" TEXT,
ADD COLUMN     "fiscal_key" TEXT;

-- CreateTable
CREATE TABLE "fiscal_settings" (
    "id" SERIAL NOT NULL,
    "company_name" TEXT,
    "cnpj" TEXT,
    "icms_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gateway_provider" "GatewayProvider" NOT NULL DEFAULT 'NONE',
    "gateway_api_key" TEXT,
    "environment" "FiscalEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_settings_pkey" PRIMARY KEY ("id")
);
