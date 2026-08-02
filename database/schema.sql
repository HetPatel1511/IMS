-- =============================================================================
-- Manufacturing Inventory Management System — PostgreSQL Schema
-- =============================================================================
-- Storage strategy: HYBRID RELATIONAL + JSONB
--   - Fixed columns for shared item properties (sku, name, quantity, ...)
--   - attributes JSONB for admin-defined dynamic field values
--   - Field metadata lives in field_definitions (no ALTER TABLE when fields change)
--
-- Requires: PostgreSQL 14+ (recommended 16)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "citext";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'ADMIN', 'VIEWER');

CREATE TYPE field_type AS ENUM (
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'DECIMAL',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'EMAIL',
  'PHONE',
  'URL',
  'DROPDOWN',
  'MULTI_SELECT',
  'RADIO',
  'CHECKBOX',
  'COLOR',
  'FILE',
  'IMAGE',
  'CURRENCY',
  'BARCODE',
  'QR_CODE',
  'RELATIONSHIP'
);

CREATE TYPE audit_action AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE');

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Platform
-- =============================================================================

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  role            user_role NOT NULL DEFAULT 'VIEWER',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_users_email_active
  ON users (email)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL UNIQUE,
  value           JSONB NOT NULL DEFAULT '{}'::jsonb,
  description     TEXT,
  updated_by      UUID REFERENCES users (id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Metadata: Inventory Types
-- =============================================================================

CREATE TABLE inventory_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL,            -- machine key, e.g. raw_material
  name            TEXT NOT NULL,            -- display name
  description     TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT chk_inventory_types_code_format
    CHECK (code ~ '^[a-z][a-z0-9_]*$')
);

CREATE UNIQUE INDEX uq_inventory_types_code_active
  ON inventory_types (code)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_inventory_types_updated_at
  BEFORE UPDATE ON inventory_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Metadata: Dynamic Field Definitions
-- =============================================================================
-- Adding / changing fields = INSERT/UPDATE rows here. Never ALTER inventory_items.

CREATE TABLE field_definitions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_type_id   UUID NOT NULL REFERENCES inventory_types (id),
  key                 TEXT NOT NULL,          -- attributes JSONB key, e.g. thickness
  display_name        TEXT NOT NULL,
  description         TEXT,
  field_type          field_type NOT NULL,
  is_required         BOOLEAN NOT NULL DEFAULT FALSE,
  is_unique           BOOLEAN NOT NULL DEFAULT FALSE,
  default_value       JSONB,                  -- typed default; null = none
  validation          JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
    validation examples by field_type:
      TEXT:        {"minLength":1,"maxLength":120,"pattern":"^[A-Z0-9]+$"}
      NUMBER:      {"min":0,"max":10000,"integer":true}
      DECIMAL:     {"min":0,"max":9999.99,"precision":2}
      DROPDOWN:    options live in field_options; validation may add {"allowCustom":false}
      RELATIONSHIP:{"target":"suppliers"}  -- or inventory_types / buyers / inventory_items
  */
  ui                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- ui: {"placeholder":"...","helpText":"...","width":"half","widget":"color-picker"}
  sort_order          INT NOT NULL DEFAULT 0,
  is_visible          BOOLEAN NOT NULL DEFAULT TRUE,
  is_filterable       BOOLEAN NOT NULL DEFAULT FALSE,
  is_searchable       BOOLEAN NOT NULL DEFAULT FALSE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,

  CONSTRAINT chk_field_definitions_key_format
    CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT chk_field_definitions_key_not_reserved
    CHECK (key NOT IN (
      'id','sku','name','quantity','min_quantity','category_id',
      'inventory_type_id','attributes','created_at','updated_at','deleted_at'
    ))
);

CREATE UNIQUE INDEX uq_field_definitions_type_key_active
  ON field_definitions (inventory_type_id, key)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_field_definitions_type_sort
  ON field_definitions (inventory_type_id, sort_order)
  WHERE deleted_at IS NULL AND is_active = TRUE;

CREATE TRIGGER trg_field_definitions_updated_at
  BEFORE UPDATE ON field_definitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Options for DROPDOWN / RADIO / MULTI_SELECT / CHECKBOX choice lists
CREATE TABLE field_options (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_definition_id   UUID NOT NULL REFERENCES field_definitions (id) ON DELETE CASCADE,
  value                 TEXT NOT NULL,        -- stored in attributes JSONB
  label                 TEXT NOT NULL,
  sort_order            INT NOT NULL DEFAULT 0,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_field_options_field_value UNIQUE (field_definition_id, value)
);

CREATE INDEX idx_field_options_field_sort
  ON field_options (field_definition_id, sort_order)
  WHERE is_active = TRUE;

CREATE TRIGGER trg_field_options_updated_at
  BEFORE UPDATE ON field_options
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Categories (scoped to an inventory type)
-- =============================================================================

