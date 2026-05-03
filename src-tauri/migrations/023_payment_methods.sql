-- Métodos de pago configurables por workspace, con modificador % +/-.
-- Reemplaza la lista fija de PaymentMethod en el dominio.

CREATE TABLE payment_methods (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  name          TEXT NOT NULL,           -- "Efectivo ARS", "Crypto USDT", etc.
  -- Porcentaje a aplicar sobre el precio base (positivo o negativo).
  -- +12 = el cliente paga 12% más (cubre comisión de tarjeta)
  -- -3  = el cliente paga 3% menos (descuento por efectivo)
  modifier_pct  REAL DEFAULT 0,
  -- Moneda en la que se cobra cuando se elige este método.
  currency      TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  -- Tipo abstracto para mapear hacia los movimientos de caja existentes
  -- (efectivo / transferencia / mercadopago / tarjeta_credito / tarjeta_debito /
  --  cuenta_corriente / usdt / otro).
  kind          TEXT NOT NULL,
  active        INTEGER DEFAULT 1,
  sort_order    INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_payment_methods_workspace
  ON payment_methods (workspace_id, active, sort_order);

-- Seed defaults para cada workspace existente.
-- (Cada workspace nuevo arranca llamando a paymentMethodsDb.seedDefaults)
INSERT INTO payment_methods (id, workspace_id, name, modifier_pct, currency, kind, active, sort_order, created_at, updated_at)
SELECT lower(hex(randomblob(16))), w.id, 'Efectivo ARS',          -3, 'ARS', 'efectivo',         1, 1, datetime('now'), datetime('now') FROM workspaces w
UNION ALL SELECT lower(hex(randomblob(16))), w.id, 'Efectivo USD',          0, 'USD', 'efectivo',         1, 2, datetime('now'), datetime('now') FROM workspaces w
UNION ALL SELECT lower(hex(randomblob(16))), w.id, 'Efectivo USD cara chica', 5, 'USD', 'efectivo',       1, 3, datetime('now'), datetime('now') FROM workspaces w
UNION ALL SELECT lower(hex(randomblob(16))), w.id, 'Transferencia',          0, 'ARS', 'transferencia',   1, 4, datetime('now'), datetime('now') FROM workspaces w
UNION ALL SELECT lower(hex(randomblob(16))), w.id, 'Crypto USDT',           -2, 'USD', 'usdt',            1, 5, datetime('now'), datetime('now') FROM workspaces w
UNION ALL SELECT lower(hex(randomblob(16))), w.id, 'MercadoPago',            6, 'ARS', 'mercadopago',     1, 6, datetime('now'), datetime('now') FROM workspaces w
UNION ALL SELECT lower(hex(randomblob(16))), w.id, 'Tarjeta crédito',       12, 'ARS', 'tarjeta_credito', 1, 7, datetime('now'), datetime('now') FROM workspaces w
UNION ALL SELECT lower(hex(randomblob(16))), w.id, 'Tarjeta débito',         3, 'ARS', 'tarjeta_debito',  1, 8, datetime('now'), datetime('now') FROM workspaces w
UNION ALL SELECT lower(hex(randomblob(16))), w.id, 'Cuenta corriente',       0, 'ARS', 'cuenta_corriente',1, 9, datetime('now'), datetime('now') FROM workspaces w;
