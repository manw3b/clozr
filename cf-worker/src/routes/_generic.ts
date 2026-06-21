/**
 * Helpers reutilizables para tablas simples scope-workspace con
 * soft-delete via deleted_at. Las usamos en routes/tasks/cash/followups/
 * catalog/payment_methods/customer_types/customer_tags (todas R4+R5).
 *
 * No las usamos en sales (que tiene items + payments multitabla) ni
 * customers (que ya tiene su archivo dedicado por nuance histórica).
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoFirst, tursoQuery, type TursoArg } from "../turso";
import { requirePerm, type Permission } from "../permissions";

export interface TableSpec {
  /** SQL table name. */
  table: string;
  /** Whitelist de columns que el client puede mandar para insert/update. */
  editable: readonly string[];
  /** Required fields para INSERT — si falta alguno, 400. */
  required: readonly string[];
  /** Roles que pueden read. */
  rolesRead: Set<string>;
  /** Roles que pueden create. */
  rolesCreate: Set<string>;
  /** Roles que pueden update. */
  rolesEdit: Set<string>;
  /** Roles que pueden delete. */
  rolesDelete: Set<string>;
  /**
   * Permiso de escritura (matriz del frontend). Si está seteado, las
   * operaciones create/update/delete se gatean con `requirePerm(role, perm)`
   * en vez de los Sets `rolesCreate/Edit/Delete` — para las tablas mapeadas
   * en el plan de equipos (tasks→tasks.write, cash→cash.write,
   * catalog→inventory.write). Las tablas sin `permission` conservan el
   * gateo por Sets de antes.
   */
  permission?: Permission;
  /** ORDER BY clause (sin "ORDER BY"). */
  orderBy?: string;
  /** Soft-delete via deleted_at (default true). */
  softDelete?: boolean;
}

export async function getRoleInWorkspace(env: Env, workspaceId: string, userId: string): Promise<string | null> {
  const m = await tursoFirst(
    env,
    `SELECT role FROM memberships
       WHERE workspace_id = ? AND user_id = ? AND status = 'active'`,
    [workspaceId, userId],
  );
  return m ? String(m.role) : null;
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

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/* ── LIST ────────────────────────────────────────────────────────────── */

export async function handleGenericList(spec: TableSpec, workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role || !spec.rolesRead.has(role)) return json({ error: "forbidden" }, 403);

  const softFilter = spec.softDelete !== false ? `AND deleted_at IS NULL` : "";
  const orderBy = spec.orderBy ? `ORDER BY ${spec.orderBy}` : "";
  const [rows] = await tursoQuery(env, {
    sql: `SELECT * FROM ${spec.table} WHERE workspace_id = ? ${softFilter} ${orderBy}`,
    args: [workspaceId],
  });
  return json({ items: rows ?? [] });
}

/* ── CREATE ──────────────────────────────────────────────────────────── */

