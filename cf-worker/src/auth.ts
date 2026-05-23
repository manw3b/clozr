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

/**
 * Cache in-memory (per-isolate) de sessions verificadas (D1). El polling
 * cloud de cada cliente pega ~12 endpoints/min × 5s = una requestada
 * fuerte de auth-checks. Sin cache, cada uno hacía 1 SELECT a Turso —
 * para 3 PCs activas eso es ~4800 SELECT/h solo de auth.
 *
 * Con TTL 30s: si la session es revocada (logout u expulsion), el
 * cliente puede seguir siendo válido hasta 30s. Aceptable porque:
 *   1. Tras el revoke, la próxima poll-tick (5s) ya pega con un
 *      cleared session y termina en 401 → auto-logout.
 *   2. El cache se invalida explícitamente cuando lo notamos
 *      (clearSessionCache(sessionId)) — los handlers de logout o
 *      revoke pueden llamarlo si queremos invalidación inmediata.
 *
 * Negative cache: cuando la session NO existe (revocada, deleted),
 * cacheamos `null` por 5s para evitar storming si alguien intenta
 * con un JWT muerto.
 */
interface CachedSession {
  email: string;
  expiresAt: number;
}
const sessionCache = new Map<string, CachedSession | null>();
const SESSION_TTL_MS = 30_000;
const NEGATIVE_TTL_MS = 5_000;

export function clearSessionCache(sessionId?: string): void {
  if (sessionId) sessionCache.delete(sessionId);
  else sessionCache.clear();
}

export async function requireAuth(req: Request, env: Env): Promise<AuthClaims | null> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload) return null;

  // Cache lookup. La key es sessionId (= payload.sub) — único por device.
  const cached = sessionCache.get(payload.sub);
  if (cached !== undefined) {
    if (cached === null) return null;
    if (cached.expiresAt > Date.now()) {
      return { userId: payload.uid, sessionId: payload.sub, email: cached.email };
    }
    // expirado — fallthrough a re-fetch
    sessionCache.delete(payload.sub);
  }

  const session = await tursoFirst(
    env,
    `SELECT s.id, s.revoked_at, u.email
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.user_id = ?`,
    [payload.sub, payload.uid],
  );

  if (!session || session.revoked_at) {
    // Negative cache — evita storming si un JWT muerto se sigue intentando.
    sessionCache.set(payload.sub, null);
    setTimeout(() => sessionCache.delete(payload.sub), NEGATIVE_TTL_MS);
    return null;
  }

  const email = String(session.email);
  sessionCache.set(payload.sub, { email, expiresAt: Date.now() + SESSION_TTL_MS });

  // GC paranoia: si el Map crece, limpiamos expirados.
  if (sessionCache.size > 2000) {
    const now = Date.now();
    for (const [k, v] of sessionCache) {
      if (v && v.expiresAt < now) sessionCache.delete(k);
    }
  }

  return { userId: payload.uid, sessionId: payload.sub, email };
}
