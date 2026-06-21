/**
 * Sesiones de caja (apertura/cierre diario + arqueo).
 *
 *   GET    /workspaces/:wid/cash-sessions            → lista (más reciente primero)
 *   POST   /workspaces/:wid/cash-sessions/open       → abre la caja del día (idempotente)
 *   POST   /workspaces/:wid/cash-sessions/:sid/close → cierra la caja (arqueo)
 *
 * El arqueo (esperado vs contado, diferencia) lo calcula la UI a partir de los
 * cash_movements del día; acá sólo persistimos los saldos de apertura y de
 * cierre por moneda. Una sesión por día por workspace.
 *
 * Permisos: leer = todos los roles; abrir/cerrar = staff (owner/admin/vendedor),
 * consistente con crear un cash_movement.
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { requireAuth } from "../auth";
import { tursoQuery, tursoExec, tursoFirst } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";
import { requirePerm } from "../permissions";

// Caja restringida a managers (decisión de producto): el vendedor no ve los
// totales/sesiones de caja del negocio. Apertura/cierre siguen gateados por
// cash.write más abajo.
const CAJA_READ_ROLES = new Set(["owner", "admin"]);

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function handleListCashSessions(wsId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, wsId, auth.userId);
  if (!role || !CAJA_READ_ROLES.has(role)) return json({ error: "forbidden" }, 403);

  const [rows] = await tursoQuery(env, {
    sql: `SELECT * FROM cash_sessions
            WHERE workspace_id = ? AND deleted_at IS NULL
            ORDER BY session_date DESC, opened_at DESC`,
    args: [wsId],
  });
  return json({ items: rows ?? [] });
}

export async function handleOpenCashSession(wsId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, wsId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "cash.write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const sessionDate =
    typeof body.session_date === "string" && body.session_date.trim()
      ? body.session_date.trim()
      : null;
  if (!sessionDate) return json({ error: "missing_session_date" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return json({ error: "invalid_session_date" }, 400);
  }

  // Idempotente: si ya hay una sesión (no borrada) para ese día, la devolvemos.
  const existing = await tursoFirst(
    env,
    `SELECT * FROM cash_sessions
       WHERE workspace_id = ? AND session_date = ? AND deleted_at IS NULL
       LIMIT 1`,
    [wsId, sessionDate],
  );
  if (existing) return json({ session: existing }, 200);

  const id = crypto.randomUUID();
  const openedArs = num(body.opened_balance_ars);
  const openedUsd = num(body.opened_balance_usd);
  const notes = typeof body.notes === "string" ? body.notes : null;

  try {
    await tursoExec(
      env,
      `INSERT INTO cash_sessions
         (id, workspace_id, session_date, opened_balance_ars, opened_balance_usd, opened_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, wsId, sessionDate, openedArs, openedUsd, auth.userId, notes],
    );
  } catch (e) {
    // Race: otra request creó la sesión en paralelo (unique index) → devolvemos la existente.
    const msg = e instanceof Error ? e.message.toLowerCase() : String(e);
    if (msg.includes("unique")) {
      const row = await tursoFirst(
        env,
        `SELECT * FROM cash_sessions
           WHERE workspace_id = ? AND session_date = ? AND deleted_at IS NULL
           LIMIT 1`,
        [wsId, sessionDate],
      );
      if (row) return json({ session: row }, 200);
    }
    throw e;
  }

  const created = await tursoFirst(env, `SELECT * FROM cash_sessions WHERE id = ?`, [id]);
  return json({ session: created }, 201);
}

export async function handleCloseCashSession(
  wsId: string,
  sid: string,
  req: Request,
  env: Env,
): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, wsId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "cash.write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const session = await tursoFirst(
    env,
    `SELECT * FROM cash_sessions
       WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL
       LIMIT 1`,
    [sid, wsId],
  );
  if (!session) return json({ error: "not_found" }, 404);
  if (session.closed_at) return json({ error: "already_closed" }, 409);

  const closedArs = num(body.closed_balance_ars);
  const closedUsd = num(body.closed_balance_usd);

  // closed_at lo fija el SERVER (no confiamos en el reloj del cliente).
  // El `AND closed_at IS NULL` hace el cierre ATÓMICO: si dos requests cierran
  // a la vez (doble-click), SQLite serializa los writes y el segundo UPDATE no
  // matchea (closed_at ya seteado) → no-op, no pisa el arqueo del primero.
  await tursoExec(
    env,
    `UPDATE cash_sessions
       SET closed_at = datetime('now'),
           closed_balance_ars = ?, closed_balance_usd = ?,
           closed_by = ?, updated_at = datetime('now')
       WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL AND closed_at IS NULL`,
    [closedArs, closedUsd, auth.userId, sid, wsId],
  );

  const updated = await tursoFirst(env, `SELECT * FROM cash_sessions WHERE id = ?`, [sid]);
  return json({ session: updated }, 200);
}
