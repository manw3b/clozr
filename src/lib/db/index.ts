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
    // journal_mode=WAL es PERSISTENTE (se guarda en el archivo SQLite),
    // así que aunque tauri-plugin-sql use pool de conexiones, todas
    // las conexiones lo respetan. Resuelve el lock entre lectores y un
    // único escritor: lectores no se bloquean nunca.
    await db.execute("PRAGMA journal_mode = WAL", []);
    // busy_timeout es por-conexión; lo seteamos defensivo en la conexión
    // del singleton + serializamos writes desde JS (ver runWrite abajo).
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
 * Backoff suave: 50ms, 150ms, 450ms.
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
      await new Promise((r) => setTimeout(r, 50 * Math.pow(3, i)));
    }
  }
  throw lastErr;
}

/**
 * Mutex de escritura: SQLite permite N readers + 1 writer. Si dos partes
 * de la app inician transacciones (BEGIN/COMMIT) concurrentemente, una se
 * encuentra el lock y falla con "database is locked" antes de que el
 * busy_timeout las pueda salvar (porque BEGIN IMMEDIATE no espera).
 *
 * Esta cola garantiza que las transacciones críticas se serialicen del
 * lado de JS, sin importar cuántas conexiones use el plugin internamente.
 *
 * Uso:
 *   await runWrite(async () => {
 *     await dbExecute("BEGIN IMMEDIATE");
 *     ...
 *     await dbExecute("COMMIT");
 *   });
 *
 * Sólo envolver writes transaccionales — un INSERT individual no necesita.
 */
let _writeQueue: Promise<unknown> = Promise.resolve();
export function runWrite<T>(op: () => Promise<T>): Promise<T> {
  const next = _writeQueue.then(() => withDbRetry(op));
  // Mantenemos la cola viva incluso si una falla, para no romper toda la app.
  _writeQueue = next.catch(() => undefined);
  return next;
}