CREATE TABLE categories (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_type_id   UUID NOT NULL REFERENCES inventory_types (id),
  parent_id           UUID REFERENCES categories (id),
  code                TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  sort_order          INT NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,

  CONSTRAINT chk_categories_code_format
    CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT chk_categories_parent_not_self
    CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE UNIQUE INDEX uq_categories_type_code_active
  ON categories (inventory_type_id, code)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_categories_type_parent
  ON categories (inventory_type_id, parent_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enforce parent belongs to same inventory type
CREATE OR REPLACE FUNCTION enforce_category_parent_same_type()
RETURNS TRIGGER AS $$
DECLARE
  parent_type_id UUID;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT inventory_type_id INTO parent_type_id
  FROM categories
  WHERE id = NEW.parent_id AND deleted_at IS NULL;

  IF parent_type_id IS NULL THEN
    RAISE EXCEPTION 'Parent category % not found', NEW.parent_id;
  END IF;

  IF parent_type_id <> NEW.inventory_type_id THEN
    RAISE EXCEPTION 'Parent category must belong to the same inventory type';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_categories_parent_same_type
  BEFORE INSERT OR UPDATE OF parent_id, inventory_type_id ON categories
  FOR EACH ROW EXECUTE FUNCTION enforce_category_parent_same_type();

-- =============================================================================
-- Parties: Suppliers & Buyers
-- =============================================================================

CREATE TABLE suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  contact_name    TEXT,
  email           CITEXT,
  phone           TEXT,
  address         TEXT,
  notes           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- future extensibility
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT chk_suppliers_code_format
    CHECK (code ~ '^[A-Za-z0-9_-]+$')
);

CREATE UNIQUE INDEX uq_suppliers_code_active
  ON suppliers (code)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_suppliers_name_trgm
  ON suppliers USING gin (name gin_trgm_ops);

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE buyers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  contact_name    TEXT,
  email           CITEXT,
  phone           TEXT,
  address         TEXT,
  notes           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT chk_buyers_code_format
    CHECK (code ~ '^[A-Za-z0-9_-]+$')
);

CREATE UNIQUE INDEX uq_buyers_code_active
  ON buyers (code)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_buyers_name_trgm
  ON buyers USING gin (name gin_trgm_ops);

CREATE TRIGGER trg_buyers_updated_at
  BEFORE UPDATE ON buyers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Files (FILE / IMAGE dynamic fields store file ids in attributes)
-- =============================================================================

