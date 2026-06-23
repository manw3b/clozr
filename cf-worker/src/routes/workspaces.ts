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
import { ensureSchema, ensureWorkspaceColumns, ensureJoinCodesSchema } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoFirst, tursoQuery, type Row, type TursoArg } from "../turso";
import { sendInviteEmail } from "../email";
import { requirePermWs, getCustomRoleIds } from "../permissionsWs";

/* ── POST /workspaces ────────────────────────────────────────────────── */

interface CreateBody { name?: unknown; }

export async function handleCreateWorkspace(req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureJoinCodesSchema(env); // garantiza memberships.source
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
      sql: `INSERT INTO memberships (id, workspace_id, user_id, email, role, status, accepted_at, invited_by_user_id, source)
            VALUES (?, ?, ?, ?, 'owner', 'active', datetime('now'), ?, 'owner')`,
      args: [membershipId, workspaceId, auth.userId, auth.email, auth.userId],
    },
  );

  // Plan por defecto (T3): free / 1 asiento / active (column defaults).
  return json(
    { id: workspaceId, name, role: "owner", status: "active", plan: "free", seats: 1, plan_status: "active" },
    201,
  );
}

/* ── PATCH /workspaces/:wid ───────────────────────────────────────────── */
/**
 * Editar el workspace activo. Solo owner/admin del workspace. Campos
 * editables: name, industry, daily_goal, daily_goal_currency,
 * daily_goal_count. (Otros campos del schema están fuera de scope —
 * created_at no se edita, owner_user_id requiere flow separado).
 */
const WS_EDITABLE = ["name", "industry", "icon", "daily_goal", "daily_goal_currency", "daily_goal_count", "address"] as const;

export async function handleUpdateWorkspace(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureWorkspaceColumns(env); // garantiza la columna icon
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const me = await membership(env, workspaceId, auth.userId);
  if (!me) return json({ error: "not_a_member" }, 403);
  const denied = await requirePermWs(env, workspaceId, String(me.role), "settings.manage");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }

  const fields: Record<string, TursoArg> = {};
  for (const k of WS_EDITABLE) {
    if (k in body) {
      const v = body[k];
      if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        fields[k] = v;
      }
    }
  }
  if (Object.keys(fields).length === 0) return json({ error: "no_fields" }, 400);

  const setSql = Object.keys(fields).map((c) => `${c} = ?`).join(", ");
  await tursoExec(
    env,
    `UPDATE cloud_workspaces SET ${setSql} WHERE id = ?`,
    [...Object.values(fields), workspaceId],
  );
  return json({ ok: true });
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

/* ── GET /workspaces/:id/members ─────────────────────────────────────── */

