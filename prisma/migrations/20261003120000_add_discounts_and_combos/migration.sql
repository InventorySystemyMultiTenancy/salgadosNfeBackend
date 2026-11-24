-- AlterTable
ALTER TABLE "products" ADD COLUMN     "is_combo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discount_approved_by_id" INTEGER,
ADD COLUMN     "discount_reason" TEXT,
ADD COLUMN     "subtotal_amount" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "combo_items" (
    "id" SERIAL NOT NULL,
    "combo_id" INTEGER NOT NULL,
    "component_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "combo_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" SERIAL NOT NULL,
    "max_discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "combo_items_combo_id_component_id_key" ON "combo_items"("combo_id", "component_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_approved_by_id_fkey" FOREIGN KEY ("discount_approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

