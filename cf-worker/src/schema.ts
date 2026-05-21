/**
 * Schema mínimo para Fase 1 (auth).
 *
 * Filosofía: CREATE TABLE IF NOT EXISTS — idempotente. Lo corremos
 * lazy (dedup en memoria del Worker) en cada cold start. SQLite acepta
 * estas DDL en milisegundos así que el costo es despreciable.
 *
 * Para esquemas grandes esto NO escala. Cuando F2 (migrar datos del
 * SQLite local a Turso) necesite muchas migraciones, pasamos a un
 * sistema versionado tipo el `ensureSchemaOn` del frontend.
 */

import { tursoQuery, type Env } from "./turso";

let initPromise: Promise<void> | null = null;

/**
 * Aplica el schema una sola vez por instancia del Worker. Llamar al
 * inicio de cualquier route que toque DB.
 */
export function ensureSchema(env: Env): Promise<void> {
  if (!initPromise) initPromise = applySchema(env);
  return initPromise;
}

async function applySchema(env: Env): Promise<void> {
  await tursoQuery(
    env,
    {
      sql: `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS magic_links (
        token TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email)`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        device_label TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        revoked_at TEXT
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
    },
  );
}
