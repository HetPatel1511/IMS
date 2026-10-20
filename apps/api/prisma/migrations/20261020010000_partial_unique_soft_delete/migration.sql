-- Scope the uniqueness of soft-deletable natural keys to LIVE rows only.
-- Previously these were plain UNIQUE indexes that ignored `deleted_at`, so once a record
-- was soft-deleted its code/SKU/key stayed reserved and it could never be recreated
-- (v4 B0). Replacing them with partial unique indexes (WHERE deleted_at IS NULL) keeps
-- uniqueness enforced for active records while freeing deleted ones for reuse.

-- inventory_types.code
DROP INDEX IF EXISTS "inventory_types_code_key";
CREATE UNIQUE INDEX "inventory_types_code_key"
  ON "inventory_types" ("code") WHERE "deleted_at" IS NULL;

-- suppliers.code
DROP INDEX IF EXISTS "suppliers_code_key";
CREATE UNIQUE INDEX "suppliers_code_key"
  ON "suppliers" ("code") WHERE "deleted_at" IS NULL;

-- buyers.code
DROP INDEX IF EXISTS "buyers_code_key";
CREATE UNIQUE INDEX "buyers_code_key"
  ON "buyers" ("code") WHERE "deleted_at" IS NULL;

-- inventory_items (inventory_type_id, sku)
DROP INDEX IF EXISTS "inventory_items_inventory_type_id_sku_key";
CREATE UNIQUE INDEX "inventory_items_inventory_type_id_sku_key"
  ON "inventory_items" ("inventory_type_id", "sku") WHERE "deleted_at" IS NULL;

-- field_definitions (inventory_type_id, key)
DROP INDEX IF EXISTS "field_definitions_inventory_type_id_key_key";
CREATE UNIQUE INDEX "field_definitions_inventory_type_id_key_key"
  ON "field_definitions" ("inventory_type_id", "key") WHERE "deleted_at" IS NULL;
