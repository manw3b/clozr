import Database, { type QueryResult } from "@tauri-apps/plugin-sql";

const DB_PATH = "sqlite:clozr.db";
let _dbPromise: Promise<Database> | null = null;

async function bootstrapDb(): Promise<Database> {
  const db = await Database.load(DB_PATH);
  // PRAGMAs antes de cualquier otra cosa:
  //  - busy_timeout: tauri-plugin-sql no lo setea por default y el front
  //    a veces lanza varias mutations/queries en simultáneo. Sin esto
  //    cualquier conflicto tira "database is locked" instantáneamente.
  //    Con 5s de timeout SQLite reintenta internamente y casi nunca falla.
  //  - foreign_keys: defensivo (si en el futuro agregamos FK reales).
  try {
    await db.execute("PRAGMA busy_timeout = 5000", []);
    await db.execute("PRAGMA foreign_keys = ON", []);
  } catch {
    /* PRAGMAs son defensivos; si fallan seguimos */
  }
  // Bootstrap defensivo del schema completo ANTES de servir queries.
  // Import dinámico para evitar ciclo (ensureSchema importa el tipo Database
  // pero también podría querer dbExecute en otros lados).
  try {
    const { ensureSchemaOn } = await import("./ensureSchema");
    await ensureSchemaOn(db);
  } catch (e) {
    // Si el bootstrap falla, seguimos igual — la app puede funcionar parcialmente
    console.warn("ensureSchemaOn failed:", e);
  }
  return db;
}

export async function getDb(): Promise<Database> {
  if (!_dbPromise) {
    _dbPromise = bootstrapDb();
  }
  return _dbPromise;
}

export async function dbSelect<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  return db.select<T[]>(sql, params);
}

export async function dbExecute(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult> {
  const db = await getDb();
  return db.execute(sql, params);
}

/**
 * Reintenta una operación si el error es "database is locked" de SQLite.
 * El busy_timeout del bootstrap cubre el 99% de los casos, pero queda como
 * red de seguridad para transacciones largas (ej: importar muchos clientes).
 */
export async function withDbRetry<T>(
  op: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await op();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!/database is locked|locked/i.test(msg)) throw e;
      // Backoff suave: 50ms, 150ms, 450ms…
      await new Promise((r) => setTimeout(r, 50 * Math.pow(3, i)));
    }
  }
  throw lastErr;
}
