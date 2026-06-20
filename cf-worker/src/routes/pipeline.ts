/**
 * Pipeline — CRUD de stages + items + bootstrap import.
 *
 * Routes:
 *   STAGES
 *     GET    /workspaces/:wid/pipeline/stages         listar
 *     POST   /workspaces/:wid/pipeline/stages         crear
 *     PATCH  /workspaces/:wid/pipeline/stages/:sid    editar (incluye reorder)
 *     DELETE /workspaces/:wid/pipeline/stages/:sid    soft-delete
 *     POST   /workspaces/:wid/pipeline/stages/import  bootstrap
 *
 *   LEADS (items)
 *     GET    /workspaces/:wid/pipeline/items          listar activos
 *     POST   /workspaces/:wid/pipeline/items          crear
 *     PATCH  /workspaces/:wid/pipeline/items/:iid     editar (incluye drag de stage)
 *     DELETE /workspaces/:wid/pipeline/items/:iid     soft-delete
 *     POST   /workspaces/:wid/pipeline/items/import   bootstrap
 *
 * Permisos (en línea con authStore.PERMISSIONS):
 *   editPipelineStages: owner|admin
 *   createLead/editLead: owner|admin|vendedor
 *   deleteLead: owner|admin
 *   read: cualquier miembro activo
 *   import: owner only
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoFirst, tursoQuery, type TursoArg } from "../turso";
import { requirePerm } from "../permissions";

/* ── permission helpers ──────────────────────────────────────────────── */

const ROLES_READ = new Set(["owner", "admin", "vendedor", "viewer"]);

async function getRole(env: Env, workspaceId: string, userId: string): Promise<string | null> {
  const m = await tursoFirst(
    env,
    `SELECT role FROM memberships
       WHERE workspace_id = ? AND user_id = ? AND status = 'active'`,
    [workspaceId, userId],
  );
  return m ? String(m.role) : null;
}

/**
 * T2: `owner_id` del pipeline_item es el dueño/vendedor del lead y a la vez
 * el campo de alcance. Si el rol es 'vendedor', verifica que el lead le
 * pertenezca antes de mutarlo. Devuelve Response (404/403) o null si OK.
 */
async function assertOwnsItem(
  env: Env,
  workspaceId: string,
  itemId: string,
  role: string,
  userId: string,
): Promise<Response | null> {
  if (role !== "vendedor") return null;
  const row = await tursoFirst(
    env,
    `SELECT owner_id FROM pipeline_items WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    [itemId, workspaceId],
  );
  if (!row) return json({ error: "not_found" }, 404);
  if (String(row.owner_id ?? "") !== userId) return json({ error: "forbidden" }, 403);
  return null;
}

/* ── whitelist ───────────────────────────────────────────────────────── */

const STAGE_EDITABLE = ["name", "stage_order", "color", "is_won", "is_lost"] as const;
type StageField = typeof STAGE_EDITABLE[number];

const ITEM_EDITABLE = [
  "customer_id", "customer_name", "stage_id", "stage_name", "stage_order",
  "status", "estimated_value", "currency", "product", "priority", "position",
  "next_action_at", "next_action_label", "owner_id", "owner_name",
  "short_note", "lead_source", "catalog_item_id", "wholesale_code",
  "visit_at", "inactive_days", "closed_at",
] as const;
type ItemField = typeof ITEM_EDITABLE[number];

function pickStage(input: Record<string, unknown>): Record<StageField, TursoArg> {
  return pickFields(input, STAGE_EDITABLE) as Record<StageField, TursoArg>;
}

function pickItem(input: Record<string, unknown>): Record<ItemField, TursoArg> {
  return pickFields(input, ITEM_EDITABLE) as Record<ItemField, TursoArg>;
}

function pickFields(input: Record<string, unknown>, allowed: readonly string[]): Record<string, TursoArg> {
  const out: Record<string, TursoArg> = {};
  for (const k of allowed) {
    if (k in input) {
      const v = input[k];
      out[k] = v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? v
        : null;
    }
  }
  return out;
}

/* ═════════════════════════════════════════════════════════════════════ */
/*  STAGES                                                                */
/* ═════════════════════════════════════════════════════════════════════ */

export async function handleListStages(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRole(env, workspaceId, auth.userId);
  if (!role || !ROLES_READ.has(role)) return json({ error: "forbidden" }, 403);

  const [rows] = await tursoQuery(env, {
    sql: `SELECT id, name, stage_order, color, is_won, is_lost, created_at
            FROM pipeline_stages
            WHERE workspace_id = ? AND deleted_at IS NULL
            ORDER BY stage_order ASC, created_at ASC`,
    args: [workspaceId],
  });
  return json({ stages: rows ?? [] });
}

export async function handleCreateStage(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRole(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "settings.manage");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }
  if (typeof body.name !== "string" || !body.name.trim()) return json({ error: "missing_name" }, 400);

  const id = (typeof body.id === "string" && body.id) ? body.id : crypto.randomUUID();
  const fields = pickStage(body);
  fields.name = body.name.trim();

  const cols = ["id", "workspace_id", ...Object.keys(fields)];
  const vals: TursoArg[] = [id, workspaceId, ...Object.values(fields)];
  await tursoExec(
    env,
    `INSERT INTO pipeline_stages (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    vals,
  );
  return json({ ok: true, id }, 201);
}

export async function handleUpdateStage(workspaceId: string, stageId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRole(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "settings.manage");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }
  const fields = pickStage(body);
  if (Object.keys(fields).length === 0) return json({ error: "no_fields" }, 400);

  const set = Object.keys(fields).map((c) => `${c} = ?`);
  const args: TursoArg[] = [...Object.values(fields), stageId, workspaceId];
  await tursoExec(
    env,
    `UPDATE pipeline_stages SET ${set.join(", ")}
       WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    args,
  );
  return json({ ok: true });
}

export async function handleDeleteStage(workspaceId: string, stageId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRole(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "settings.manage");
  if (denied) return denied;

  await tursoExec(
    env,
    `UPDATE pipeline_stages SET deleted_at = datetime('now')
       WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    [stageId, workspaceId],
  );
  return json({ ok: true });
}

