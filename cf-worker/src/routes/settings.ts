/**
 * Config KV por workspace (Fase ②) — guarda settings editables por negocio,
 * arrancando por las plantillas de turno. Genérico a propósito (clave→valor)
 * para reusarlo en plantillas de "enviar rápido" y demás config futura.
 *
 * Routes:
 *   GET /workspaces/:wid/settings   → { settings: { key: value, ... } }  (miembro)
 *   PUT /workspaces/:wid/settings   ← { settings: { key: value, ... } }  (settings.manage)
 */

import type { Env } from "../index";
import { ensureSchema, ensureWorkspaceSettings } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoQuery } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";
import { requirePerm } from "../permissions";

const ROLES_READ = new Set(["owner", "admin", "vendedor", "viewer"]);
const MAX_KEY = 64;
const MAX_VALUE = 8000;
const MAX_KEYS = 50;

export async function handleGetSettings(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureWorkspaceSettings(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role || !ROLES_READ.has(role)) return json({ error: "forbidden" }, 403);

  const [rows] = await tursoQuery(env, {
    sql: `SELECT key, value FROM workspace_settings WHERE workspace_id = ?`,
    args: [workspaceId],
  });
  const settings: Record<string, string> = {};
  for (const r of rows ?? []) {
    if (r && typeof r.key === "string") settings[r.key] = r.value == null ? "" : String(r.value);
  }
  return json({ settings });
}

export async function handlePutSettings(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureWorkspaceSettings(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "settings.manage");
  if (denied) return denied;

  let body: { settings?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return json({ error: "invalid_body" }, 400); }
  const incoming = body.settings;
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    return json({ error: "invalid_settings" }, 400);
  }
  const entries = Object.entries(incoming as Record<string, unknown>);
  if (entries.length === 0) return json({ ok: true });
  if (entries.length > MAX_KEYS) return json({ error: "too_many_keys" }, 400);

  for (const [k, v] of entries) {
    if (typeof k !== "string" || !k || k.length > MAX_KEY) return json({ error: "invalid_key" }, 400);
    const val = v == null ? "" : String(v);
    if (val.length > MAX_VALUE) return json({ error: "value_too_long" }, 400);
    await tursoExec(
      env,
      `INSERT INTO workspace_settings (workspace_id, key, value, updated_at)
         VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      [workspaceId, k, val],
    );
  }
  return json({ ok: true });
}