export async function handleListMembers(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureJoinCodesSchema(env); // garantiza memberships.source
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const me = await membership(env, workspaceId, auth.userId);
  if (!me) return json({ error: "not_a_member" }, 403);

  const [rows] = await tursoQuery(env, {
    sql: `SELECT m.id, m.user_id, m.email, m.role, m.status, m.invited_at, m.accepted_at, m.source,
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
  await ensureJoinCodesSchema(env); // garantiza memberships.source
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const me = await membership(env, workspaceId, auth.userId);
  if (!me) return json({ error: "not_a_member" }, 403);
  {
    const denied = await requirePermWs(env, workspaceId, String(me.role), "team.manage");
    if (denied) return denied;
  }

  let body: InviteBody;
  try { body = (await req.json()) as InviteBody; } catch { return json({ error: "invalid_body" }, 400); }
  if (typeof body.email !== "string") return json({ error: "missing_email" }, 400);
  if (typeof body.role !== "string") return json({ error: "invalid_role" }, 400);
  if (!VALID_ROLES.has(body.role) && !(await getCustomRoleIds(env, workspaceId)).has(body.role)) {
    return json({ error: "invalid_role" }, 400);
  }

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

  // T3: seat-gate. Miembros activos+invitados no pueden superar los asientos
  // del plan. Free = 1 (solo el owner) → invitar equipo requiere upgrade.
  // El front mapea `seat_limit` a un CTA de "mejorá tu plan".
  const usedRow = await tursoFirst(
    env,
    `SELECT COUNT(*) AS n FROM memberships
       WHERE workspace_id = ? AND status IN ('active', 'invited')`,
    [workspaceId],
  );
  const seatsRow = await tursoFirst(env, `SELECT seats FROM cloud_workspaces WHERE id = ?`, [workspaceId]);
  const used = usedRow ? Number(usedRow.n) : 0;
  const seats = seatsRow ? Number(seatsRow.seats ?? 1) : 1;
  if (used >= seats) return json({ error: "seat_limit", used, seats }, 402);

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
       (id, workspace_id, user_id, email, role, status, invited_by_user_id, accepted_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'invite')`,
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

  // Cargar workspace name para el email.
  const ws = await tursoFirst(env, `SELECT name FROM cloud_workspaces WHERE id = ?`, [workspaceId]);
  await sendInviteEmail({
    to: email,
    workspaceName: ws ? String(ws.name) : "tu equipo",
    role: body.role,
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM,
  }).catch((e) => {
    // Best-effort: si el email falla, la membership ya está en DB. El
    // user puede pedir magic link manualmente y va a aparecer su invite.
    console.warn("[invite] email failed (membership creado igual):", e);
  });

  return json({ id: membershipId, email, role: body.role, status }, 201);
}

/* ── POST /workspaces/:id/join-codes ─────────────────────────────────── */
// El dueño/encargado genera un código de la tienda. Cualquiera logueado que lo
// canjee (POST /join) entra como empleado con el rol del código. No expone
// emails ni requiere pre-cargar a la persona. Sólo un código activo por
// workspace (generar revoca los anteriores).

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin O/0/I/1
function genJoinCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 8; i++) out += JOIN_CODE_ALPHABET[bytes[i]! % JOIN_CODE_ALPHABET.length];
  return out;
}

interface JoinCodeBody { role?: unknown; expiresInDays?: unknown; }

export async function handleCreateJoinCode(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureJoinCodesSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const me = await membership(env, workspaceId, auth.userId);
  if (!me) return json({ error: "not_a_member" }, 403);
  {
    const denied = await requirePermWs(env, workspaceId, String(me.role), "team.manage");
    if (denied) return denied;
  }

  let body: JoinCodeBody = {};
  try { body = (await req.json()) as JoinCodeBody; } catch { /* body opcional */ }
  const role = typeof body.role === "string" && VALID_ROLES.has(body.role) ? body.role : "vendedor";
  const days = Math.min(30, Math.max(1, Math.round(Number(body.expiresInDays) || 7)));
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();

  // Un solo código activo por tienda: revocamos los anteriores.
  await tursoExec(
    env,
    `UPDATE workspace_join_codes SET revoked_at = datetime('now')
       WHERE workspace_id = ? AND revoked_at IS NULL`,
    [workspaceId],
  );

  // Código único (reintento ante colisión, muy improbable con 32^8).
  let code = genJoinCode();
  for (let i = 0; i < 4; i++) {
    const clash = await tursoFirst(env, `SELECT 1 AS x FROM workspace_join_codes WHERE code = ?`, [code]);
    if (!clash) break;
    code = genJoinCode();
  }

  await tursoExec(
    env,
    `INSERT INTO workspace_join_codes (id, workspace_id, code, role, created_by_user_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), workspaceId, code, role, auth.userId, expiresAt],
  );

  return json({ code, role, expiresAt }, 201);
}

/* ── GET /workspaces/:id/join-codes ──────────────────────────────────── */
// Código de tienda activo (no revocado, no vencido) o { code: null }.
export async function handleGetActiveJoinCode(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureJoinCodesSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const me = await membership(env, workspaceId, auth.userId);
  if (!me) return json({ error: "not_a_member" }, 403);
  {
    const denied = await requirePermWs(env, workspaceId, String(me.role), "team.manage");
    if (denied) return denied;
  }

  const row = await tursoFirst(
    env,
    `SELECT code, role, expires_at, uses, created_at
       FROM workspace_join_codes
       WHERE workspace_id = ? AND revoked_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
    [workspaceId, new Date().toISOString()],
  );
  if (!row) return json({ code: null });
  return json({
    code: String(row.code),
    role: String(row.role),
    expiresAt: String(row.expires_at),
    uses: Number(row.uses ?? 0),
    createdAt: row.created_at ? String(row.created_at) : null,
  });
}

