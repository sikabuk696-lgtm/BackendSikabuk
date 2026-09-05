-- ─────────────────────────────────────────────────────────────
-- SikaBuk: Product Cost Price History / Procurement Tracking
-- Run this in the Supabase SQL Editor for your project.
--
-- Tracks every cost price change for a product:
--   'create'  – initial cost when the product was added
--   'restock' – a new shipment of goods at a (possibly new) unit cost
--   'update'  – manual cost price edit
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_cost_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid NOT NULL REFERENCES business_accounts(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id         uuid REFERENCES locations(id) ON DELETE SET NULL,

  change_type         text NOT NULL CHECK (change_type IN ('create', 'restock', 'update')),

  previous_cost_price numeric(12,2),
  new_cost_price      numeric(12,2) NOT NULL,

  quantity_added      integer NOT NULL DEFAULT 0,   -- units brought in (restock/create)
  quantity_after      integer,                       -- stock level after the change
  total_spent         numeric(14,2) NOT NULL DEFAULT 0, -- new_cost_price * quantity_added

  supplier            text,
  note                text,

  changed_by          uuid,        -- worker/owner user id
  changed_by_name     text,        -- denormalised for display

  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Fast lookups per product and per business
CREATE INDEX IF NOT EXISTS idx_cost_history_product
  ON product_cost_history (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cost_history_business
  ON product_cost_history (business_id, created_at DESC);

-- RLS: the backend uses the service role key which bypasses RLS,
-- but enable it so direct client access is denied by default.
ALTER TABLE product_cost_history ENABLE ROW LEVEL SECURITY;
