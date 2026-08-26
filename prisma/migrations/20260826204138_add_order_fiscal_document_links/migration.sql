-- CreateEnum
CREATE TYPE "FiscalType" AS ENUM ('NFCE', 'NFE');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "fiscal_danfe_url" TEXT,
ADD COLUMN     "fiscal_type" "FiscalType",
ADD COLUMN     "fiscal_xml_url" TEXT;
