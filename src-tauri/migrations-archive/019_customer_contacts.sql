-- Tracking real de contactos con clientes (WhatsApp, llamadas, email, visita).
-- Resuelve el gap de Client.lastContactAt que hasta ahora usaba customer.updated_at como proxy.

CREATE TABLE customer_contacts (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  customer_id  TEXT NOT NULL,
  kind         TEXT NOT NULL,        -- 'whatsapp' | 'call' | 'email' | 'visit' | 'note'
  at           TEXT NOT NULL,        -- ISO timestamp
  by_user_id   TEXT,
  by_user_name TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX idx_customer_contacts_customer ON customer_contacts (workspace_id, customer_id, at DESC);
CREATE INDEX idx_customer_contacts_recent ON customer_contacts (workspace_id, at DESC);
