CREATE TABLE IF NOT EXISTS product_templates (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  name TEXT NOT NULL,
  storage TEXT,
  color TEXT,
  screen_size TEXT,
  year INTEGER,
  condition TEXT DEFAULT 'new',
  is_builtin INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
