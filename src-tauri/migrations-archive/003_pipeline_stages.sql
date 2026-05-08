CREATE TABLE IF NOT EXISTS pipeline_stages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  stage_order INTEGER DEFAULT 0,
  color TEXT DEFAULT 'gray',
  is_won INTEGER DEFAULT 0,
  is_lost INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Promote first member of each workspace to owner
UPDATE workspace_members
SET role = 'owner'
WHERE (workspace_id || '|' || user_id) IN (
  SELECT workspace_id || '|' || user_id
  FROM workspace_members wm1
  WHERE joined_at = (
    SELECT MIN(joined_at) FROM workspace_members wm2 WHERE wm2.workspace_id = wm1.workspace_id
  )
);
