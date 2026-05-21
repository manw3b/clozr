/**
 * Workspaces — CRUD + memberships management.
 *
 * Routes:
 *   POST   /workspaces                       crear (cualquier user logueado)
 *   GET    /workspaces/:id/members           listar (owner|admin del workspace)
 *   POST   /workspaces/:id/invite            invitar email + role (owner|admin)
 *   PATCH  /workspaces/:id/members/:mid      cambiar rol (owner|admin)
 *   DELETE /workspaces/:id/members/:mid      expulsar (owner|admin)
 *
 * Reglas de permisos clave:
 *   - El owner NO se puede auto-expulsar (debe transferir antes).
 *   - PATCH para hacer owner a otro: requiere ser owner (no admin).
 *   - PATCH del propio rol: prohibido (siempre).
 *   - DELETE/PATCH al owner activo: prohibido (excepto otro owner).
 *
 * Las rutas son dispatchadas desde index.ts haciendo path-match manual
 * (no usamos router framework por ahora — el worker es chico).
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { requireAuth, type AuthClaims } from "../auth";
import { tursoExec, tursoFirst, tursoQuery, type Row } from "../turso";
import { sendInviteEmail } from "../email";

/* ── POST /workspaces ────────────────────────────────────────────────── */

interface CreateBody { name?: unknown; }

export async function handleCreateWorkspace(req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  let body: CreateBody;
  try { body = (await req.json()) as CreateBody; } catch { return json({ error: "invalid_body" }, 400); }
  if (typeof body.name !== "string" || !body.name.trim()) return json({ error: "missing_name" }, 400);

  const name = body.name.trim().slice(0, 80);
  const workspaceId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();

  await tursoQuery(
    env,
    {
      sql: `INSERT INTO cloud_workspaces (id, name, owner_user_id) VALUES (?, ?, ?)`,
      args: [workspaceId, name, auth.userId],
    },
    {
      sql: `INSERT INTO memberships (id, workspace_id, user_id, email, role, status, accepted_at, invited_by_user_id)
            VALUES (?, ?, ?, ?, 'owner', 'active', datetime('now'), ?)`,
      args: [membershipId, workspaceId, auth.userId, auth.email, auth.userId],
    },
  );

  return json({ id: workspaceId, name, role: "owner", status: "active" }, 201);
}

/* ── helpers comunes ─────────────────────────────────────────────────── */

/**
 * Devuelve la membership ACTIVA del current user en el workspace, o null
 * si no es miembro. Lo usamos como gate antes de cualquier op sobre el
 * workspace.
 */
async function membership(env: Env, workspaceId: string, userId: string): Promise<Row | null> {
  return tursoFirst(
    env,
    `SELECT id, role, status FROM memberships
       WHERE workspace_id = ? AND user_id = ? AND status = 'active'`,
    [workspaceId, userId],
  );
}

function canManageTeam(role: string): boolean {
  return role === "owner" || role === "admin";
}

/* ── GET /workspaces/:id/members ─────────────────────────────────────── */

export async function handleListMembers(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const me = await membership(env, workspaceId, auth.userId);
  if (!me) return json({ error: "not_a_member" }, 403);

  const [rows] = await tursoQuery(env, {
    sql: `SELECT m.id, m.email, m.role, m.status, m.invited_at, m.accepted_at,
                 u.name AS user_name
            FROM memberships m
            LEFT JOIN users u ON u.id = m.user_id
            WHERE m.workspace_id = ? AND m.status != 'revoked'
            ORDER BY
              CASE m.role
                WHEN 'owner' THEN 0
                WHEN 'admin' THEN 1
                WHEN 'vendedor' THEN 2
                ELSE 3
              END,
              m.invited_at ASC`,
    args: [workspaceId],
  });
  return json({ members: rows ?? [] });
}

/* ── POST /workspaces/:id/invite ─────────────────────────────────────── */

interface InviteBody { email?: unknown; role?: unknown; }
const VALID_ROLES = new Set(["admin", "vendedor", "viewer"]);