export async function handleImportStages(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRole(env, workspaceId, auth.userId);
  if (role !== "owner") return json({ error: "forbidden" }, 403);

  let body: { stages?: Array<Record<string, unknown>> };
  try { body = (await req.json()) as typeof body; } catch { return json({ error: "invalid_body" }, 400); }
  if (!Array.isArray(body.stages)) return json({ error: "missing_stages" }, 400);

  let imported = 0;
  let skipped = 0;
  for (const s of body.stages) {
    if (!s || typeof s !== "object") continue;
    const id = typeof s.id === "string" && s.id ? s.id : crypto.randomUUID();
    if (typeof s.name !== "string" || !s.name.trim()) continue;
    const exists = await tursoFirst(env, `SELECT id FROM pipeline_stages WHERE id = ?`, [id]);
    if (exists) { skipped++; continue; }
    const fields = pickStage(s as Record<string, unknown>);
    fields.name = s.name.trim();
    const cols = ["id", "workspace_id", ...Object.keys(fields)];
    const vals: TursoArg[] = [id, workspaceId, ...Object.values(fields)];
    await tursoExec(
      env,
      `INSERT INTO pipeline_stages (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
      vals,
    );
    imported++;
  }
  return json({ ok: true, imported, skipped });
}

/* ═════════════════════════════════════════════════════════════════════ */
/*  ITEMS (leads)                                                         */
/* ═════════════════════════════════════════════════════════════════════ */

export async function handleListItems(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRole(env, workspaceId, auth.userId);
  if (!role || !ROLES_READ.has(role)) return json({ error: "forbidden" }, 403);

  // T2: el vendedor ve solo SUS leads; managers y viewer ven todo.
  const scoped = role === "vendedor";
  const [rows] = await tursoQuery(env, {
    sql: `SELECT * FROM pipeline_items
            WHERE workspace_id = ? AND deleted_at IS NULL${scoped ? " AND owner_id = ?" : ""}
            ORDER BY stage_order ASC, position ASC, updated_at DESC`,
    args: scoped ? [workspaceId, auth.userId] : [workspaceId],
  });
  return json({ items: rows ?? [] });
}

export async function handleCreateItem(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRole(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "pipeline.write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }
  if (typeof body.customer_id !== "string" || typeof body.stage_id !== "string" || typeof body.stage_name !== "string") {
    return json({ error: "missing_required" }, 400);
  }

  const id = (typeof body.id === "string" && body.id) ? body.id : crypto.randomUUID();
  const fields = pickItem(body);
  // T2: owner_id = dueño del lead (alcance del vendedor). El vendedor solo
  // crea leads suyos; managers pueden asignar (owner_id del body) o, si no lo
  // mandan, default al creador.
  if (role === "vendedor" || !fields.owner_id) {
    fields.owner_id = auth.userId;
  }

  const cols = ["id", "workspace_id", "created_by", ...Object.keys(fields)];
  const vals: TursoArg[] = [id, workspaceId, auth.userId, ...Object.values(fields)];
  try {
    await tursoExec(
      env,
      `INSERT INTO pipeline_items (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
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

export async function handleUpdateItem(workspaceId: string, itemId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRole(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "pipeline.write");
  if (denied) return denied;

  // T2: el vendedor solo edita SUS leads.
  const ownerErr = await assertOwnsItem(env, workspaceId, itemId, role, auth.userId);
  if (ownerErr) return ownerErr;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }
  const fields = pickItem(body);
  // El vendedor no puede reasignar el lead a otro dueño (reassign es de
  // managers); ignoramos owner_id en su PATCH.
  if (role === "vendedor") delete (fields as Record<string, TursoArg>).owner_id;
  if (Object.keys(fields).length === 0) return json({ error: "no_fields" }, 400);

  const set = Object.keys(fields).map((c) => `${c} = ?`).concat(["updated_at = datetime('now')"]);
  const args: TursoArg[] = [...Object.values(fields), itemId, workspaceId];
  await tursoExec(
    env,
    `UPDATE pipeline_items SET ${set.join(", ")}
       WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    args,
  );
  return json({ ok: true });
}

export async function handleDeleteItem(workspaceId: string, itemId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRole(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "pipeline.write");
  if (denied) return denied;

  // T2: el vendedor solo borra SUS leads.
  const ownerErr = await assertOwnsItem(env, workspaceId, itemId, role, auth.userId);
  if (ownerErr) return ownerErr;

  await tursoExec(
    env,
    `UPDATE pipeline_items SET deleted_at = datetime('now')
       WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    [itemId, workspaceId],
  );
  return json({ ok: true });
}

export async function handleImportItems(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRole(env, workspaceId, auth.userId);
  if (role !== "owner") return json({ error: "forbidden" }, 403);

  let body: { items?: Array<Record<string, unknown>> };
  try { body = (await req.json()) as typeof body; } catch { return json({ error: "invalid_body" }, 400); }
  if (!Array.isArray(body.items)) return json({ error: "missing_items" }, 400);
  if (body.items.length > 10000) return json({ error: "too_many", limit: 10000 }, 413);

  let imported = 0;
  let skipped = 0;
  const errors: Array<{ id: string; error: string }> = [];
  for (const it of body.items) {
    if (!it || typeof it !== "object") continue;
    const id = typeof it.id === "string" && it.id ? it.id : crypto.randomUUID();
    if (typeof it.customer_id !== "string" || typeof it.stage_id !== "string" || typeof it.stage_name !== "string") {
      errors.push({ id, error: "missing_required" });
      continue;
    }
    const exists = await tursoFirst(env, `SELECT id FROM pipeline_items WHERE id = ?`, [id]);
    if (exists) { skipped++; continue; }
    const fields = pickItem(it as Record<string, unknown>);
    // T2: si el lead viejo no traía dueño, lo asignamos al owner que importa.
    if (!fields.owner_id) fields.owner_id = auth.userId;
    const createdAt = typeof it.created_at === "string" ? it.created_at : null;
    const cols = ["id", "workspace_id", "created_by", ...Object.keys(fields)];
    const vals: TursoArg[] = [id, workspaceId, auth.userId, ...Object.values(fields)];
    if (createdAt) { cols.push("created_at"); vals.push(createdAt); }
    try {
      await tursoExec(
        env,
        `INSERT OR IGNORE INTO pipeline_items (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
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
