# Data Model

Source of truth: `apps/api/prisma/schema.prisma` (PostgreSQL).
Interactive diagram: open **`docs/db-schema.html`** in a browser (drag tables, hover a
relationship line for its description, light/dark, search). 13 tables, 18 FKs, 4 enums.

## Tables (grouped)

**People / system**
- `users` — PK id; unique email; role (UserRole); soft-deleted. Referenced by settings,
  files, inventory_items (created/updated by), stock_transactions, audit_logs.
- `settings` — key/value JSON (e.g. `org`: name, locale, defaultUnit); FK updated_by→users.
- `files` — presigned S3 objects; FK uploaded_by→users.
- `audit_logs` — append-only trail; FK actor_id→users; before/after JSON, requestId.

**Metadata (the configurable schema)**
- `inventory_types` — PK id; unique code; soft-deleted.
- `field_definitions` — FK inventory_type_id→inventory_types; unique (type, key);
  fieldType (FieldType), validation/ui/defaultValue JSON, flags, sortOrder.
- `field_options` — FK field_definition_id→field_definitions (ON DELETE CASCADE);
  unique (field, value). Values for DROPDOWN/RADIO/MULTI_SELECT.
- `categories` — FK inventory_type_id→inventory_types; self-FK parent_id→categories
  (tree); unique (type, code).

**Core inventory**
- `inventory_items` — FK inventory_type_id→inventory_types, category_id→categories,
  created_by/updated_by→users; unique (type, sku); quantity/minQuantity Decimal(18,4);
  **attributes JSON** (validated by the type's field schema); soft-deleted.
- `inventory_item_suppliers` — join; composite PK (item, supplier); FK item→inventory_items
  (CASCADE), supplier→suppliers; isPreferred, supplierSku, leadTimeDays.
- `stock_transactions` — FK item→inventory_items, type→inventory_types, supplier→suppliers,
  buyer→buyers, created_by→users; type (PURCHASE/SALE); quantity + before/after
  (running balance) + unitPrice; many time-ordered indexes.

**Parties**
- `suppliers`, `buyers` — PK id; unique code; contact fields; metadata JSON; soft-deleted.

## Enums
- `UserRole`: SUPER_ADMIN, ADMIN, VIEWER
- `FieldType` (21): TEXT, LONG_TEXT, NUMBER, DECIMAL, BOOLEAN, DATE, DATETIME, EMAIL,
  PHONE, URL, DROPDOWN, MULTI_SELECT, RADIO, CHECKBOX, COLOR, FILE, IMAGE, CURRENCY,
  BARCODE, QR_CODE, RELATIONSHIP
- `AuditAction`: CREATE, UPDATE, DELETE, RESTORE
- `StockTransactionType`: PURCHASE, SALE

## Vocabulary note
Column names are `snake_case` in Postgres (via Prisma `@map`); Prisma models use
`camelCase`. The web app and API DTOs use `camelCase`.