CREATE TABLE files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key     TEXT NOT NULL UNIQUE,
  original_name   TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      BIGINT NOT NULL CHECK (size_bytes >= 0),
  uploaded_by     UUID REFERENCES users (id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Inventory Items (fixed columns + dynamic attributes JSONB)
-- =============================================================================

CREATE TABLE inventory_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_type_id   UUID NOT NULL REFERENCES inventory_types (id),
  category_id         UUID REFERENCES categories (id),
  sku                 TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  quantity            NUMERIC(18, 4) NOT NULL DEFAULT 0,
  min_quantity        NUMERIC(18, 4) NOT NULL DEFAULT 0,
  unit                TEXT,                       -- e.g. kg, pcs, m — from settings later
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  attributes          JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
    attributes keys MUST match field_definitions.key for this inventory_type_id.
    Example:
      {
        "grade": "A36",
        "thickness": 3.2,
        "width": 1220,
        "length": 2440,
        "finish": ["galvanized"],
        "datasheet": "550e8400-e29b-41d4-a716-446655440000"
      }
    Application layer validates against field_definitions; DB stores the document.
  */
  created_by          UUID REFERENCES users (id),
  updated_by          UUID REFERENCES users (id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,

  CONSTRAINT chk_inventory_items_quantity_nonneg
    CHECK (quantity >= 0),
  CONSTRAINT chk_inventory_items_min_quantity_nonneg
    CHECK (min_quantity >= 0),
  CONSTRAINT chk_inventory_items_attributes_object
    CHECK (jsonb_typeof(attributes) = 'object')
);

CREATE UNIQUE INDEX uq_inventory_items_type_sku_active
  ON inventory_items (inventory_type_id, sku)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_inventory_items_type
  ON inventory_items (inventory_type_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_inventory_items_category
  ON inventory_items (category_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_inventory_items_name_trgm
  ON inventory_items USING gin (name gin_trgm_ops);

CREATE INDEX idx_inventory_items_sku_trgm
  ON inventory_items USING gin (sku gin_trgm_ops);

-- Primary index for dynamic attribute filters / containment queries
CREATE INDEX idx_inventory_items_attributes_gin
  ON inventory_items USING gin (attributes jsonb_path_ops);

-- Low-stock dashboard helper
CREATE INDEX idx_inventory_items_low_stock
  ON inventory_items (inventory_type_id)
  WHERE deleted_at IS NULL AND is_active = TRUE AND quantity <= min_quantity;

CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Category must belong to the same inventory type as the item
CREATE OR REPLACE FUNCTION enforce_item_category_same_type()
RETURNS TRIGGER AS $$
DECLARE
  cat_type_id UUID;
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT inventory_type_id INTO cat_type_id
  FROM categories
  WHERE id = NEW.category_id AND deleted_at IS NULL;

  IF cat_type_id IS NULL THEN
    RAISE EXCEPTION 'Category % not found', NEW.category_id;
  END IF;

  IF cat_type_id <> NEW.inventory_type_id THEN
    RAISE EXCEPTION 'Category must belong to the same inventory type as the item';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_items_category_same_type
  BEFORE INSERT OR UPDATE OF category_id, inventory_type_id ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION enforce_item_category_same_type();

-- =============================================================================
-- Item ↔ Supplier (many-to-many)
-- =============================================================================

CREATE TABLE inventory_item_suppliers (
  inventory_item_id   UUID NOT NULL REFERENCES inventory_items (id) ON DELETE CASCADE,
  supplier_id         UUID NOT NULL REFERENCES suppliers (id),
  is_preferred        BOOLEAN NOT NULL DEFAULT FALSE,
  supplier_sku        TEXT,
  lead_time_days      INT CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (inventory_item_id, supplier_id)
);

CREATE INDEX idx_item_suppliers_supplier
  ON inventory_item_suppliers (supplier_id);

-- At most one preferred supplier per item
CREATE UNIQUE INDEX uq_item_preferred_supplier
  ON inventory_item_suppliers (inventory_item_id)
  WHERE is_preferred = TRUE;

-- =============================================================================
-- Audit Log (append-only)
-- =============================================================================

CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id        UUID REFERENCES users (id),
  action          audit_action NOT NULL,
  entity_type     TEXT NOT NULL,              -- e.g. inventory_items, field_definitions
  entity_id       UUID NOT NULL,
  summary         TEXT,
  before_data     JSONB,
  after_data      JSONB,
  request_id      TEXT,
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity
  ON audit_logs (entity_type, entity_id, created_at DESC);

CREATE INDEX idx_audit_logs_actor
  ON audit_logs (actor_id, created_at DESC);

CREATE INDEX idx_audit_logs_created
  ON audit_logs (created_at DESC);

-- =============================================================================
-- Optional: expression indexes for hot filterable attributes
-- Create these ONLY for keys that are filterable and high-traffic.
-- Example for raw materials thickness:
--
--   CREATE INDEX idx_items_attr_thickness
--     ON inventory_items ((attributes->>'thickness'))
--     WHERE deleted_at IS NULL
--       AND inventory_type_id = '<raw_material_type_uuid>';
--
-- Prefer application-managed index creation when an admin marks a field filterable.
-- =============================================================================

-- =============================================================================
-- Seed: default inventory types (optional)
-- =============================================================================

INSERT INTO inventory_types (code, name, description, sort_order) VALUES
  ('raw_material', 'Raw Material', 'Base materials used in manufacturing', 1),
  ('semi_finished', 'Semi Finished Goods', 'Partially processed goods', 2),
  ('finished_goods', 'Finished Goods', 'Completed products ready for sale', 3);

-- =============================================================================
-- Example queries (reference — not executed)
-- =============================================================================
--
-- 1) Filter items by dynamic attribute equality:
--    SELECT * FROM inventory_items
--    WHERE inventory_type_id = $1
--      AND deleted_at IS NULL
--      AND attributes @> '{"grade":"A36"}'::jsonb;
--
-- 2) Numeric range on a dynamic attribute:
--    SELECT * FROM inventory_items
--    WHERE inventory_type_id = $1
--      AND deleted_at IS NULL
--      AND (attributes->>'thickness')::numeric BETWEEN 2 AND 5;
--
-- 3) Load schema for a type (form builder / validator):
--    SELECT fd.*, COALESCE(
--             json_agg(json_build_object('value', fo.value, 'label', fo.label)
--                      ORDER BY fo.sort_order)
--               FILTER (WHERE fo.id IS NOT NULL), '[]') AS options
--    FROM field_definitions fd
--    LEFT JOIN field_options fo
--      ON fo.field_definition_id = fd.id AND fo.is_active
--    WHERE fd.inventory_type_id = $1
--      AND fd.deleted_at IS NULL AND fd.is_active
--    GROUP BY fd.id
--    ORDER BY fd.sort_order;
--
-- 4) Unique check for a dynamic attribute (application or partial unique index):
--    SELECT 1 FROM inventory_items
--    WHERE inventory_type_id = $1
--      AND deleted_at IS NULL
--      AND attributes->>'barcode' = $2
--      AND id <> COALESCE($3, '00000000-0000-0000-0000-000000000000'::uuid);
