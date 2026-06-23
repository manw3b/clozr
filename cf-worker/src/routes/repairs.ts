/**
 * Reparaciones (Fase ⑥) — módulo del taller. Entidad propia con su ciclo de
 * vida (estados fijos) y datos del equipo.
 *
 * Routes:
 *   GET    /workspaces/:wid/repairs          list (cualquier miembro — tablero compartido)
 *   POST   /workspaces/:wid/repairs          crear (repairs.write)
 *   PATCH  /workspaces/:wid/repairs/:id      editar / mover de estado (repairs.write)
 *   DELETE /workspaces/:wid/repairs/:id      soft-delete (repairs.write)
 */

import type { Env } from "../index";
import { ensureSchema, ensureRepairs } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoFirst, tursoQuery, type TursoArg } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";
import { requirePermWs } from "../permissionsWs";

const ROLES_READ = new Set(["owner", "admin", "vendedor", "viewer"]);

const STATUSES = new Set([
  "received", "diagnosing", "quoted", "approved", "repairing", "ready", "delivered", "cancelled",
]);

const EDITABLE = [
  "customer_id", "customer_name", "customer_phone",
  "device_model", "device_imei", "device_passcode", "accessories",
  "problem", "diagnosis", "status",
  "parts_cost", "labor_cost", "technician", "warranty_months", "notes",
  "received_at", "estimated_at", "delivered_at",
  "appointment_id", "sale_id",
] as const;

function pick(input: Record<string, unknown>, allowed: readonly string[]): Record<string, TursoArg> {
  const out: Record<string, TursoArg> = {};
  for (const k of allowed) {
    if (k in input) {
      const v = input[k];
      out[k] = v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : null;
    }
  }
  return out;
}

export async function handleListRepairs(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureRepairs(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role || !ROLES_READ.has(role)) return json({ error: "forbidden" }, 403);

  const [rows] = await tursoQuery(env, {
    sql: `SELECT * FROM repairs
            WHERE workspace_id = ? AND deleted_at IS NULL
            ORDER BY created_at DESC`,
    args: [workspaceId],
  });
  return json({ repairs: rows ?? [] });
}

export async function handleCreateRepair(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureRepairs(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = await requirePermWs(env, workspaceId, role, "repairs.write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }

  const customerName = typeof body.customer_name === "string" ? body.customer_name.trim() : "";
  if (!customerName) return json({ error: "missing_customer" }, 400);
  const status = typeof body.status === "string" && STATUSES.has(body.status) ? body.status : "received";

  const fields = pick(body, EDITABLE);
  fields.customer_name = customerName;
  fields.status = status;
  if (!("received_at" in fields) || !fields.received_at) fields.received_at = new Date().toISOString().slice(0, 16);

  const id = typeof body.id === "string" && body.id ? body.id : crypto.randomUUID();
  const cols = ["id", "workspace_id", "owner_id", "owner_name", ...Object.keys(fields)];
  const vals: TursoArg[] = [id, workspaceId, auth.userId, typeof body.owner_name === "string" ? body.owner_name : auth.email ?? null, ...Object.values(fields)];
  const placeholders = cols.map(() => "?").join(", ");
  await tursoExec(env, `INSERT INTO repairs (${cols.join(", ")}) VALUES (${placeholders})`, vals);
  return json({ id }, 201);
}

export async function handleUpdateRepair(workspaceId: string, repairId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureRepairs(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = await requirePermWs(env, workspaceId, role, "repairs.write");
  if (denied) return denied;

  const exists = await tursoFirst(
    env,
    `SELECT id FROM repairs WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    [repairId, workspaceId],
  );
  if (!exists) return json({ error: "not_found" }, 404);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }
  if (typeof body.status === "string" && !STATUSES.has(body.status)) return json({ error: "invalid_status" }, 400);

  const fields = pick(body, EDITABLE);
  if (Object.keys(fields).length === 0) return json({ error: "no_fields" }, 400);

  const setSql = Object.keys(fields).map((c) => `${c} = ?`).join(", ");
  await tursoExec(
    env,
    `UPDATE repairs SET ${setSql}, updated_at = datetime('now') WHERE id = ? AND workspace_id = ?`,
    [...Object.values(fields), repairId, workspaceId],
  );
  return json({ ok: true });
}

export async function handleDeleteRepair(workspaceId: string, repairId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureRepairs(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = await requirePermWs(env, workspaceId, role, "repairs.write");
  if (denied) return denied;

  await tursoExec(
    env,
    `UPDATE repairs SET deleted_at = datetime('now')
       WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    [repairId, workspaceId],
  );
  return json({ ok: true });
}
