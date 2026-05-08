-- Campos adicionales para pipeline_items que la UI ya espera (Lead).
-- Resuelve los gaps: product, next_action_at/label, owner_id/name, short_note.

ALTER TABLE pipeline_items ADD COLUMN product TEXT;
ALTER TABLE pipeline_items ADD COLUMN next_action_at TEXT;
ALTER TABLE pipeline_items ADD COLUMN next_action_label TEXT;
ALTER TABLE pipeline_items ADD COLUMN owner_id TEXT;
ALTER TABLE pipeline_items ADD COLUMN owner_name TEXT;
ALTER TABLE pipeline_items ADD COLUMN short_note TEXT;
ALTER TABLE pipeline_items ADD COLUMN priority TEXT;     -- 'low' | 'medium' | 'high' | 'hot' (override del calculado por inactive_days)
ALTER TABLE pipeline_items ADD COLUMN position INTEGER;  -- orden dentro de la columna (drag&drop reordenar)