export async function handleGenericCreate(spec: TableSpec, workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  if (spec.permission) {
    const denied = requirePerm(role, spec.permission);
    if (denied) return denied;
  } else if (!spec.rolesCreate.has(role)) {
    return json({ error: "forbidden" }, 403);
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }

  for (const r of spec.required) {
    if (body[r] === undefined || body[r] === null || (typeof body[r] === "string" && !(body[r] as string).trim())) {
      return json({ error: "missing_required", field: r }, 400);
    }
  }

  const id = (typeof body.id === "string" && body.id) ? body.id : crypto.randomUUID();
  const fields = pickFields(body, spec.editable);
  const cols = ["id", "workspace_id", "created_by", ...Object.keys(fields)];
  const vals: TursoArg[] = [id, workspaceId, auth.userId, ...Object.values(fields)];
  try {
    await tursoExec(
      env,
      `INSERT INTO ${spec.table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
      vals,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : String(e);
    if (msg.includes("unique") || msg.includes("primary key")) {
      return json({ error: "duplicate_id", id }, 409);
    }
    // Si la tabla no tiene created_by, retry sin ese col. Match amplio: cubre
    // cualquier variante del mensaje de Turso (con/sin comillas) que mencione
    // la columna ausente.
    if (msg.includes("created_by")) {
      const cols2 = ["id", "workspace_id", ...Object.keys(fields)];
      const vals2: TursoArg[] = [id, workspaceId, ...Object.values(fields)];
      await tursoExec(
        env,
        `INSERT INTO ${spec.table} (${cols2.join(", ")}) VALUES (${cols2.map(() => "?").join(", ")})`,
        vals2,
      );
      return json({ ok: true, id }, 201);
    }
    throw e;
  }
  return json({ ok: true, id }, 201);
}

/* ── UPDATE ──────────────────────────────────────────────────────────── */

export async function handleGenericUpdate(spec: TableSpec, workspaceId: string, recordId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  if (spec.permission) {
    const denied = requirePerm(role, spec.permission);
    if (denied) return denied;
  } else if (!spec.rolesEdit.has(role)) {
    return json({ error: "forbidden" }, 403);
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }
  const fields = pickFields(body, spec.editable);
  if (Object.keys(fields).length === 0) return json({ error: "no_fields" }, 400);

  const set = Object.keys(fields).map((c) => `${c} = ?`);
  // updated_at solo si la tabla lo tiene — agregamos un try/catch fallback.
  const setWithUpdated = [...set, "updated_at = datetime('now')"];
  const args: TursoArg[] = [...Object.values(fields), recordId, workspaceId];
  try {
    await tursoExec(
      env,
      `UPDATE ${spec.table} SET ${setWithUpdated.join(", ")}
         WHERE id = ? AND workspace_id = ?`,
      args,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : String(e);
    if (msg.includes("no such column: updated_at") || msg.includes("has no column named updated_at")) {
      // Tabla sin updated_at — re-intentar sin él.
      await tursoExec(
        env,
        `UPDATE ${spec.table} SET ${set.join(", ")} WHERE id = ? AND workspace_id = ?`,
        args,
      );
      return json({ ok: true });
    }
    throw e;
  }
  return json({ ok: true });
}

/* ── DELETE (soft) ──────────────────────────────────────────────────── */

export async function handleGenericDelete(spec: TableSpec, workspaceId: string, recordId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  if (spec.permission) {
    const denied = requirePerm(role, spec.permission);
    if (denied) return denied;
  } else if (!spec.rolesDelete.has(role)) {
    return json({ error: "forbidden" }, 403);
  }

  if (spec.softDelete === false) {
    await tursoExec(
      env,
      `DELETE FROM ${spec.table} WHERE id = ? AND workspace_id = ?`,
      [recordId, workspaceId],
    );
  } else {
    await tursoExec(
      env,
      `UPDATE ${spec.table} SET deleted_at = datetime('now') WHERE id = ? AND workspace_id = ?`,
      [recordId, workspaceId],
    );
  }
  return json({ ok: true });
}

/* ── IMPORT (bootstrap) ─────────────────────────────────────────────── */

export async function handleGenericImport(spec: TableSpec, workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (role !== "owner") return json({ error: "forbidden" }, 403);

  let body: { items?: Array<Record<string, unknown>> };
  try { body = (await req.json()) as typeof body; } catch { return json({ error: "invalid_body" }, 400); }
  if (!Array.isArray(body.items)) return json({ error: "missing_items" }, 400);
  if (body.items.length > 20000) return json({ error: "too_many", limit: 20000 }, 413);

  let imported = 0;
  let skipped = 0;
  const errors: Array<{ id: string; error: string }> = [];
  for (const it of body.items) {
    if (!it || typeof it !== "object") continue;
    const id = typeof it.id === "string" && it.id ? it.id : crypto.randomUUID();
    let missingReq = false;
    for (const r of spec.required) {
      if (it[r] === undefined || it[r] === null) {
        errors.push({ id, error: `missing_${r}` });
        missingReq = true;
        break;
      }
    }
    if (missingReq) continue;
    const exists = await tursoFirst(env, `SELECT id FROM ${spec.table} WHERE id = ?`, [id]);
    if (exists) { skipped++; continue; }
    const fields = pickFields(it as Record<string, unknown>, spec.editable);
    const createdAt = typeof it.created_at === "string" ? it.created_at : null;
    const cols = ["id", "workspace_id", "created_by", ...Object.keys(fields)];
    const vals: TursoArg[] = [id, workspaceId, auth.userId, ...Object.values(fields)];
    if (createdAt) { cols.push("created_at"); vals.push(createdAt); }
    try {
      await tursoExec(
        env,
        `INSERT OR IGNORE INTO ${spec.table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
        vals,
      );
      imported++;
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : String(e);
      if (msg.includes("created_by")) {
        // Retry sin created_by (match amplio ante variantes del mensaje).
        const cols2 = ["id", "workspace_id", ...Object.keys(fields)];
        const vals2: TursoArg[] = [id, workspaceId, ...Object.values(fields)];
        if (createdAt) { cols2.push("created_at"); vals2.push(createdAt); }
        try {
          await tursoExec(
            env,
            `INSERT OR IGNORE INTO ${spec.table} (${cols2.join(", ")}) VALUES (${cols2.map(() => "?").join(", ")})`,
            vals2,
          );
          imported++;
        } catch (e2) {
          errors.push({ id, error: e2 instanceof Error ? e2.message : "unknown" });
        }
      } else {
        errors.push({ id, error: e instanceof Error ? e.message : "unknown" });
      }
    }
  }
  return json({ ok: true, imported, skipped, errors });
}
