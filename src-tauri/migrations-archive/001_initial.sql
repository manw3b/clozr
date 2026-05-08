CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '🏪',
  color TEXT DEFAULT '#E8001D',
  plan TEXT DEFAULT 'free',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'vendedor',
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  type TEXT DEFAULT 'final',
  status TEXT DEFAULT 'potencial',
  pricing_policy_json TEXT,
  barrio TEXT,
  address TEXT,
  notes TEXT,
  total_sales REAL DEFAULT 0,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS pipeline_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  stage_id TEXT NOT NULL,
  stage_name TEXT NOT NULL,
  stage_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open',
  estimated_value REAL,
  currency TEXT DEFAULT 'ARS',
  inactive_days INTEGER DEFAULT 0,
  closed_at TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS pipeline_activities (
  id TEXT PRIMARY KEY,
  pipeline_item_id TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  result TEXT,
  performed_at TEXT DEFAULT (datetime('now')),
  performed_by TEXT,
  FOREIGN KEY (pipeline_item_id) REFERENCES pipeline_items(id)
);

CREATE TABLE IF NOT EXISTS catalog_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  subcategory TEXT,
  price REAL,
  currency TEXT DEFAULT 'ARS',
  track_stock INTEGER DEFAULT 0,
  stock INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS catalog_imei (
  id TEXT PRIMARY KEY,
  catalog_item_id TEXT NOT NULL,
  imei TEXT NOT NULL UNIQUE,
  sold_at TEXT,
  sale_id TEXT,
  FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id)
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  customer_id TEXT,
  customer_name TEXT,
  seller_id TEXT,
  seller_name TEXT,
  subtotal REAL DEFAULT 0,
  total REAL DEFAULT 0,
  total_paid REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  is_paid INTEGER DEFAULT 0,
  notes TEXT,
  sale_date TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  catalog_item_id TEXT,
  description TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price REAL NOT NULL,
  base_price REAL,
  subtotal REAL NOT NULL,
  imei TEXT,
  from_stock INTEGER DEFAULT 0,
  FOREIGN KEY (sale_id) REFERENCES sales(id)
);

CREATE TABLE IF NOT EXISTS sale_payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  method TEXT NOT NULL,
  currency TEXT DEFAULT 'ARS',
  amount REAL NOT NULL,
  is_deposit INTEGER DEFAULT 0,
  FOREIGN KEY (sale_id) REFERENCES sales(id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  type TEXT DEFAULT 'rutina',
  frequency TEXT,
  title TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  completed_at TEXT,
  assigned_to TEXT,
  due_at TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
