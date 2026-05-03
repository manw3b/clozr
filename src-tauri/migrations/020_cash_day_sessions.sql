-- Sesiones diarias de caja (apertura / cierre con balance dual ARS/USD).
-- Resuelve el gap de CashSummary.openingBalance que estaba hardcoded en 0.

CREATE TABLE cash_day_sessions (
  id                   TEXT PRIMARY KEY,
  workspace_id         TEXT NOT NULL,
  business_id          TEXT NOT NULL,
  -- Date in YYYY-MM-DD (one session per business per day)
  session_date         TEXT NOT NULL,
  opened_at            TEXT NOT NULL,
  opened_balance_ars   REAL DEFAULT 0,
  opened_balance_usd   REAL DEFAULT 0,
  opened_by_user_id    TEXT,
  closed_at            TEXT,
  closed_balance_ars   REAL,
  closed_balance_usd   REAL,
  closed_by_user_id    TEXT,
  notes                TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_cash_day_sessions_unique
  ON cash_day_sessions (workspace_id, business_id, session_date);

CREATE INDEX idx_cash_day_sessions_recent
  ON cash_day_sessions (workspace_id, business_id, session_date DESC);
