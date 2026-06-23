/**
 * Home por rol configurable (Fase ⑧). Cada rol del workspace puede tener su
 * propia lista de "bloques" que ve en Mi Día (ventas/tareas/turnos/ranking…).
 *
 * Routes:
 *   GET /workspaces/:wid/home-layouts  → { layouts: { roleKey: string[] } }   (miembro)
 *   PUT /workspaces/:wid/home-layouts  ← { layouts: { roleKey: string[] } }    (SOLO owner)
 *
 * El catálogo de bloques y los defaults viven en el front (es UI pura). Acá solo
 * persistimos el override que arma el dueño; si un rol no tiene entrada, el front
 * aplica su default. La clave `home_layouts` está reservada en el PUT genérico de
 * settings (no se puede pisar desde ahí).
 */

import type { Env } from "../index";
import { ensureSchema, ensureWorkspaceSettings } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoFirst } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";

const HOME_LAYOUTS_KEY = "home_layouts";
const MAX_ROLES = 40;
const MAX_BLOCKS = 40;
const MAX_KEY_LEN = 64;

export async function handleGetHomeLayouts(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureWorkspaceSettings(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);

  let layouts: Record<string, string[]> = {};
  // Fail-safe: ante cualquier error de lectura devolvemos {} y el front cae a
  // los defaults (no rompe Mi Día por un problema de settings).
  try {
    const row = await tursoFirst(
      env,
      `SELECT value FROM workspace_settings WHERE workspace_id = ? AND key = ?`,
      [workspaceId, HOME_LAYOUTS_KEY],
    );
    const raw = row?.value;
    if (typeof raw === "string" && raw.trim()) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const out: Record<string, string[]> = {};
        for (const [r, blocks] of Object.entries(parsed as Record<string, unknown>)) {
          if (!Array.isArray(blocks)) continue;
          out[r] = blocks.filter((b): b is string => typeof b === "string");
        }
        layouts = out;
      }
    }
  } catch {
    layouts = {};
  }
  return json({ layouts });
}

export async function handlePutHomeLayouts(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureWorkspaceSettings(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  // Configurar el home de cada rol es SOLO del owner (igual que la matriz de permisos).
  if (role !== "owner") return json({ error: "owner_only" }, 403);

  let body: { layouts?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return json({ error: "invalid_body" }, 400); }
  const layouts = body.layouts;
  if (!layouts || typeof layouts !== "object" || Array.isArray(layouts)) return json({ error: "invalid_layouts" }, 400);

  const clean: Record<string, string[]> = {};
  for (const [r, blocks] of Object.entries(layouts as Record<string, unknown>).slice(0, MAX_ROLES)) {
    if (!Array.isArray(blocks)) return json({ error: "invalid_blocks" }, 400);
    const key = String(r).slice(0, MAX_KEY_LEN);
    if (!key) continue;
    const seen = new Set<string>();
    const list: string[] = [];
    for (const b of blocks) {
      if (typeof b !== "string") continue;
      const v = b.slice(0, MAX_KEY_LEN);
      if (!v || seen.has(v)) continue;
      seen.add(v);
      list.push(v);
      if (list.length >= MAX_BLOCKS) break;
    }
    clean[key] = list;
  }

  await tursoExec(
    env,
    `INSERT INTO workspace_settings (workspace_id, key, value, updated_at)
       VALUES (?, '${HOME_LAYOUTS_KEY}', ?, datetime('now'))
     ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [workspaceId, JSON.stringify(clean)],
  );
  return json({ ok: true });
}
