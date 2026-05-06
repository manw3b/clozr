import { dbSelect, dbExecute } from "./index";
import type { MemberRole } from "./types";

/**
 * Auth local por PIN. Es desktop single-device — el PIN no protege contra
 * acceso a la DB SQLite, pero sí previene que un vendedor abra la sesión
 * del owner sin permiso. Hash con SHA-256(pin + userId) vía WebCrypto;
 * userId hace de salt natural (UUID por usuario).
 */

export interface LoginMember {
  user_id: string;
  name: string;
  email: string;
  role: MemberRole;
  avatar_color: string | null;
  has_pin: boolean;
  last_login_at: string | null;
}

async function hashPin(userId: string, pin: string): Promise<string> {
  const enc = new TextEncoder().encode(`${userId}::${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Lista miembros del workspace con flag has_pin para la pantalla de login. */
export async function listLoginMembers(workspaceId: string): Promise<LoginMember[]> {
  const rows = await dbSelect<{
    user_id: string;
    name: string;
    email: string;
    role: string;
    avatar_color: string | null;
    pin_hash: string | null;
    last_login_at: string | null;
  }>(
    `SELECT wm.user_id, wm.role, u.name, u.email, u.avatar_color, u.pin_hash, u.last_login_at
     FROM workspace_members wm
     JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = ?
     ORDER BY
       CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'vendedor' THEN 2 ELSE 3 END,
       u.name ASC`,
    [workspaceId],
  );
  return rows.map((r) => ({
    user_id: r.user_id,
    name: r.name,
    email: r.email,
    role: r.role as MemberRole,
    avatar_color: r.avatar_color,
    has_pin: !!r.pin_hash,
    last_login_at: r.last_login_at,
  }));
}

/** Verifica el PIN. Si match, marca last_login_at y retorna el rol/nombre. */
export async function login(
  userId: string,
  pin: string,
): Promise<{ name: string; role: MemberRole; workspace_id: string } | null> {
  const rows = await dbSelect<{
    name: string;
    pin_hash: string | null;
    role: string;
    workspace_id: string;
  }>(
    `SELECT u.name, u.pin_hash, wm.role, wm.workspace_id
     FROM users u
     JOIN workspace_members wm ON wm.user_id = u.id
     WHERE u.id = ?
     LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.pin_hash) {
    const expected = await hashPin(userId, pin);
    if (expected !== row.pin_hash) return null;
  }
  await dbExecute(`UPDATE users SET last_login_at = ? WHERE id = ?`, [
    new Date().toISOString(),
    userId,
  ]);
  return { name: row.name, role: row.role as MemberRole, workspace_id: row.workspace_id };
}

/** Ingreso sin PIN (sólo válido si el user no tiene pin_hash). */
export async function loginWithoutPin(userId: string) {
  return login(userId, "");
}

export async function setPin(userId: string, pin: string): Promise<void> {
  if (!/^\d{4,6}$/.test(pin)) {
    throw new Error("El PIN debe tener entre 4 y 6 dígitos.");
  }
  const hash = await hashPin(userId, pin);
  await dbExecute(`UPDATE users SET pin_hash = ? WHERE id = ?`, [hash, userId]);
}

export async function clearPin(userId: string): Promise<void> {
  await dbExecute(`UPDATE users SET pin_hash = NULL WHERE id = ?`, [userId]);
}

export async function hasPin(userId: string): Promise<boolean> {
  const rows = await dbSelect<{ pin_hash: string | null }>(
    `SELECT pin_hash FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  return !!rows[0]?.pin_hash;
}

export const authDb = {
  listLoginMembers,
  login,
  loginWithoutPin,
  setPin,
  clearPin,
  hasPin,
};
