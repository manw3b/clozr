CREATE TABLE IF NOT EXISTS exchange_rates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  usd_to_ars REAL NOT NULL DEFAULT 1000,
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

ALTER TABLE workspaces ADD COLUMN daily_goal REAL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN daily_goal_currency TEXT DEFAULT 'USD';
