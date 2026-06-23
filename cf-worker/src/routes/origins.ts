/**
 * Orígenes ("viene de") — lista gestionable por workspace para etiquetar de
 * dónde viene una venta (ej "MobileZone", "Instagram"). Fase ①.
 *
 * Routes:
 *   GET    /workspaces/:wid/origins        list (cualquier miembro activo)
 *   POST   /workspaces/:wid/origins        crear (sales.write)
 *   DELETE /workspaces/:wid/origins/:oid   soft-delete (settings.manage)
 *
 * NB: distinto de /referral (programa de afiliados) y de pipeline_items.lead_source.
 */

import type { Env } from "../index";
import { ensureSchema, ensureOrigins } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoFirst, tursoQuery } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";
import { requirePerm } from "../permissions";

const ROLES_READ = new Set(["owner", "admin", "vendedor", "viewer"]);

export async function handleListOrigins(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureOrigins(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role || !ROLES_READ.has(role)) return json({ error: "forbidden" }, 403);

  const [rows] = await tursoQuery(env, {
    sql: `SELECT id, name, created_at FROM origins
            WHERE workspace_id = ? AND deleted_at IS NULL
            ORDER BY name COLLATE NOCASE ASC`,
    args: [workspaceId],
  });
  return json({ origins: rows ?? [] });
}

export async function handleCreateOrigin(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureOrigins(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "sales.write");
  if (denied) return denied;

  let body: { id?: unknown; name?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return json({ error: "invalid_body" }, 400); }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return json({ error: "invalid_name" }, 400);

  // Dedupe case-insensitive: si ya existe uno activo con ese nombre, lo devolvemos.
  const existing = await tursoFirst(
    env,
    `SELECT id, name, created_at FROM origins
       WHERE workspace_id = ? AND deleted_at IS NULL AND name = ? COLLATE NOCASE
       LIMIT 1`,
    [workspaceId, name],
  );
  if (existing) return json({ origin: existing });

  const id = (typeof body.id === "string" && body.id) ? body.id : crypto.randomUUID();
  await tursoExec(env, `INSERT INTO origins (id, workspace_id, name) VALUES (?, ?, ?)`, [id, workspaceId, name]);
  return json({ origin: { id, name } }, 201);
}

export async function handleDeleteOrigin(workspaceId: string, originId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureOrigins(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "settings.manage");
  if (denied) return denied;

  await tursoExec(
    env,
    `UPDATE origins SET deleted_at = datetime('now')
       WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    [originId, workspaceId],
  );
  return json({ ok: true });
}
