CREATE TABLE IF NOT EXISTS customer_types (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT 'blue',
  sort_order INTEGER DEFAULT 0
);
