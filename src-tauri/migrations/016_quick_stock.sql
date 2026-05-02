CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_families (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (category_id) REFERENCES product_categories(id)
);

CREATE TABLE IF NOT EXISTS product_models (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  name TEXT NOT NULL,
  image_path TEXT,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (family_id) REFERENCES product_families(id)
);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  color TEXT NOT NULL,
  color_hex TEXT,
  storage TEXT,
  sku TEXT,
  image_path TEXT,
  is_available INTEGER DEFAULT 1,
  FOREIGN KEY (model_id) REFERENCES product_models(id)
);

CREATE TABLE IF NOT EXISTS stock_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  catalog_item_id TEXT,
  imei TEXT NOT NULL,
  status TEXT DEFAULT 'available',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  sold_at TEXT,
  sale_id TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (variant_id) REFERENCES product_variants(id)
);

CREATE INDEX IF NOT EXISTS idx_stock_workspace ON stock_items(workspace_id);
CREATE INDEX IF NOT EXISTS idx_stock_status ON stock_items(status);
CREATE INDEX IF NOT EXISTS idx_stock_imei ON stock_items(imei);
