/**
 * Schema mínimo para Fase 1 (auth).
 *
 * Filosofía: CREATE TABLE IF NOT EXISTS — idempotente. Lo corremos
 * lazy (dedup en memoria del Worker) en cada cold start. SQLite acepta
 * estas DDL en milisegundos así que el costo es despreciable.
 *
 * Para ALTER TABLE ADD COLUMN no hay IF NOT EXISTS en SQLite, así que
 * los envolvemos en try/catch que ignora "duplicate column". Mismo patrón
 * que el `safe()` del frontend (src/lib/db/ensureSchema.ts).
 *
 * Cuando F2 necesite muchas migraciones, pasamos a un sistema versionado.
 */

import { tursoQuery, type Env } from "./turso";

let initPromise: Promise<void> | null = null;

export function ensureSchema(env: Env): Promise<void> {
  if (!initPromise) initPromise = applySchema(env);
  return initPromise;
}

async function applySchema(env: Env): Promise<void> {
  // ── DDL idempotente (CREATE IF NOT EXISTS) ─────────────────────────
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

  // ── Migraciones aditivas (no-idempotentes; ignoramos "duplicate") ──
  //
  // 001 — agregar code (6 dígitos) a magic_links. Permite que el user
  // abra el email en su celular y escriba el código en la PC sin quemar
  // el token. Si ya existe la columna, ignore.
  await safeAddColumn(env, "magic_links", "code", "TEXT");
  // Index por (email, code) para que el lookup en verify-code sea rápido.
  // Es CREATE INDEX IF NOT EXISTS así que es idempotente sin try/catch.
  await tursoQuery(env, {
    sql: `CREATE INDEX IF NOT EXISTS idx_magic_links_email_code ON magic_links(email, code)`,
  });

  // ── F2.1: Workspaces multi-tenant + memberships ───────────────────
  //
  // cloud_workspaces: el "negocio" en la nube. Cada uno tiene un owner.
  // El nombre "cloud_" es para no chocar con la tabla local `workspaces`
  // del SQLite si en algún momento las cruzamos para debugging.
  await tursoQuery(
    env,
    {
      sql: `CREATE TABLE IF NOT EXISTS cloud_workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_user_id TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_cloud_workspaces_owner ON cloud_workspaces(owner_user_id)`,
    },
    // memberships: linkea un user (o email pre-registrado) a un workspace
    // con un rol y status.
    //
    // user_id NULLABLE — cuando invitás un email que todavía no es user,
    // queda guardado con user_id=NULL y email=<el invitado>. Al hacer
    // login esa persona, su email matchea y completamos user_id +
    // status='active'. Mientras tanto status='invited'.
    //
    // role values: 'owner' | 'admin' | 'vendedor' | 'viewer' — mismo
    // enum que el authStore local. NO usamos CHECK constraint para que
    // futuros roles (ej: 'contador') no requieran migration.
    //
    // status values: 'invited' | 'active' | 'revoked'. 'revoked' es soft-
    // delete: lo mantenemos en DB para auditoría pero no cuenta para
    // permission checks ni listings.
    {
      sql: `CREATE TABLE IF NOT EXISTS memberships (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id),
        user_id TEXT REFERENCES users(id),
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'invited',
        invited_at TEXT NOT NULL DEFAULT (datetime('now')),
        invited_by_user_id TEXT REFERENCES users(id),
        accepted_at TEXT,
        revoked_at TEXT
      )`,
    },
    // Lookups críticos:
    //   - GET /me: SELECT por user_id (con activación on-the-fly via email)
    //   - invite: chequear que no haya membership duplicada para (workspace, email)
    //   - members listing: SELECT por workspace_id
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id, status)`,
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_memberships_workspace ON memberships(workspace_id, status)`,
    },
    // Unique parcial: dentro de un workspace, un email no puede tener
    // dos memberships ACTIVAS. SQLite soporta UNIQUE con WHERE.
    {
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS uq_memberships_workspace_email_active
            ON memberships(workspace_id, email)
            WHERE status != 'revoked'`,
    },
  );
}

/**
 * Ejecuta ALTER TABLE ADD COLUMN ignorando el error si la columna ya
 * existe ("duplicate column name"). Cualquier otro error sí throwa.
 */
async function safeAddColumn(env: Env, table: string, column: string, type: string): Promise<void> {
  try {
    await tursoQuery(env, {
      sql: `ALTER TABLE ${table} ADD COLUMN ${column} ${type}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err);
    if (msg.includes("duplicate column")) return;
    throw err;
  }
}
