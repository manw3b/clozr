CREATE TABLE businesses (
  id          TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name        TEXT NOT NULL,
  emoji       TEXT DEFAULT '🏪',
  color       TEXT DEFAULT '#E8001D',
  daily_goal  REAL DEFAULT 0,
  currency    TEXT DEFAULT 'ARS',
  active      INTEGER DEFAULT 1,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL
);

-- Seed: each existing workspace becomes its own default business
INSERT INTO businesses (id, workspace_id, name, emoji, color, daily_goal, currency, active, sort_order, created_at)
SELECT id, id, name, COALESCE(emoji, '🏪'), COALESCE(color, '#E8001D'), 0, 'ARS', 1, 0, created_at
FROM workspaces;

-- Add business_id to sales (points to default business = workspace)
ALTER TABLE sales ADD COLUMN business_id TEXT;
UPDATE sales SET business_id = workspace_id;
