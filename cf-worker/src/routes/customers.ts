/**
 * Customers — CRUD + bootstrap import.
 *
 * Routes:
 *   GET    /workspaces/:id/customers              listar activos (cualquier miembro)
 *   POST   /workspaces/:id/customers              crear (createClient perm)
 *   PATCH  /workspaces/:id/customers/:cid         editar (editClient perm)
 *   DELETE /workspaces/:id/customers/:cid         soft-delete (deleteClient perm)
 *   POST   /workspaces/:id/customers/import       bootstrap upload (owner only)
 *
 * Permisos en línea con authStore.PERMISSIONS:
 *   createClient: owner|admin|vendedor
 *   editClient:   owner|admin|vendedor
 *   deleteClient: owner|admin
 *   Lectura:      cualquier miembro activo
 *
 * Los campos del payload los validamos contra una whitelist — si el
 * cliente manda algo extra (ej: total_sales que es computed) lo ignoramos.
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoFirst, tursoQuery, type TursoArg } from "../turso";
import { requirePerm } from "../permissions";

/* ── permission helpers ──────────────────────────────────────────────── */

const ROLES_READ = new Set(["owner", "admin", "vendedor", "viewer"]);

async function getMembershipRole(env: Env, workspaceId: string, userId: string): Promise<string | null> {
  const m = await tursoFirst(
    env,
    `SELECT role FROM memberships
       WHERE workspace_id = ? AND user_id = ? AND status = 'active'`,
    [workspaceId, userId],
  );
  return m ? String(m.role) : null;
}

/**
 * T2: si el rol es 'vendedor', verifica que el cliente le pertenezca antes de
 * mutarlo. Devuelve una Response (404/403) si no aplica, o null si OK.
 * managers (owner/admin) y viewer no se scopean (viewer no escribe igual).
 */
async function assertOwnsCustomer(
  env: Env,
  workspaceId: string,
  customerId: string,
  role: string,
  userId: string,
): Promise<Response | null> {
  if (role !== "vendedor") return null;
  const row = await tursoFirst(
    env,
    `SELECT owner_id FROM customers WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    [customerId, workspaceId],
  );
  if (!row) return json({ error: "not_found" }, 404);
  if (String(row.owner_id ?? "") !== userId) return json({ error: "forbidden" }, 403);
  return null;
}

/* ── campos editables (whitelist) ────────────────────────────────────── */

// Lista de columnas que el client puede setear/cambiar. Mantener en
// sync con el schema. Si agregamos nuevos campos (ej: redes sociales),
// los agregamos acá también.
const EDITABLE_FIELDS = [
  "name", "phone", "email", "type", "status", "pricing_policy_json",
  "barrio", "address", "notes", "avatar_path",
  "instagram", "facebook", "tiktok", "twitter",
] as const;
type EditableField = typeof EDITABLE_FIELDS[number];

function pickEditable(input: Record<string, unknown>): Record<EditableField, TursoArg> {
  const out: Partial<Record<EditableField, TursoArg>> = {};
  for (const k of EDITABLE_FIELDS) {
    if (k in input) {
      const v = input[k];
      out[k] = v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? v
        : null;
    }
  }
  return out as Record<EditableField, TursoArg>;
}

/* ── GET /workspaces/:id/customers ───────────────────────────────────── */

export async function handleListCustomers(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const role = await getMembershipRole(env, workspaceId, auth.userId);
  if (!role || !ROLES_READ.has(role)) return json({ error: "forbidden" }, 403);

  // T2: el vendedor ve solo SUS clientes; managers (owner/admin) y viewer ven todo.
  const scoped = role === "vendedor";
  const [rows] = await tursoQuery(env, {
    sql: `SELECT id, workspace_id, name, phone, email, type, status,
                 pricing_policy_json, barrio, address, notes, avatar_path,
                 instagram, facebook, tiktok, twitter,
                 created_by, owner_id, created_at, updated_at
            FROM customers
            WHERE workspace_id = ? AND deleted_at IS NULL${scoped ? " AND owner_id = ?" : ""}
            ORDER BY name ASC`,
    args: scoped ? [workspaceId, auth.userId] : [workspaceId],
  });
  return json({ customers: rows ?? [] });
}

/* ── POST /workspaces/:id/customers ──────────────────────────────────── */

interface CreateBody {
  /** Opcional: si lo manda el client, lo usamos (útil para bootstrap
   *  que sube clientes con su id local). Si no, generamos UUID. */
  id?: unknown;
  name?: unknown;
  [k: string]: unknown;
}

export async function handleCreateCustomer(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const role = await getMembershipRole(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "customers.write");
  if (denied) return denied;

  let body: CreateBody;
  try { body = (await req.json()) as CreateBody; } catch { return json({ error: "invalid_body" }, 400); }
  if (typeof body.name !== "string" || !body.name.trim()) return json({ error: "missing_name" }, 400);

  const id = (typeof body.id === "string" && body.id) ? body.id : crypto.randomUUID();
  const fields = pickEditable(body as Record<string, unknown>);
  // name ya validado arriba; asegurar que esté en fields.
  fields.name = body.name.trim();

  // T2: owner_id = creador (sub del JWT) para el alcance del vendedor.
  const cols = ["id", "workspace_id", "created_by", "owner_id", ...Object.keys(fields)];
  const vals: TursoArg[] = [id, workspaceId, auth.userId, auth.userId, ...Object.values(fields)];
  const placeholders = cols.map(() => "?").join(", ");

  try {
    await tursoExec(
      env,
      `INSERT INTO customers (${cols.join(", ")}) VALUES (${placeholders})`,
      vals,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : String(e);
    if (msg.includes("unique") || msg.includes("primary key")) {
      return json({ error: "duplicate_id", id }, 409);
    }
    throw e;
  }

  return json({ ok: true, id }, 201);
}

/* ── PATCH /workspaces/:id/customers/:cid ────────────────────────────── */

export async function handleUpdateCustomer(
  workspaceId: string,
  customerId: string,
  req: Request,
  env: Env,
): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const role = await getMembershipRole(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "customers.write");
  if (denied) return denied;

  // T2: el vendedor solo edita SUS clientes.
  const ownerErr = await assertOwnsCustomer(env, workspaceId, customerId, role, auth.userId);
  if (ownerErr) return ownerErr;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }

  const fields = pickEditable(body);
  if (Object.keys(fields).length === 0) return json({ error: "no_fields" }, 400);

  // Construir UPDATE dinámico solo con las columnas presentes.
  const setClauses = Object.keys(fields).map((c) => `${c} = ?`).concat(["updated_at = datetime('now')"]);
  const args: TursoArg[] = [...Object.values(fields), customerId, workspaceId];

  await tursoExec(
    env,
    `UPDATE customers SET ${setClauses.join(", ")}
       WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    args,
  );
  return json({ ok: true });
}

