import { dbSelect, dbExecute } from "./index";

export interface CashDaySession {
  id: string;
  workspace_id: string;
  business_id: string;
  session_date: string;
  opened_at: string;
  opened_balance_ars: number;
  opened_balance_usd: number;
  opened_by_user_id: string | null;
  closed_at: string | null;
  closed_balance_ars: number | null;
  closed_balance_usd: number | null;
  closed_by_user_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Devuelve la sesión del día (si existe) para el negocio activo. */
export async function getForDay(
  workspaceId: string,
  businessId: string,
  date: string,
): Promise<CashDaySession | null> {
  const rows = await dbSelect<CashDaySession>(
    `SELECT * FROM cash_day_sessions
     WHERE workspace_id = ? AND business_id = ? AND session_date = ?
     LIMIT 1`,
    [workspaceId, businessId, date],
  );
  return rows[0] ?? null;
}

/** Abre una nueva sesión de caja con los balances iniciales. */
export async function open(
  workspaceId: string,
  businessId: string,
  date: string,
  input: {
    opened_balance_ars?: number;
    opened_balance_usd?: number;
    opened_by_user_id?: string | null;
    notes?: string | null;
  } = {},
): Promise<CashDaySession> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const arsOpening = input.opened_balance_ars ?? 0;
  const usdOpening = input.opened_balance_usd ?? 0;

  await dbExecute(
    `INSERT INTO cash_day_sessions
       (id, workspace_id, business_id, session_date, opened_at,
        opened_balance_ars, opened_balance_usd, opened_by_user_id,
        notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      businessId,
      date,
      now,
      arsOpening,
      usdOpening,
      input.opened_by_user_id ?? null,
      input.notes ?? null,
      now,
      now,
    ],
  );

  return {
    id,
    workspace_id: workspaceId,
    business_id: businessId,
    session_date: date,
    opened_at: now,
    opened_balance_ars: arsOpening,
    opened_balance_usd: usdOpening,
    opened_by_user_id: input.opened_by_user_id ?? null,
    closed_at: null,
    closed_balance_ars: null,
    closed_balance_usd: null,
    closed_by_user_id: null,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
  };
}

/** Cierra la sesión registrando el balance final. */
export async function close(
  sessionId: string,
  input: {
    closed_balance_ars: number;
    closed_balance_usd: number;
    closed_by_user_id?: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await dbExecute(
    `UPDATE cash_day_sessions
     SET closed_at = ?, closed_balance_ars = ?, closed_balance_usd = ?,
         closed_by_user_id = ?, updated_at = ?
     WHERE id = ?`,
    [
      now,
      input.closed_balance_ars,
      input.closed_balance_usd,
      input.closed_by_user_id ?? null,
      now,
      sessionId,
    ],
  );
}

/** Garantiza que exista una sesión hoy. Si no hay, abre una con balances en 0.
 *  Si la tabla no existe (migración no aplicada), devuelve una sesión "fantasma"
 *  con balances en 0 — Caja sigue funcionando aunque sin opening real. */
export async function ensureForDay(
  workspaceId: string,
  businessId: string,
  date: string,
): Promise<CashDaySession> {
  try {
    const existing = await getForDay(workspaceId, businessId, date);
    if (existing) return existing;
    return await open(workspaceId, businessId, date);
  } catch {
    const now = new Date().toISOString();
    return {
      id: "ghost-session",
      workspace_id: workspaceId,
      business_id: businessId,
      session_date: date,
      opened_at: now,
      opened_balance_ars: 0,
      opened_balance_usd: 0,
      opened_by_user_id: null,
      closed_at: null,
      closed_balance_ars: null,
      closed_balance_usd: null,
      closed_by_user_id: null,
      notes: null,
      created_at: now,
      updated_at: now,
    };
  }
}

export const cashSessionsDb = {
  getForDay,
  open,
  close,
  ensureForDay,
};
