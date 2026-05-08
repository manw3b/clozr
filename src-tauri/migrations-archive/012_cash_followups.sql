CREATE TABLE cash_movements (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL,
  business_id     TEXT NOT NULL,
  type            TEXT NOT NULL,
  direction       TEXT NOT NULL,
  amount          REAL NOT NULL,
  currency        TEXT DEFAULT 'ARS',
  description     TEXT,
  customer_id     TEXT,
  customer_name   TEXT,
  reference_id    TEXT,
  reference_type  TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE followups (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  business_id   TEXT NOT NULL,
  customer_id   TEXT,
  customer_name TEXT,
  text          TEXT NOT NULL,
  due_date      TEXT NOT NULL,
  completed     INTEGER DEFAULT 0,
  completed_at  TEXT,
  created_at    TEXT NOT NULL
);
