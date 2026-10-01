-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('NONE', 'MERCADO_PAGO', 'SUMUP');

-- CreateEnum
CREATE TYPE "TerminalPaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'CANCELED', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "payment_settings" (
    "id" SERIAL NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'NONE',
    "api_key" TEXT,
    "account_id" TEXT,
    "terminal_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal_payments" (
    "id" SERIAL NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "provider_id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "TerminalPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider_status" TEXT,
    "status_detail" TEXT,
    "payment_type" TEXT,
    "seller_id" INTEGER NOT NULL,
    "order_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminal_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "terminal_payments_order_id_key" ON "terminal_payments"("order_id");

-- CreateIndex
CREATE INDEX "terminal_payments_status_idx" ON "terminal_payments"("status");

-- AddForeignKey
ALTER TABLE "terminal_payments" ADD CONSTRAINT "terminal_payments_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_payments" ADD CONSTRAINT "terminal_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