export async function handleInviteMember(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const me = await membership(env, workspaceId, auth.userId);
  if (!me) return json({ error: "not_a_member" }, 403);
  if (!canManageTeam(String(me.role))) return json({ error: "forbidden" }, 403);

  let body: InviteBody;
  try { body = (await req.json()) as InviteBody; } catch { return json({ error: "invalid_body" }, 400); }
  if (typeof body.email !== "string") return json({ error: "missing_email" }, 400);
  if (typeof body.role !== "string" || !VALID_ROLES.has(body.role)) return json({ error: "invalid_role" }, 400);

  const email = body.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid_email" }, 400);

  // Si ya existe membership activa o pendiente para este email en este
  // workspace, rechazar. La UI debería decirle "ya está invitado".
  const existing = await tursoFirst(
    env,
    `SELECT id, status FROM memberships
       WHERE workspace_id = ? AND email = ? AND status != 'revoked'`,
    [workspaceId, email],
  );
  if (existing) return json({ error: "already_member", status: existing.status }, 409);

  // Si el email ya es un user existente, lo linkeamos (status active
  // directo). Si no, queda con user_id NULL y status='invited' — al
  // primer login va a auto-activarse via /me.
  const existingUser = await tursoFirst(env, `SELECT id FROM users WHERE email = ?`, [email]);
  const linkedUserId = existingUser ? String(existingUser.id) : null;
  const status = linkedUserId ? "active" : "invited";

  const membershipId = crypto.randomUUID();
  await tursoExec(
    env,
    `INSERT INTO memberships
       (id, workspace_id, user_id, email, role, status, invited_by_user_id, accepted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      membershipId,
      workspaceId,
      linkedUserId,
      email,
      body.role,
      status,
      auth.userId,
      status === "active" ? new Date().toISOString() : null,
    ],
  );

  // Cargar workspace name + inviter name para el email.
  const ws = await tursoFirst(env, `SELECT name FROM cloud_workspaces WHERE id = ?`, [workspaceId]);
  await sendInviteEmail({
    to: email,
    workspaceName: ws ? String(ws.name) : "tu equipo",
    inviterEmail: auth.email,
    role: body.role,
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM,
  }).catch((e) => {
    // Best-effort: si el email falla, la membership ya está en DB. El
    // user puede pedir magic link manualmente y va a aparecer su invite.
    // eslint-disable-next-line no-console
    console.warn("[invite] email failed (membership creado igual):", e);
  });

  return json({ id: membershipId, email, role: body.role, status }, 201);
}

/* ── PATCH /workspaces/:id/members/:mid ──────────────────────────────── */

interface PatchBody { role?: unknown; }
const PATCHABLE_ROLES = new Set(["admin", "vendedor", "viewer", "owner"]);

export async function handlePatchMember(
  workspaceId: string,
  membershipId: string,
  req: Request,
  env: Env,
): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const me = await membership(env, workspaceId, auth.userId);
  if (!me) return json({ error: "not_a_member" }, 403);
  if (!canManageTeam(String(me.role))) return json({ error: "forbidden" }, 403);

  let body: PatchBody;
  try { body = (await req.json()) as PatchBody; } catch { return json({ error: "invalid_body" }, 400); }
  if (typeof body.role !== "string" || !PATCHABLE_ROLES.has(body.role)) return json({ error: "invalid_role" }, 400);

  // Solo owner puede crear otros owner. Admin no puede promover a owner.
  if (body.role === "owner" && me.role !== "owner") return json({ error: "only_owner_can_promote_to_owner" }, 403);

  // Cargar la membership a modificar.
  const target = await tursoFirst(
    env,
    `SELECT id, role, status, user_id FROM memberships
       WHERE id = ? AND workspace_id = ? AND status != 'revoked'`,
    [membershipId, workspaceId],
  );
  if (!target) return json({ error: "not_found" }, 404);

  // No te podés auto-modificar (evita degradarte y romper el workspace).
  if (target.user_id === auth.userId) return json({ error: "cant_modify_self" }, 400);

  // Si el target es owner y lo querés degradar, requiere otro owner activo
  // en el workspace (no podemos quedarnos sin owner).
  if (target.role === "owner" && body.role !== "owner") {
    const ownerCount = await tursoFirst(
      env,
      `SELECT COUNT(*) AS n FROM memberships
         WHERE workspace_id = ? AND role = 'owner' AND status = 'active' AND id != ?`,
      [workspaceId, membershipId],
    );
    if (!ownerCount || Number(ownerCount.n) < 1) {
      return json({ error: "workspace_needs_one_owner" }, 400);
    }
  }

  await tursoExec(
    env,
    `UPDATE memberships SET role = ? WHERE id = ?`,
    [body.role, membershipId],
  );
  return json({ ok: true, id: membershipId, role: body.role });
}

/* ── DELETE /workspaces/:id/members/:mid ─────────────────────────────── */

export async function handleRevokeMember(
  workspaceId: string,
  membershipId: string,
  req: Request,
  env: Env,
): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const me = await membership(env, workspaceId, auth.userId);
  if (!me) return json({ error: "not_a_member" }, 403);
  if (!canManageTeam(String(me.role))) return json({ error: "forbidden" }, 403);

  const target = await tursoFirst(
    env,
    `SELECT id, role, status, user_id FROM memberships
       WHERE id = ? AND workspace_id = ? AND status != 'revoked'`,
    [membershipId, workspaceId],
  );
  if (!target) return json({ error: "not_found" }, 404);
  if (target.user_id === auth.userId) return json({ error: "cant_revoke_self" }, 400);
  if (target.role === "owner") {
    // No podemos revocar al último owner. (Si quisiera salirse, primero
    // promueve a alguien a owner y después lo hace.)
    const ownerCount = await tursoFirst(
      env,
      `SELECT COUNT(*) AS n FROM memberships
         WHERE workspace_id = ? AND role = 'owner' AND status = 'active' AND id != ?`,
      [workspaceId, membershipId],
    );
    if (!ownerCount || Number(ownerCount.n) < 1) {
      return json({ error: "workspace_needs_one_owner" }, 400);
    }
  }

  await tursoExec(
    env,
    `UPDATE memberships SET status = 'revoked', revoked_at = datetime('now') WHERE id = ?`,
    [membershipId],
  );
  return json({ ok: true, id: membershipId });
}

/* ── json helper ─────────────────────────────────────────────────────── */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
