/**
 * Tipos de turno — lista editable por workspace (Fase ④). Mismo patrón que
 * origins: el turno guarda el NOMBRE del tipo; esta lista alimenta el picker.
 *
 * Routes:
 *   GET    /workspaces/:wid/appointment-types        list (cualquier miembro)
 *   POST   /workspaces/:wid/appointment-types        crear (sales.write)
 *   DELETE /workspaces/:wid/appointment-types/:id    soft-delete (settings.manage)
 */

import type { Env } from "../index";
import { ensureSchema, ensureAppointmentTypes } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoFirst, tursoQuery } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";
import { requirePermWs } from "../permissionsWs";

const ROLES_READ = new Set(["owner", "admin", "vendedor", "viewer"]);

export async function handleListAppointmentTypes(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureAppointmentTypes(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role || !ROLES_READ.has(role)) return json({ error: "forbidden" }, 403);

  const [rows] = await tursoQuery(env, {
    sql: `SELECT id, name, created_at FROM appointment_types
            WHERE workspace_id = ? AND deleted_at IS NULL
            ORDER BY name COLLATE NOCASE ASC`,
    args: [workspaceId],
  });
  return json({ types: rows ?? [] });
}

export async function handleCreateAppointmentType(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureAppointmentTypes(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = await requirePermWs(env, workspaceId, role, "sales.write");
  if (denied) return denied;

  let body: { id?: unknown; name?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return json({ error: "invalid_body" }, 400); }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return json({ error: "invalid_name" }, 400);
  if (name.length > 60) return json({ error: "name_too_long" }, 400);

  // Dedupe case-insensitive.
  const existing = await tursoFirst(
    env,
    `SELECT id, name, created_at FROM appointment_types
       WHERE workspace_id = ? AND deleted_at IS NULL AND name = ? COLLATE NOCASE
       LIMIT 1`,
    [workspaceId, name],
  );
  if (existing) return json({ type: existing });

  const id = typeof body.id === "string" && body.id ? body.id : crypto.randomUUID();
  await tursoExec(env, `INSERT INTO appointment_types (id, workspace_id, name) VALUES (?, ?, ?)`, [id, workspaceId, name]);
  return json({ type: { id, name } }, 201);
}

export async function handleDeleteAppointmentType(workspaceId: string, typeId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureAppointmentTypes(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = await requirePermWs(env, workspaceId, role, "settings.manage");
  if (denied) return denied;

  await tursoExec(
    env,
    `UPDATE appointment_types SET deleted_at = datetime('now')
       WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    [typeId, workspaceId],
  );
  return json({ ok: true });
}
