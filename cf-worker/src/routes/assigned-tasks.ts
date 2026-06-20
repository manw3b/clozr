/**
 * Assigned task templates (G/A1) — la versión cloud de assigned_task_templates.
 *
 * Routes:
 *   GET    /workspaces/:wid/assigned-task-templates
 *   POST   /workspaces/:wid/assigned-task-templates
 *   PATCH  /workspaces/:wid/assigned-task-templates/:id
 *   DELETE /workspaces/:wid/assigned-task-templates/:id   (soft-delete)
 *
 * Permisos:
 *   - read = todos los miembros activos (el vendedor necesita verlos para
 *     materializarlos)
 *   - create/edit/delete = owner|admin (manage_assigned_tasks)
 *
 * Ver src/lib/db/assignedTasks.ts para la lógica de materialización del
 * cliente — esta API solo expone los templates; la materialización
 * `tasks` ya vive en R4 (cloud).
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoQuery, type TursoArg } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";
import { requirePerm } from "../permissions";

const ROLES_READ = new Set(["owner", "admin", "vendedor", "viewer"]);

const EDITABLE = [
  "title", "description", "frequency", "target_time", "target_count",
  "assigned_to_user_id",
] as const;

function pick(input: Record<string, unknown>): Record<string, TursoArg> {
  const out: Record<string, TursoArg> = {};
  for (const k of EDITABLE) {
    if (k in input) {
      const v = input[k];
      out[k] = v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? v : null;
    }
  }
  return out;
}

export async function handleListAssignedTaskTemplates(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role || !ROLES_READ.has(role)) return json({ error: "forbidden" }, 403);

  const [rows] = await tursoQuery(env, {
    sql: `SELECT * FROM assigned_task_templates
            WHERE workspace_id = ? AND deleted_at IS NULL
            ORDER BY created_at ASC`,
    args: [workspaceId],
  });
  return json({ items: rows ?? [] });
}

export async function handleCreateAssignedTaskTemplate(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  {
    const denied = requirePerm(role, "settings.manage");
    if (denied) return denied;
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }

  if (typeof body.title !== "string" || !body.title.trim()) {
    return json({ error: "missing_title" }, 400);
  }

  const id = typeof body.id === "string" && body.id ? body.id : crypto.randomUUID();
  const fields = pick(body);
  const cols = ["id", "workspace_id", "created_by", ...Object.keys(fields)];
  const vals: TursoArg[] = [id, workspaceId, auth.userId, ...Object.values(fields)];

  try {
    await tursoExec(
      env,
      `INSERT INTO assigned_task_templates (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
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

export async function handleUpdateAssignedTaskTemplate(workspaceId: string, templateId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  {
    const denied = requirePerm(role, "settings.manage");
    if (denied) return denied;
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }

  const fields = pick(body);
  if (Object.keys(fields).length === 0) return json({ error: "no_fields" }, 400);

  const setSql = Object.keys(fields).map((c) => `${c} = ?`).concat(["updated_at = datetime('now')"]).join(", ");
  await tursoExec(
    env,
    `UPDATE assigned_task_templates SET ${setSql}
       WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    [...Object.values(fields), templateId, workspaceId],
  );
  return json({ ok: true });
}

export async function handleDeleteAssignedTaskTemplate(workspaceId: string, templateId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  {
    const denied = requirePerm(role, "settings.manage");
    if (denied) return denied;
  }

  await tursoExec(
    env,
    `UPDATE assigned_task_templates SET deleted_at = datetime('now')
       WHERE id = ? AND workspace_id = ?`,
    [templateId, workspaceId],
  );
  return json({ ok: true });
}
