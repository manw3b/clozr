/**
 * Permisos por rol editables por negocio (Fase ⑤, Paso A).
 *
 * Routes:
 *   GET /workspaces/:wid/role-permissions   → { roles: { rol: [perms] }, all: [perms] }  (miembro)
 *   PUT /workspaces/:wid/role-permissions   ← { roles: { rol: [perms] } }                 (SOLO owner)
 *
 * Seguridad:
 *   - Editar es SOLO del owner (no se delega ni se puede quitar; el owner es inmutable).
 *   - El rol "owner" no es editable (siempre tiene todo).
 *   - El override se guarda en workspace_settings/role_permissions, fuera del PUT
 *     genérico de settings (que rechaza esa clave reservada).
 */

import type { Env } from "../index";
import { ensureSchema, ensureWorkspaceSettings } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";
import { ALL_PERMISSIONS, type Permission } from "../permissions";
import { effectiveMatrix, invalidatePermsCache } from "../permissionsWs";

const ROLES_READ = new Set(["owner", "admin", "vendedor", "viewer"]);
const EDITABLE_ROLES = new Set(["admin", "vendedor", "viewer"]);
const PERM_SET = new Set<string>(ALL_PERMISSIONS);

export async function handleGetRolePermissions(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureWorkspaceSettings(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role || !ROLES_READ.has(role)) return json({ error: "forbidden" }, 403);

  const roles = await effectiveMatrix(env, workspaceId);
  return json({ roles, all: ALL_PERMISSIONS });
}

export async function handlePutRolePermissions(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureWorkspaceSettings(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  // SOLO el owner edita la matriz (no es un permiso delegable).
  if (role !== "owner") return json({ error: "owner_only" }, 403);

  let body: { roles?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return json({ error: "invalid_body" }, 400); }
  const roles = body.roles;
  if (!roles || typeof roles !== "object" || Array.isArray(roles)) return json({ error: "invalid_roles" }, 400);

  const clean: Record<string, Permission[]> = {};
  for (const [r, perms] of Object.entries(roles as Record<string, unknown>)) {
    if (!EDITABLE_ROLES.has(r)) continue; // ignora "owner" y roles desconocidos
    if (!Array.isArray(perms)) return json({ error: "invalid_perms" }, 400);
    clean[r] = perms.filter((p): p is Permission => typeof p === "string" && PERM_SET.has(p));
  }

  await tursoExec(
    env,
    `INSERT INTO workspace_settings (workspace_id, key, value, updated_at)
       VALUES (?, 'role_permissions', ?, datetime('now'))
     ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [workspaceId, JSON.stringify(clean)],
  );
  invalidatePermsCache(workspaceId);
  return json({ ok: true });
}
