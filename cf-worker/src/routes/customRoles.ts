/**
 * Roles personalizados por negocio (Fase ⑤.B).
 *
 * Routes:
 *   GET /workspaces/:wid/custom-roles   → { roles: [{id,name,permissions}], all: [perms] }  (miembro)
 *   PUT /workspaces/:wid/custom-roles   ← { roles: [{id,name,permissions}] }                 (SOLO owner)
 *
 * Se guardan en workspace_settings/custom_roles (fuera del PUT genérico, que
 * rechaza la clave reservada). No se puede borrar un rol asignado a un miembro
 * activo (role_in_use) — el dueño reasigna primero.
 */

import type { Env } from "../index";
import { ensureSchema, ensureWorkspaceSettings } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoFirst } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";
import { ALL_PERMISSIONS, type Permission } from "../permissions";
import { loadCustomRoles, invalidatePermsCache, type CustomRole } from "../permissionsWs";

const ROLES_READ = new Set(["owner", "admin", "vendedor", "viewer"]);
const BUILTIN = new Set(["owner", "admin", "vendedor", "viewer"]);
const PERM_SET = new Set<string>(ALL_PERMISSIONS);
const MAX_ROLES = 20;
const MAX_NAME = 40;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,38}$/; // slug seguro, distinto de los built-ins

export async function handleGetCustomRoles(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureWorkspaceSettings(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role || !ROLES_READ.has(role)) return json({ error: "forbidden" }, 403);
  const roles = await loadCustomRoles(env, workspaceId);
  return json({ roles, all: ALL_PERMISSIONS });
}

export async function handlePutCustomRoles(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureWorkspaceSettings(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (role !== "owner") return json({ error: "owner_only" }, 403);

  let body: { roles?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return json({ error: "invalid_body" }, 400); }
  if (!Array.isArray(body.roles)) return json({ error: "invalid_roles" }, 400);
  if (body.roles.length > MAX_ROLES) return json({ error: "too_many_roles" }, 400);

  const clean: CustomRole[] = [];
  const seen = new Set<string>();
  for (const r of body.roles) {
    if (!r || typeof r !== "object") return json({ error: "invalid_role" }, 400);
    const obj = r as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id : "";
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!ID_RE.test(id) || BUILTIN.has(id)) return json({ error: "invalid_role_id" }, 400);
    if (!name || name.length > MAX_NAME) return json({ error: "invalid_role_name" }, 400);
    if (seen.has(id)) return json({ error: "duplicate_role_id" }, 400);
    seen.add(id);
    const perms = obj.permissions;
    clean.push({
      id,
      name,
      permissions: Array.isArray(perms) ? perms.filter((p): p is Permission => typeof p === "string" && PERM_SET.has(p)) : [],
    });
  }

  // Anti-orfandad: no borrar un rol que algún miembro activo está usando.
  const removed = (await loadCustomRoles(env, workspaceId)).filter((p) => !seen.has(p.id)).map((p) => p.id);
  if (removed.length > 0) {
    const inUse = await tursoFirst(
      env,
      `SELECT role FROM memberships
         WHERE workspace_id = ? AND status = 'active' AND role IN (${removed.map(() => "?").join(", ")})
         LIMIT 1`,
      [workspaceId, ...removed],
    );
    if (inUse) return json({ error: "role_in_use", role: String(inUse.role) }, 409);
  }

  await tursoExec(
    env,
    `INSERT INTO workspace_settings (workspace_id, key, value, updated_at)
       VALUES (?, 'custom_roles', ?, datetime('now'))
     ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [workspaceId, JSON.stringify(clean)],
  );
  invalidatePermsCache(workspaceId);
  return json({ ok: true, roles: clean });
}
