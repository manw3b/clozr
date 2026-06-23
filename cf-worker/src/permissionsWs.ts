/**
 * permissionsWs.ts — enforcement de permisos CONSCIENTE DEL WORKSPACE (Fase ⑤).
 *
 * Extiende la matriz por defecto de `permissions.ts` con overrides por negocio
 * guardados en `workspace_settings` (key `role_permissions`, JSON { rol: [perms] }).
 *
 * Reglas de seguridad:
 *   - El OWNER es inmutable: siempre tiene TODOS los permisos (anti-lockout).
 *   - Solo el owner puede editar la matriz (lo aplica el endpoint, no acá).
 *   - Roles sin override usan EXACTAMENTE el default → cero cambio para quien no
 *     personaliza.
 *
 * Concurrencia: el cache es por workspace_id (no por request), así que es seguro
 * en isolates con requests concurrentes. TTL corto + invalidación en el PUT.
 */

import type { Env } from "./index";
import { tursoFirst } from "./turso";
import { ensureWorkspaceSettings } from "./schema";
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, normalizeRole, type Permission } from "./permissions";

const ROLE_PERMS_KEY = "role_permissions";
const TTL_MS = 30_000;
const EDITABLE_ROLES = ["admin", "vendedor", "viewer"] as const;

type Matrix = Record<string, Set<Permission>>;
const cache = new Map<string, { matrix: Matrix; exp: number }>();

const PERM_SET = new Set<string>(ALL_PERMISSIONS);

export function invalidatePermsCache(workspaceId: string): void {
  cache.delete(workspaceId);
}

async function loadOverride(env: Env, workspaceId: string): Promise<Record<string, Permission[]>> {
  // Fail-safe: ante CUALQUIER error (tabla inexistente, JSON inválido, query
  // caída) devolvemos {} → la matriz cae a los defaults. Nunca 500 ni un
  // allow/deny accidental por un error de lectura.
  try {
    const row = await tursoFirst(
      env,
      `SELECT value FROM workspace_settings WHERE workspace_id = ? AND key = ?`,
      [workspaceId, ROLE_PERMS_KEY],
    );
    const raw = row?.value;
    if (typeof raw !== "string" || !raw.trim()) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, Permission[]> = {};
    for (const [role, perms] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(perms)) continue;
      out[role] = perms.filter((p): p is Permission => typeof p === "string" && PERM_SET.has(p));
    }
    return out;
  } catch {
    return {};
  }
}

async function buildMatrix(env: Env, workspaceId: string): Promise<Matrix> {
  await ensureWorkspaceSettings(env); // garantiza la tabla antes de leer el override
  const override = await loadOverride(env, workspaceId);
  const m: Matrix = {};
  // owner: SIEMPRE todo, ignorando cualquier override (anti-lockout).
  m.owner = new Set(ALL_PERMISSIONS);
  for (const role of EDITABLE_ROLES) {
    m[role] = new Set(override[role] ?? ROLE_PERMISSIONS[role]);
  }
  return m;
}

async function getMatrix(env: Env, workspaceId: string): Promise<Matrix> {
  const now = Date.now();
  const hit = cache.get(workspaceId);
  if (hit && hit.exp >= now) return hit.matrix;
  const matrix = await buildMatrix(env, workspaceId);
  cache.set(workspaceId, { matrix, exp: now + TTL_MS });
  return matrix;
}

/** Permisos efectivos de un rol en un workspace (default + override del negocio). */
export async function effectivePermissions(env: Env, workspaceId: string, role: string | null | undefined): Promise<Set<Permission>> {
  const r = normalizeRole(role);
  if (r === "owner") return new Set(ALL_PERMISSIONS);
  const matrix = await getMatrix(env, workspaceId);
  return matrix[r] ?? new Set();
}

/**
 * Guardia workspace-aware para handlers. Devuelve 403 si el rol (con el override
 * del negocio aplicado) no tiene el permiso, o null si está autorizado.
 */
export async function requirePermWs(
  env: Env,
  workspaceId: string,
  role: string | null | undefined,
  perm: Permission,
): Promise<Response | null> {
  const perms = await effectivePermissions(env, workspaceId, role);
  if (perms.has(perm)) return null;
  return new Response(JSON.stringify({ error: "forbidden" }), {
    status: 403,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Matriz efectiva completa { rol: [perms] } — para renderizar la UI de Equipo. */
export async function effectiveMatrix(env: Env, workspaceId: string): Promise<Record<string, Permission[]>> {
  const m = await buildMatrix(env, workspaceId);
  return {
    owner: [...(m.owner ?? [])],
    admin: [...(m.admin ?? [])],
    vendedor: [...(m.vendedor ?? [])],
    viewer: [...(m.viewer ?? [])],
  };
}
