-- CreateEnum
CREATE TYPE "StockTransactionType" AS ENUM ('PURCHASE', 'SALE');

-- CreateTable
CREATE TABLE "stock_transactions" (
    "id" UUID NOT NULL,
    "type" "StockTransactionType" NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "inventory_type_id" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "quantity_before" DECIMAL(18,4) NOT NULL,
    "quantity_after" DECIMAL(18,4) NOT NULL,
    "supplier_id" UUID,
    "buyer_id" UUID,
    "unit_price" DECIMAL(18,4),
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_transactions_created_at_idx" ON "stock_transactions"("created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_transactions_type_created_at_idx" ON "stock_transactions"("type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_transactions_inventory_item_id_created_at_idx" ON "stock_transactions"("inventory_item_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_transactions_inventory_type_id_created_at_idx" ON "stock_transactions"("inventory_type_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_transactions_supplier_id_created_at_idx" ON "stock_transactions"("supplier_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_transactions_buyer_id_created_at_idx" ON "stock_transactions"("buyer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_transactions_quantity_idx" ON "stock_transactions"("quantity");

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_inventory_type_id_fkey" FOREIGN KEY ("inventory_type_id") REFERENCES "inventory_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
