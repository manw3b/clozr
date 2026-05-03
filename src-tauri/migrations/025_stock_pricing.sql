-- Override de precios por unidad individual de stock.
-- Útil para equipos USADOS donde cada unidad puede tener un precio distinto
-- según su condición (batería, scratches, etc.).
--
-- Lookup al vender:
--   1. ¿Hay precio en stock_item_prices(stock_item_id, customer_type_id)? → usar
--   2. ¿Hay precio en catalog_prices(catalog_item_id, customer_type_id)? → usar
--   3. Sin precio definido → vendedor lo ingresa manual

ALTER TABLE stock_items ADD COLUMN cost_usd_override REAL;

CREATE TABLE stock_item_prices (
  stock_item_id     TEXT NOT NULL,
  customer_type_id  TEXT NOT NULL,
  price_usd         REAL NOT NULL,
  updated_at        TEXT NOT NULL,
  PRIMARY KEY (stock_item_id, customer_type_id),
  FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_stock_item_prices_lookup
  ON stock_item_prices (stock_item_id, customer_type_id);

-- Marca de venta fuera de stock (para la cola de regularización).
ALTER TABLE sales ADD COLUMN out_of_stock_sale INTEGER DEFAULT 0;
ALTER TABLE sales ADD COLUMN regularized_at TEXT;
ALTER TABLE sales ADD COLUMN regularized_by TEXT;

CREATE INDEX idx_sales_pending_regularization
  ON sales (workspace_id, out_of_stock_sale, regularized_at);
