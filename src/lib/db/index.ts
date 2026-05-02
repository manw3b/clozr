import Database, { type QueryResult } from "@tauri-apps/plugin-sql";

const DB_PATH = "sqlite:clozr.db";
let _db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load(DB_PATH);
  }
  return _db;
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
