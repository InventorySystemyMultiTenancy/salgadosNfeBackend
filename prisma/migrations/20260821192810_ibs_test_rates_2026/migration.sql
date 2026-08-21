-- AlterTable: widen precision to Decimal(6,4) and fix 2026 test-rate defaults
-- (IBS goes entirely to UF in 2026, splits 0.05/0.05 only from 2027 per
-- Ato Conjunto RFB/CGIBS Nº 1/2025)
ALTER TABLE "fiscal_settings" ALTER COLUMN "cbs_rate" TYPE DECIMAL(6,4);
ALTER TABLE "fiscal_settings" ALTER COLUMN "cbs_rate" SET DEFAULT 0.9;

ALTER TABLE "fiscal_settings" ALTER COLUMN "ibs_uf_rate" TYPE DECIMAL(6,4);
ALTER TABLE "fiscal_settings" ALTER COLUMN "ibs_uf_rate" SET DEFAULT 0.1;

ALTER TABLE "fiscal_settings" ALTER COLUMN "ibs_mun_rate" TYPE DECIMAL(6,4);
ALTER TABLE "fiscal_settings" ALTER COLUMN "ibs_mun_rate" SET DEFAULT 0;
