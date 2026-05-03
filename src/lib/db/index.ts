import Database, { type QueryResult } from "@tauri-apps/plugin-sql";

const DB_PATH = "sqlite:clozr.db";
let _dbPromise: Promise<Database> | null = null;

async function bootstrapDb(): Promise<Database> {
  const db = await Database.load(DB_PATH);
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
