/**
 * requireAuth — middleware que valida el JWT del header Authorization
 * y devuelve los claims, o null si no es válido.
 *
 * Uso típico en una route:
 *
 *   const auth = await requireAuth(req, env);
 *   if (!auth) return json({ error: "unauthorized" }, 401);
 *   // acá ya tenés auth.userId y auth.sessionId
 *
 * Además, verifica que la session no esté revocada en DB. El JWT podría
 * estar vivo (exp futuro) pero la session puede haberse logout/revoke
 * desde otro device — la check final la hace la DB.
 */

import { verifyJwt } from "./jwt";
import { tursoFirst } from "./turso";
import type { Env } from "./index";

export interface AuthClaims {
  userId: string;
  sessionId: string;
  email: string;
}

export async function requireAuth(req: Request, env: Env): Promise<AuthClaims | null> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload) return null;

  // Defensa en profundidad: chequear que la session existe y no fue
  // revocada. Si performance se vuelve tema (1 query por request
  // autenticada), podemos cachear este check en KV de CF con TTL corto.
  const session = await tursoFirst(
    env,
    `SELECT s.id, s.revoked_at, u.email
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.user_id = ?`,
    [payload.sub, payload.uid],
  );
  if (!session) return null;
  if (session.revoked_at) return null;

  return {
    userId: payload.uid,
    sessionId: payload.sub,
    email: String(session.email),
  };
}