/* ── DELETE /workspaces/:id/join-codes ───────────────────────────────── */
// Revoca el/los código(s) activo(s) de la tienda.
export async function handleRevokeJoinCodes(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureJoinCodesSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const me = await membership(env, workspaceId, auth.userId);
  if (!me) return json({ error: "not_a_member" }, 403);
  {
    const denied = await requirePermWs(env, workspaceId, String(me.role), "team.manage");
    if (denied) return denied;
  }

  await tursoExec(
    env,
    `UPDATE workspace_join_codes SET revoked_at = datetime('now')
       WHERE workspace_id = ? AND revoked_at IS NULL`,
    [workspaceId],
  );
  return json({ ok: true });
}

/* ── POST /join ──────────────────────────────────────────────────────── */
// Canje de un código de tienda por el usuario logueado. El código es la
// autorización para entrar: no hace falta que el dueño haya pre-cargado el
// email. Seat-gate del plan + expiración + revocación controlan el acceso.

interface RedeemBody { code?: unknown; }

export async function handleRedeemJoinCode(req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureJoinCodesSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  let body: RedeemBody;
  try { body = (await req.json()) as RedeemBody; } catch { return json({ error: "invalid_body" }, 400); }
  if (typeof body.code !== "string" || !body.code.trim()) return json({ error: "missing_code" }, 400);
  const code = body.code.trim().toUpperCase().replace(/\s+/g, "");

  const row = await tursoFirst(
    env,
    `SELECT id, workspace_id, role, expires_at, max_uses, uses
       FROM workspace_join_codes WHERE code = ? AND revoked_at IS NULL`,
    [code],
  );
  if (!row) return json({ error: "invalid_code" }, 404);
  if (String(row.expires_at) <= new Date().toISOString()) return json({ error: "expired" }, 410);
  const maxUses = row.max_uses == null ? null : Number(row.max_uses);
  if (maxUses != null && Number(row.uses) >= maxUses) return json({ error: "code_exhausted" }, 409);

  const workspaceId = String(row.workspace_id);
  const codeRole = String(row.role);

  const ws = await tursoFirst(env, `SELECT name FROM cloud_workspaces WHERE id = ?`, [workspaceId]);
  if (!ws) return json({ error: "invalid_code" }, 404);
  const workspaceName = String(ws.name);
  const email = auth.email.toLowerCase();

  // ¿Ya tiene una membership no revocada en esta tienda?
  const existing = await tursoFirst(
    env,
    `SELECT id, status, role FROM memberships
       WHERE workspace_id = ? AND email = ? AND status != 'revoked'`,
    [workspaceId, email],
  );
  if (existing) {
    if (String(existing.status) === "active") {
      // Ya es miembro: idempotente, devolvemos la tienda igual.
      return json({ workspaceId, workspaceName, role: String(existing.role ?? codeRole), already: true });
    }
    // Estaba 'invited' (el dueño pre-cargó el email): activamos y linkeamos user.
    await tursoExec(
      env,
      `UPDATE memberships SET status = 'active', user_id = ?, accepted_at = datetime('now')
         WHERE id = ?`,
      [auth.userId, String(existing.id)],
    );
    await tursoExec(env, `UPDATE workspace_join_codes SET uses = uses + 1 WHERE code = ?`, [code]);
    return json({ workspaceId, workspaceName, role: String(existing.role ?? codeRole) });
  }

  // Seat-gate: no superar los asientos del plan (activos + invitados).
  const usedRow = await tursoFirst(
    env,
    `SELECT COUNT(*) AS n FROM memberships WHERE workspace_id = ? AND status IN ('active', 'invited')`,
    [workspaceId],
  );
  const seatsRow = await tursoFirst(env, `SELECT seats FROM cloud_workspaces WHERE id = ?`, [workspaceId]);
  const used = usedRow ? Number(usedRow.n) : 0;
  const seats = seatsRow ? Number(seatsRow.seats ?? 1) : 1;
  if (used >= seats) return json({ error: "seat_limit", used, seats }, 402);

  await tursoExec(
    env,
    `INSERT INTO memberships
       (id, workspace_id, user_id, email, role, status, invited_by_user_id, accepted_at, source)
       VALUES (?, ?, ?, ?, ?, 'active', NULL, datetime('now'), 'code')`,
    [crypto.randomUUID(), workspaceId, auth.userId, email, codeRole],
  );
  await tursoExec(env, `UPDATE workspace_join_codes SET uses = uses + 1 WHERE code = ?`, [code]);

  return json({ workspaceId, workspaceName, role: codeRole });
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
  {
    const denied = await requirePermWs(env, workspaceId, String(me.role), "team.manage");
    if (denied) return denied;
  }

  let body: PatchBody;
  try { body = (await req.json()) as PatchBody; } catch { return json({ error: "invalid_body" }, 400); }
  if (typeof body.role !== "string") return json({ error: "invalid_role" }, 400);
  if (!PATCHABLE_ROLES.has(body.role) && !(await getCustomRoleIds(env, workspaceId)).has(body.role)) {
    return json({ error: "invalid_role" }, 400);
  }

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

/* ── POST /workspaces/:id/members/:mid/access-code ───────────────────── */

/**
 * Genera un magic_link manual para que el owner se lo pase al miembro
 * por fuera del email (WhatsApp, etc). Útil mientras Resend esté en
 * sandbox: el miembro nunca recibe el email automático, pero el owner
 * sí puede compartirle el código.
 *
 * El código generado es exactamente lo mismo que el flow normal de
 * /auth/request, solo que NO mandamos email. El miembro lo usa con
 * POST /auth/verify-code junto con su email — exact same endpoint
 * que el login normal.
 *
 * Permisos: owner|admin del workspace. Funciona tanto para memberships
 * status='invited' (primer login) como 'active' (re-login si perdió
 * sesión, abre en otra PC, o Resend sandbox no le mandó el email).
 * El email va atado a la membership — el código solo sirve para ese
 * email específico (porque verify-code busca por email + code juntos).
 *
 * Bloqueamos solo 'revoked' (miembro expulsado no merece código nuevo).
 */
export async function handleIssueAccessCode(
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
  {
    const denied = await requirePermWs(env, workspaceId, String(me.role), "team.manage");
    if (denied) return denied;
  }

  const target = await tursoFirst(
    env,
    `SELECT email, status FROM memberships
       WHERE id = ? AND workspace_id = ? AND status IN ('invited', 'active')`,
    [membershipId, workspaceId],
  );
  if (!target) return json({ error: "member_not_found" }, 404);

  // Generar magic_link como en /auth/request (mismo formato).
  const token = randomHex(32);
  const code = randomDigits(6);
  const ttlMin = Number(env.MAGIC_LINK_TTL_MIN) || 15;
  const expiresAt = new Date(Date.now() + ttlMin * 60_000).toISOString();

  await tursoExec(
    env,
    `INSERT INTO magic_links (token, email, expires_at, code) VALUES (?, ?, ?, ?)`,
    [token, String(target.email), expiresAt, code],
  );

  return json({
    ok: true,
    code,
    email: String(target.email),
    expiresInMin: ttlMin,
  });
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomDigits(n: number): string {
  let out = "";
  while (out.length < n) {
    const buf = new Uint8Array(n);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b >= 250) continue;
      out += String(b % 10);
      if (out.length === n) break;
    }
  }
  return out;
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
  {
    const denied = await requirePermWs(env, workspaceId, String(me.role), "team.manage");
    if (denied) return denied;
  }

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
