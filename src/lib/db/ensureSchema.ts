import type Database from "@tauri-apps/plugin-sql";

/**
 * Replayer defensivo de TODAS las migraciones (001-025) en JS.
 *
 * Garantiza que el schema esté completo independientemente del estado real
 * de la DB local — útil para usuarios que arrastran un `clozr.db` viejo
 * donde alguna migración nativa nunca corrió o quedó desincronizada.
 *
 * Idempotente: usa `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`
 * y `safe()` para los `ALTER TABLE ADD COLUMN` (SQLite tira "duplicate column"
 * cuando ya existe — se ignora).
 *
 * No replica seeds (los maneja la UI por workspace cuando hace falta).
 *
 * Nombre legacy `ensurePricingSchema` mantenido por compatibilidad con los
 * callers — ahora cubre todo el schema, no solo pricing.
 */
/**
 * Versión legacy: usa `getDb()` por dentro. Mantenida para callers existentes.
 * Internamente delega en `ensureSchemaOn(db)`.
 */
export async function ensurePricingSchema(): Promise<void> {
  const { getDb } = await import("./index");
  const db = await getDb();
  await ensureSchemaOn(db);
}

export async function ensureSchemaOn(db: Database): Promise<void> {
  const dbExecute = (sql: string) => db.execute(sql, []);

  // ════════════════════════════════════════════════════════════
  // 001 — initial
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '🏪',
      color TEXT DEFAULT '#E8001D',
      plan TEXT DEFAULT 'free',
      created_at TEXT DEFAULT (datetime('now'))
    )`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      avatar_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'vendedor',
      joined_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (workspace_id, user_id)
    )`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      type TEXT DEFAULT 'final',
      status TEXT DEFAULT 'potencial',
      pricing_policy_json TEXT,
      barrio TEXT,
      address TEXT,
      notes TEXT,
      total_sales REAL DEFAULT 0,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS pipeline_items (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      stage_name TEXT NOT NULL,
      stage_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'open',
      estimated_value REAL,
      currency TEXT DEFAULT 'ARS',
      inactive_days INTEGER DEFAULT 0,
      closed_at TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS pipeline_activities (
      id TEXT PRIMARY KEY,
      pipeline_item_id TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      result TEXT,
      performed_at TEXT DEFAULT (datetime('now')),
      performed_by TEXT
    )`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS catalog_items (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      subcategory TEXT,
      price REAL,
      currency TEXT DEFAULT 'ARS',
      track_stock INTEGER DEFAULT 0,
      stock INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS catalog_imei (
      id TEXT PRIMARY KEY,
      catalog_item_id TEXT NOT NULL,
      imei TEXT NOT NULL UNIQUE,
      sold_at TEXT,
      sale_id TEXT
    )`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      customer_id TEXT,
      customer_name TEXT,
      seller_id TEXT,
      seller_name TEXT,
      subtotal REAL DEFAULT 0,
      total REAL DEFAULT 0,
      total_paid REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      is_paid INTEGER DEFAULT 0,
      notes TEXT,
      sale_date TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    )`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      catalog_item_id TEXT,
      description TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price REAL NOT NULL,
      base_price REAL,
      subtotal REAL NOT NULL,
      imei TEXT,
      from_stock INTEGER DEFAULT 0
    )`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS sale_payments (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      method TEXT NOT NULL,
      currency TEXT DEFAULT 'ARS',
      amount REAL NOT NULL,
      is_deposit INTEGER DEFAULT 0
    )`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      type TEXT DEFAULT 'rutina',
      frequency TEXT,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      completed_at TEXT,
      assigned_to TEXT,
      due_at TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      metadata_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`));

  // ════════════════════════════════════════════════════════════
  // 002 — catalog stock_min
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`ALTER TABLE catalog_items ADD COLUMN stock_min INTEGER DEFAULT 0`));

  // ════════════════════════════════════════════════════════════
  // 003 — pipeline_stages + member roles backfill
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      stage_order INTEGER DEFAULT 0,
      color TEXT DEFAULT 'gray',
      is_won INTEGER DEFAULT 0,
      is_lost INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`));

  // ════════════════════════════════════════════════════════════
  // 004 — customer_types
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS customer_types (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT 'blue',
      sort_order INTEGER DEFAULT 0
    )`));

  // ════════════════════════════════════════════════════════════
  // 005 — catalog_categories
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS catalog_categories (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    )`));

  // ════════════════════════════════════════════════════════════
  // 006 — tasks.custom_days
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`ALTER TABLE tasks ADD COLUMN custom_days TEXT`));

  // ════════════════════════════════════════════════════════════
  // 007 — catalog custom fields
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`ALTER TABLE catalog_items ADD COLUMN custom_fields_json TEXT`));
  await safe(() => dbExecute(`
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
    )`));

  // ════════════════════════════════════════════════════════════
  // 008 — users extended
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`ALTER TABLE users ADD COLUMN phone TEXT`));
  await safe(() => dbExecute(`ALTER TABLE users ADD COLUMN role_description TEXT`));
  await safe(() => dbExecute(`ALTER TABLE users ADD COLUMN avatar_color TEXT DEFAULT '#E8001D'`));
  await safe(() => dbExecute(`ALTER TABLE users ADD COLUMN notes TEXT`));

  // ════════════════════════════════════════════════════════════
  // 009 — image paths
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`ALTER TABLE catalog_items ADD COLUMN image_path TEXT`));
  await safe(() => dbExecute(`ALTER TABLE workspaces ADD COLUMN logo_path TEXT`));
  await safe(() => dbExecute(`ALTER TABLE customers ADD COLUMN avatar_path TEXT`));

  // ════════════════════════════════════════════════════════════
  // 010 — product condition
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`ALTER TABLE catalog_items ADD COLUMN condition TEXT DEFAULT 'new'`));
  await safe(() => dbExecute(`ALTER TABLE catalog_items ADD COLUMN condition_details_json TEXT`));

  // ════════════════════════════════════════════════════════════
  // 011 — businesses + sales.business_id
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS businesses (
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
    )`));
  await safe(() => dbExecute(`ALTER TABLE sales ADD COLUMN business_id TEXT`));

  // ════════════════════════════════════════════════════════════
  // 012 — cash_movements + followups
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS cash_movements (
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
    )`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS followups (
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
    )`));

  // Defensa por si las tablas se crearon sin customer_name (versiones tempranas)
  await safe(() => dbExecute(`ALTER TABLE cash_movements ADD COLUMN customer_name TEXT`));
  await safe(() => dbExecute(`ALTER TABLE cash_movements ADD COLUMN customer_id TEXT`));
  await safe(() => dbExecute(`ALTER TABLE cash_movements ADD COLUMN reference_id TEXT`));
  await safe(() => dbExecute(`ALTER TABLE cash_movements ADD COLUMN reference_type TEXT`));
  await safe(() => dbExecute(`ALTER TABLE followups ADD COLUMN customer_name TEXT`));
  await safe(() => dbExecute(`ALTER TABLE followups ADD COLUMN customer_id TEXT`));
  // Tipo de followup: 'manual' | 'auto-postsale' | 'auto-inactive' | 'cobro-pendiente'
  await safe(() => dbExecute(`ALTER TABLE followups ADD COLUMN kind TEXT DEFAULT 'manual'`));

  // ════════════════════════════════════════════════════════════
  // 013 — exchange rate + workspace.daily_goal
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS exchange_rates (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      usd_to_ars REAL NOT NULL DEFAULT 1000,
      updated_at TEXT DEFAULT (datetime('now')),
      updated_by TEXT
    )`));
  await safe(() => dbExecute(`ALTER TABLE workspaces ADD COLUMN daily_goal REAL DEFAULT 0`));
  await safe(() => dbExecute(`ALTER TABLE workspaces ADD COLUMN daily_goal_currency TEXT DEFAULT 'USD'`));

  // ════════════════════════════════════════════════════════════
  // 014 — product_templates
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`
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
    )`));

  // ════════════════════════════════════════════════════════════
  // 015 — product_templates.image_path
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`ALTER TABLE product_templates ADD COLUMN image_path TEXT`));

  // ════════════════════════════════════════════════════════════
  // 016 — quick stock (categories/families/models/variants/stock_items)
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS product_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT,
      sort_order INTEGER DEFAULT 0
    )`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS product_families (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    )`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS product_models (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      name TEXT NOT NULL,
      image_path TEXT,
      sort_order INTEGER DEFAULT 0
    )`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      color TEXT NOT NULL,
      color_hex TEXT,
      storage TEXT,
      sku TEXT,
      image_path TEXT,
      is_available INTEGER DEFAULT 1
    )`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS stock_items (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      catalog_item_id TEXT,
      imei TEXT NOT NULL,
      status TEXT DEFAULT 'available',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      sold_at TEXT,
      sale_id TEXT
    )`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_stock_workspace ON stock_items(workspace_id)`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_stock_status ON stock_items(status)`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_stock_imei ON stock_items(imei)`));

  // ════════════════════════════════════════════════════════════
  // 017 — stock_items.sold_to
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`ALTER TABLE stock_items ADD COLUMN sold_to TEXT`));

  // ════════════════════════════════════════════════════════════
  // 018 — airpods variants (storage NULL ya está en CREATE de 016)
  // ════════════════════════════════════════════════════════════
  // (skip table-rebuild — storage ya es NULL si la tabla la creamos nosotros)
  // Inserts idempotentes:
  await safe(() => dbExecute(`
    INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
      ('var-appro3-wh', 'mod-appro3', 'White',    '#FAFAFA', NULL, NULL, NULL, 1),
      ('var-apmax2-mi', 'mod-apmax2', 'Midnight', '#1C1C1E', NULL, NULL, NULL, 1),
      ('var-apmax2-bl', 'mod-apmax2', 'Blue',     '#4A7BA8', NULL, NULL, NULL, 1),
      ('var-apmax2-or', 'mod-apmax2', 'Orange',   '#D4621A', NULL, NULL, NULL, 1),
      ('var-apmax2-pu', 'mod-apmax2', 'Purple',   '#9B7FB6', NULL, NULL, NULL, 1),
      ('var-apmax2-st', 'mod-apmax2', 'Starlight','#F5F0E8', NULL, NULL, NULL, 1),
      ('var-ap4-wh',    'mod-ap4',   'White',    '#FAFAFA', NULL, NULL, NULL, 1),
      ('var-ap2-wh',    'mod-ap2',   'White',    '#FAFAFA', NULL, NULL, NULL, 1)
  `));

  // ════════════════════════════════════════════════════════════
  // 019 — customer_contacts
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS customer_contacts (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      customer_id  TEXT NOT NULL,
      kind         TEXT NOT NULL,
      at           TEXT NOT NULL,
      by_user_id   TEXT,
      by_user_name TEXT,
      notes        TEXT,
      created_at   TEXT NOT NULL
    )`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON customer_contacts (workspace_id, customer_id, at DESC)`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_customer_contacts_recent ON customer_contacts (workspace_id, at DESC)`));

  // ════════════════════════════════════════════════════════════
  // 020 — cash_day_sessions
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS cash_day_sessions (
      id                   TEXT PRIMARY KEY,
      workspace_id         TEXT NOT NULL,
      business_id          TEXT NOT NULL,
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
    )`));
  await safe(() => dbExecute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_day_sessions_unique ON cash_day_sessions (workspace_id, business_id, session_date)`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_cash_day_sessions_recent ON cash_day_sessions (workspace_id, business_id, session_date DESC)`));

  // ════════════════════════════════════════════════════════════
  // 021 — pipeline_items extended
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`ALTER TABLE pipeline_items ADD COLUMN product TEXT`));
  await safe(() => dbExecute(`ALTER TABLE pipeline_items ADD COLUMN next_action_at TEXT`));
  await safe(() => dbExecute(`ALTER TABLE pipeline_items ADD COLUMN next_action_label TEXT`));
  await safe(() => dbExecute(`ALTER TABLE pipeline_items ADD COLUMN owner_id TEXT`));
  await safe(() => dbExecute(`ALTER TABLE pipeline_items ADD COLUMN owner_name TEXT`));
  await safe(() => dbExecute(`ALTER TABLE pipeline_items ADD COLUMN short_note TEXT`));
  await safe(() => dbExecute(`ALTER TABLE pipeline_items ADD COLUMN priority TEXT`));
  await safe(() => dbExecute(`ALTER TABLE pipeline_items ADD COLUMN position INTEGER`));
  // customer_name denormalizado (varios queries lo SELECTean, pero ninguna
  // migración nativa la define; defensivo)
  await safe(() => dbExecute(`ALTER TABLE pipeline_items ADD COLUMN customer_name TEXT`));

  // ════════════════════════════════════════════════════════════
  // 022 — sales.payment_method
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`ALTER TABLE sales ADD COLUMN payment_method TEXT`));

  // ════════════════════════════════════════════════════════════
  // 023 — payment_methods
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL,
      name          TEXT NOT NULL,
      modifier_pct  REAL DEFAULT 0,
      currency      TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
      kind          TEXT NOT NULL,
      active        INTEGER DEFAULT 1,
      sort_order    INTEGER DEFAULT 0,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    )`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_payment_methods_workspace ON payment_methods (workspace_id, active, sort_order)`));

  // ════════════════════════════════════════════════════════════
  // 024 — catalog pricing (cost + per-customer-type prices)
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`ALTER TABLE catalog_items ADD COLUMN cost_usd REAL DEFAULT 0`));
  await safe(() => dbExecute(`ALTER TABLE catalog_items ADD COLUMN updated_at TEXT`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS catalog_prices (
      catalog_item_id   TEXT NOT NULL,
      customer_type_id  TEXT NOT NULL,
      price_usd         REAL NOT NULL,
      updated_at        TEXT NOT NULL,
      PRIMARY KEY (catalog_item_id, customer_type_id)
    )`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_catalog_prices_lookup ON catalog_prices (catalog_item_id, customer_type_id)`));

  // ════════════════════════════════════════════════════════════
  // 025 — stock pricing + sales out-of-stock flags
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`ALTER TABLE stock_items ADD COLUMN cost_usd_override REAL`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS stock_item_prices (
      stock_item_id     TEXT NOT NULL,
      customer_type_id  TEXT NOT NULL,
      price_usd         REAL NOT NULL,
      updated_at        TEXT NOT NULL,
      PRIMARY KEY (stock_item_id, customer_type_id)
    )`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_stock_item_prices_lookup ON stock_item_prices (stock_item_id, customer_type_id)`));
  await safe(() => dbExecute(`ALTER TABLE sales ADD COLUMN out_of_stock_sale INTEGER DEFAULT 0`));
  await safe(() => dbExecute(`ALTER TABLE sales ADD COLUMN regularized_at TEXT`));
  await safe(() => dbExecute(`ALTER TABLE sales ADD COLUMN regularized_by TEXT`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_sales_pending_regularization ON sales (workspace_id, out_of_stock_sale, regularized_at)`));

  // ════════════════════════════════════════════════════════════
  // 026 — workspace_featured_models (productos destacados por workspace)
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS workspace_featured_models (
      workspace_id TEXT NOT NULL,
      model_id     TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      PRIMARY KEY (workspace_id, model_id)
    )`));
  // Columna color: el owner puede elegir qué variante destacar (NULL = default)
  await safe(() => dbExecute(`ALTER TABLE workspace_featured_models ADD COLUMN color TEXT`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_featured_models_ws ON workspace_featured_models (workspace_id)`));

  // ════════════════════════════════════════════════════════════
  // 027 — user auth (PIN + last login)
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`ALTER TABLE users ADD COLUMN pin_hash TEXT`));
  await safe(() => dbExecute(`ALTER TABLE users ADD COLUMN last_login_at TEXT`));

  // ════════════════════════════════════════════════════════════
  // 028 — índices compuestos para queries frecuentes (escala >1000 filas)
  // ════════════════════════════════════════════════════════════
  // Hoy con pocos datos no se nota, pero sin estos índices SQLite hace full
  // table scan en cada filtro. A 5k+ ventas/clientes empieza a doler.
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_sales_workspace_date ON sales(workspace_id, sale_date DESC)`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_sales_workspace_business ON sales(workspace_id, business_id, sale_date DESC)`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_customers_workspace_status ON customers(workspace_id, status)`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_pipeline_workspace_stage ON pipeline_items(workspace_id, stage_id, position)`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_catalog_workspace_active ON catalog_items(workspace_id, active)`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_cash_movements_workspace_date ON cash_movements(workspace_id, business_id, created_at DESC)`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_followups_workspace_due ON followups(workspace_id, business_id, completed, due_date)`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id)`));

  // ════════════════════════════════════════════════════════════
  // 029 — daily_goal_count (cantidad de ventas objetivo del día)
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`ALTER TABLE workspaces ADD COLUMN daily_goal_count INTEGER DEFAULT 0`));

  // ════════════════════════════════════════════════════════════
  // 030 — customer tags (etiquetas configurables por workspace)
  // ════════════════════════════════════════════════════════════
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS customer_tags (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name         TEXT NOT NULL,
      color        TEXT NOT NULL DEFAULT 'gray',
      sort_order   INTEGER DEFAULT 0,
      created_at   TEXT NOT NULL
    )`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_customer_tags_workspace ON customer_tags (workspace_id, sort_order)`));
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS customer_tag_assignments (
      customer_id TEXT NOT NULL,
      tag_id      TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (customer_id, tag_id)
    )`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_cust_tag_assign_customer ON customer_tag_assignments (customer_id)`));
  await safe(() => dbExecute(`CREATE INDEX IF NOT EXISTS idx_cust_tag_assign_tag ON customer_tag_assignments (tag_id)`));

  // ════════════════════════════════════════════════════════════
  // 033 — pipeline_items.lead_source + catalog_item_id
  // ════════════════════════════════════════════════════════════
  // Origen del lead (referido/walk-in/web/redes/otro) — sirve para
  // reportes "¿de qué canal me llegan los leads que cierran?".
  await safe(() => dbExecute(`ALTER TABLE pipeline_items ADD COLUMN lead_source TEXT`));
  // Producto del catálogo asociado al lead. Si está, el "product" string
  // se mantiene como descripción legible pero acá guardamos el id para
  // poder traer precios sugeridos según el tipo de cliente.
  await safe(() => dbExecute(`ALTER TABLE pipeline_items ADD COLUMN catalog_item_id TEXT`));

  // ════════════════════════════════════════════════════════════
  // 032 — dolar_rates (snapshot de cotizaciones AR desde dolarapi.com)
  // ════════════════════════════════════════════════════════════
  // Las cotizaciones son globales (no dependen del workspace), así que
  // una sola fila por tipo es suficiente. Las refrescamos contra
  // dolarapi.com en background y se usan offline desde acá.
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS dolar_rates (
      kind                TEXT PRIMARY KEY,
      nombre              TEXT NOT NULL,
      compra              REAL,
      venta               REAL NOT NULL,
      source_updated_at   TEXT NOT NULL,
      fetched_at          TEXT NOT NULL
    )`));

  // ════════════════════════════════════════════════════════════
  // 031 — workspace_settings (KV) + wholesale code en pipeline
  // ════════════════════════════════════════════════════════════
  // KV genérico por workspace: plantillas WhatsApp, contadores, etc.
  // Lo usamos en lugar de columnas en `workspaces` para evitar migraciones
  // por cada nuevo ajuste configurable.
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS workspace_settings (
      workspace_id TEXT NOT NULL,
      key          TEXT NOT NULL,
      value        TEXT,
      updated_at   TEXT NOT NULL,
      PRIMARY KEY (workspace_id, key)
    )`));
  // Código mayorista asignado al agendar la visita (ej: "B1202").
  // Se genera incrementando el contador KV `wa_wholesale_code_counter`.
  await safe(() => dbExecute(`ALTER TABLE pipeline_items ADD COLUMN wholesale_code TEXT`));
  // Hora puntual de la visita (separada de next_action_at, que puede ser
  // cualquier follow-up). Si está, gana sobre next_action_at para WA.
  await safe(() => dbExecute(`ALTER TABLE pipeline_items ADD COLUMN visit_at TEXT`));

  // ════════════════════════════════════════════════════════════
  //  029 — Redes sociales en cliente (opcionales)
  // ════════════════════════════════════════════════════════════
  // Guardamos el handle o URL completa — la UI maneja ambos casos. Para
  // WhatsApp seguimos usando `phone` (con el deep link clozr arma wa.me).
  // Si en el futuro sumamos más redes (snapchat, threads, etc.) extender
  // acá. NO obligatorias, NO indexadas — son metadata de contacto.
  await safe(() => dbExecute(`ALTER TABLE customers ADD COLUMN instagram TEXT`));
  await safe(() => dbExecute(`ALTER TABLE customers ADD COLUMN facebook TEXT`));
  await safe(() => dbExecute(`ALTER TABLE customers ADD COLUMN tiktok TEXT`));
  await safe(() => dbExecute(`ALTER TABLE customers ADD COLUMN twitter TEXT`));
  await safe(() => dbExecute(`ALTER TABLE customers ADD COLUMN deleted_at TEXT`));

  // ════════════════════════════════════════════════════════════
  //  030 — Tareas obligatorias (templates asignados por dueño)
  // ════════════════════════════════════════════════════════════
  // El dueño/encargado define templates de rutinas que el sistema
  // materializa en `tasks` cada día para los vendedores asignados.
  //
  // Ejemplos del usuario: "subir historia a las 10:00", "seguir 30
  // personas", "hablar con 30 personas". El target_count permite el
  // contador progresivo +1; target_time es un horario sugerido.
  //
  // Modelo de cumplimiento: cada día arranca limpio. Las tareas del día
  // anterior NO se acumulan ni se reabren — quedan en el histórico de
  // `tasks` con su completed/uncompleted para reportes de compliance.
  await safe(() => dbExecute(`
    CREATE TABLE IF NOT EXISTS assigned_task_templates (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      frequency TEXT NOT NULL DEFAULT 'daily',
      target_time TEXT,
      target_count INTEGER,
      assigned_to_user_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`));
  await safe(() =>
    dbExecute(
      `CREATE INDEX IF NOT EXISTS idx_assigned_templates_workspace ON assigned_task_templates (workspace_id, is_active)`,
    ),
  );

  // Columnas en `tasks` para soportar templates + contador progresivo.
  // template_id: link soft al template que las materializó (NULL si la
  //   tarea es manual creada por el vendedor).
  // target_count: copia del target del template al momento de materializar
  //   (para que cambiar el template no afecte tareas históricas).
  // progress: cuántas veces el vendedor incrementó +1 hoy. Cuando llega
  //   a target_count, completed=1 automático.
  await safe(() => dbExecute(`ALTER TABLE tasks ADD COLUMN template_id TEXT`));
  await safe(() => dbExecute(`ALTER TABLE tasks ADD COLUMN target_count INTEGER`));
  await safe(() => dbExecute(`ALTER TABLE tasks ADD COLUMN progress INTEGER DEFAULT 0`));
  await safe(() =>
    dbExecute(
      `CREATE INDEX IF NOT EXISTS idx_tasks_template_date ON tasks (template_id, assigned_to, created_at)`,
    ),
  );

  // ════════════════════════════════════════════════════════════
  // 035 (F) — schema silencioso multi-rubro + plan
  // ════════════════════════════════════════════════════════════
  // Ver docs/ROADMAP.md §3. Hoy son columnas vacías que defaultean a
  // "generic" / "free" / "[]". Cuando lance el paywall, leeremos de acá.
  await safe(() => dbExecute(`ALTER TABLE workspaces ADD COLUMN industry TEXT DEFAULT 'generic'`));
}

/**
 * Patrones de error de SQLite que son ESPERADOS cuando el replayer corre
 * sobre una DB que ya tiene parte del schema aplicado. Son benignos: la
 * tabla/columna/índice ya existe, no hay nada que hacer.
 *
 * Cualquier otro error (typo de SQL, FK rota, syntax, columna sin tipo,
 * etc.) se relanza para que el arranque falle ruidosamente. Esa es
 * exactamente la señal que queremos: si introducís una migración nueva
 * mal escrita, te enterás al primer boot, no semanas después cuando un
 * query random tire "no such column".
 */
const EXPECTED_SQLITE_NOOPS = [
  /duplicate column name/i,
  /table .* already exists/i,
  /index .* already exists/i,
  /trigger .* already exists/i,
  /view .* already exists/i,
];

function isExpectedNoop(message: string): boolean {
  return EXPECTED_SQLITE_NOOPS.some((re) => re.test(message));
}

async function safe(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isExpectedNoop(msg)) return;
    // Bug real: relanzamos para que el arranque falle visible.
    throw new Error(`[ensureSchema] SQL inesperado falló: ${msg}`);
  }
}