/* ── DELETE /workspaces/:id/customers/:cid ───────────────────────────── */

export async function handleDeleteCustomer(
  workspaceId: string,
  customerId: string,
  req: Request,
  env: Env,
): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const role = await getMembershipRole(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "customers.write");
  if (denied) return denied;

  // T2: el vendedor solo borra SUS clientes.
  const ownerErr = await assertOwnsCustomer(env, workspaceId, customerId, role, auth.userId);
  if (ownerErr) return ownerErr;

  await tursoExec(
    env,
    `UPDATE customers SET deleted_at = datetime('now')
       WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    [customerId, workspaceId],
  );
  return json({ ok: true });
}

/* ── POST /workspaces/:id/customers/import ───────────────────────────── */

interface ImportBody {
  /** Lista de customers locales a subir. Cada uno con su id propio. */
  customers?: Array<Record<string, unknown>>;
}

export async function handleImportCustomers(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  // Solo owner puede hacer bootstrap. La idea es que vos (creator del
  // workspace) subís TUS clientes; los miembros invitados después leen
  // del cloud sin tocar nada.
  const role = await getMembershipRole(env, workspaceId, auth.userId);
  if (role !== "owner") return json({ error: "forbidden" }, 403);

  let body: ImportBody;
  try { body = (await req.json()) as ImportBody; } catch { return json({ error: "invalid_body" }, 400); }
  if (!Array.isArray(body.customers)) return json({ error: "missing_customers" }, 400);
  if (body.customers.length > 5000) return json({ error: "too_many", limit: 5000 }, 413);

  // INSERT OR IGNORE para que sea idempotente: si el id ya existe (por
  // ejemplo, re-corriste el bootstrap), no duplica ni falla.
  let imported = 0;
  let skipped = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const c of body.customers) {
    if (!c || typeof c !== "object") continue;
    const id = typeof c.id === "string" && c.id ? c.id : crypto.randomUUID();
    if (typeof c.name !== "string" || !c.name.trim()) {
      errors.push({ id, error: "missing_name" });
      continue;
    }
    const fields = pickEditable(c as Record<string, unknown>);
    fields.name = c.name.trim();

    // Si el local tenía created_at, lo respetamos. Si no, default.
    const createdAt = typeof c.created_at === "string" ? c.created_at : null;

    // Import es owner-only → owner_id = el owner que sube el bootstrap.
    const cols = ["id", "workspace_id", "created_by", "owner_id", ...Object.keys(fields)];
    const vals: TursoArg[] = [id, workspaceId, auth.userId, auth.userId, ...Object.values(fields)];
    if (createdAt) { cols.push("created_at"); vals.push(createdAt); }
    const placeholders = cols.map(() => "?").join(", ");

    try {
      // tursoExec no expone result.rowsAffected acá fácil — usamos
      // INSERT OR IGNORE y contamos heurísticamente. Para precisión
      // exacta podemos SELECT antes.
      const res = await tursoFirst(env, `SELECT id FROM customers WHERE id = ?`, [id]);
      if (res) { skipped++; continue; }
      await tursoExec(
        env,
        `INSERT OR IGNORE INTO customers (${cols.join(", ")}) VALUES (${placeholders})`,
        vals,
      );
      imported++;
    } catch (e) {
      errors.push({ id, error: e instanceof Error ? e.message : "unknown" });
    }
  }

  return json({ ok: true, imported, skipped, errors });
}

/* ── json helper ─────────────────────────────────────────────────────── */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
