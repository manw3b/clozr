import { dbExecute } from "./index";

/**
 * Defensa contra DBs viejas/desincronizadas donde las migrations 023-025
 * no corrieron por algún motivo (binario stale, schema_version corrupto, etc.).
 *
 * Crea las tablas/columnas con `CREATE TABLE IF NOT EXISTS` y `ALTER TABLE ADD COLUMN`
 * envuelto en try/catch (SQLite tira "duplicate column name" si ya existen,
 * ignorable).
 *
 * Es idempotente: se puede correr en cada arranque sin efectos secundarios.
 */
export async function ensurePricingSchema(): Promise<void> {
  // ─── sales: columnas potencialmente faltantes en DBs viejas ──
  // (algunas se crearon en 001, otras en 011/022/025; defensivo igual)
  await safe(() => dbExecute(`ALTER TABLE sales ADD COLUMN customer_name TEXT`));
  await safe(() => dbExecute(`ALTER TABLE sales ADD COLUMN seller_id TEXT`));
  await safe(() => dbExecute(`ALTER TABLE sales ADD COLUMN seller_name TEXT`));
  await safe(() => dbExecute(`ALTER TABLE sales ADD COLUMN business_id TEXT`));
  await safe(() => dbExecute(`ALTER TABLE sales ADD COLUMN payment_method TEXT`));

  // ─── 023: payment_methods ───────────────────────────────
  await safe(() =>
    dbExecute(
      `CREATE TABLE IF NOT EXISTS payment_methods (
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
      )`,
    ),
  );
  await safe(() =>
    dbExecute(
      `CREATE INDEX IF NOT EXISTS idx_payment_methods_workspace
         ON payment_methods (workspace_id, active, sort_order)`,
    ),
  );

  // ─── 024: catalog_items.cost_usd + catalog_prices ───────
  await safe(() => dbExecute(`ALTER TABLE catalog_items ADD COLUMN cost_usd REAL DEFAULT 0`));
  // updated_at faltante en el schema original (1.0) — necesario para setCatalogCost
  await safe(() => dbExecute(`ALTER TABLE catalog_items ADD COLUMN updated_at TEXT`));
  await safe(() =>
    dbExecute(
      `CREATE TABLE IF NOT EXISTS catalog_prices (
        catalog_item_id   TEXT NOT NULL,
        customer_type_id  TEXT NOT NULL,
        price_usd         REAL NOT NULL,
        updated_at        TEXT NOT NULL,
        PRIMARY KEY (catalog_item_id, customer_type_id)
      )`,
    ),
  );
  await safe(() =>
    dbExecute(
      `CREATE INDEX IF NOT EXISTS idx_catalog_prices_lookup
         ON catalog_prices (catalog_item_id, customer_type_id)`,
    ),
  );

  // ─── 025: stock_items.cost_usd_override + stock_item_prices + sales flags ─
  await safe(() => dbExecute(`ALTER TABLE stock_items ADD COLUMN cost_usd_override REAL`));
  await safe(() =>
    dbExecute(
      `CREATE TABLE IF NOT EXISTS stock_item_prices (
        stock_item_id     TEXT NOT NULL,
        customer_type_id  TEXT NOT NULL,
        price_usd         REAL NOT NULL,
        updated_at        TEXT NOT NULL,
        PRIMARY KEY (stock_item_id, customer_type_id)
      )`,
    ),
  );
  await safe(() =>
    dbExecute(
      `CREATE INDEX IF NOT EXISTS idx_stock_item_prices_lookup
         ON stock_item_prices (stock_item_id, customer_type_id)`,
    ),
  );
  await safe(() => dbExecute(`ALTER TABLE sales ADD COLUMN out_of_stock_sale INTEGER DEFAULT 0`));
  await safe(() => dbExecute(`ALTER TABLE sales ADD COLUMN regularized_at TEXT`));
  await safe(() => dbExecute(`ALTER TABLE sales ADD COLUMN regularized_by TEXT`));
  await safe(() =>
    dbExecute(
      `CREATE INDEX IF NOT EXISTS idx_sales_pending_regularization
         ON sales (workspace_id, out_of_stock_sale, regularized_at)`,
    ),
  );
}

async function safe(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch {
    // ignore — la columna/tabla ya existe o ya hay un índice
  }
}
