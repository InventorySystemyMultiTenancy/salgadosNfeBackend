-- AlterTable
ALTER TABLE "fiscal_settings" ADD COLUMN     "cbs_rate" DECIMAL(5,2) NOT NULL DEFAULT 0.9,
ADD COLUMN     "ibs_cbs_classificacao_tributaria" TEXT NOT NULL DEFAULT '000001',
ADD COLUMN     "ibs_cbs_situacao_tributaria" TEXT NOT NULL DEFAULT '000',
ADD COLUMN     "ibs_mun_rate" DECIMAL(5,2) NOT NULL DEFAULT 0.05,
ADD COLUMN     "ibs_uf_rate" DECIMAL(5,2) NOT NULL DEFAULT 0.05;
