-- Pricing del catálogo: costo + precios por tipo de cliente.
-- Cada precio se almacena en USD (source of truth). La conversión a ARS
-- se hace en runtime con la cotización del workspace.

ALTER TABLE catalog_items ADD COLUMN cost_usd REAL DEFAULT 0;

-- Precio público sugerido por tipo de cliente (final, revendedor, mayorista, etc.)
-- Usa el customer_type.id como key (la tabla customer_types ya existe — migration 004).
CREATE TABLE catalog_prices (
  catalog_item_id   TEXT NOT NULL,
  customer_type_id  TEXT NOT NULL,
  price_usd         REAL NOT NULL,
  updated_at        TEXT NOT NULL,
  PRIMARY KEY (catalog_item_id, customer_type_id),
  FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_catalog_prices_lookup
  ON catalog_prices (catalog_item_id, customer_type_id);
