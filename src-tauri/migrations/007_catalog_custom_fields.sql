ALTER TABLE catalog_items ADD COLUMN custom_fields_json TEXT;

CREATE TABLE IF NOT EXISTS catalog_field_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  category TEXT,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  options_json TEXT,
  required INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);
