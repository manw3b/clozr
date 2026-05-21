/**
 * GET /me
 *
 * Header: Authorization: Bearer <jwt>
 *
 * Devuelve la identidad + workspaces del user. Lo llama el frontend
 * justo después del login (verify-code o deep link) para hidratar
 * cloudAuthStore con info de roles.
 *
 * Side effect importante: si encontramos memberships con status='invited'
 * y email matchea el del JWT, las auto-activamos. Es como decir "ahora
 * que te conectaste por primera vez, te incorporo a los workspaces a
 * los que te habían invitado".
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoQuery } from "../turso";

interface WorkspaceForUser {
  id: string;
  name: string;
  role: string;
  status: string;
}

interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  workspaces: WorkspaceForUser[];
}

export async function handleMe(req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);

  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  // 1. Auto-activar invitaciones pendientes por email.
  //    Una persona puede haber sido invitada antes de tener cuenta;
  //    al loguearse por primera vez, su email matchea esas memberships
  //    pero user_id sigue NULL. Lo corregimos acá.
  await tursoExec(
    env,
    `UPDATE memberships
       SET user_id = ?, status = 'active', accepted_at = datetime('now')
       WHERE email = ? AND user_id IS NULL AND status = 'invited'`,
    [auth.userId, auth.email],
  );

  // 2. Cargar user + workspaces en una sola pipeline (2 stmts).
  const [userRows, wsRows] = await tursoQuery(
    env,
    {
      sql: `SELECT id, email, name FROM users WHERE id = ?`,
      args: [auth.userId],
    },
    {
      sql: `SELECT w.id, w.name, m.role, m.status
              FROM memberships m
              INNER JOIN cloud_workspaces w ON w.id = m.workspace_id
              WHERE m.user_id = ? AND m.status = 'active'
              ORDER BY w.created_at ASC`,
      args: [auth.userId],
    },
  );

  const userRow = userRows?.[0];
  if (!userRow) return json({ error: "user_not_found" }, 404);

  const body: MeResponse = {
    user: {
      id: String(userRow.id),
      email: String(userRow.email),
      name: userRow.name === null ? null : String(userRow.name),
    },
    workspaces: (wsRows ?? []).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      role: String(r.role),
      status: String(r.status),
    })),
  };
  return json(body);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
