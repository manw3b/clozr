/**
 * POST /auth/verify-code
 *
 * Body: { email, code }
 *
 * Alternativa al GET /auth/verify (que consume el token vía link). Útil
 * para el caso "abrí el email en el celular, quiero loguearme en la PC":
 * el user lee los 6 dígitos del email y los escribe en la app.
 *
 * Validamos: (email, code) existe en magic_links, no usado, no expirado.
 * Marcamos used_at (mismo flag que verify por link — un magic_link es
 * one-shot total, no importa la vía). Devolvemos JWT en JSON.
 *
 * Rate limiting: no implementado todavía. Con 6 dígitos y TTL 15 min,
 * brute force es 1M intentos / 900 seg = 1100 req/seg sostenidas. Realista
 * desde un atacante: bajo. Lo agregamos cuando tengamos KV/D1 con counters.
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { tursoExec, tursoFirst, tursoQuery } from "../turso";
import { signJwt } from "../jwt";

interface VerifyCodeBody {
  email?: unknown;
  code?: unknown;
}

export async function handleAuthVerifyCode(req: Request, env: Env): Promise<Response> {
  let body: VerifyCodeBody;
  try {
    body = (await req.json()) as VerifyCodeBody;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  if (typeof body.email !== "string" || typeof body.code !== "string") {
    return json({ error: "missing_fields" }, 400);
  }
  const email = body.email.trim().toLowerCase();
  // Normalizamos el código: el user puede pegarlo con espacios ("123 456"),
  // guiones ("123-456"), etc. Lo dejamos solo en dígitos.
  const code = body.code.replace(/\D/g, "");
  if (code.length !== 6) {
    return json({ error: "invalid_code_format" }, 400);
  }

  await ensureSchema(env);

  // Lookup por (email, code). Tomamos el más reciente — si el user pidió
  // varios links seguidos, solo el último vale.
  const link = await tursoFirst(
    env,
    `SELECT token, email, expires_at, used_at FROM magic_links
       WHERE email = ? AND code = ?
       ORDER BY created_at DESC LIMIT 1`,
    [email, code],
  );

  if (!link) return json({ error: "invalid_code" }, 401);
  if (link.used_at) return json({ error: "already_used" }, 401);
  const exp = typeof link.expires_at === "string" ? Date.parse(link.expires_at) : NaN;
  if (!exp || exp < Date.now()) return json({ error: "expired" }, 401);

  // Marcar usado ANTES de crear session, mismo patrón que verify por link.
  await tursoExec(
    env,
    `UPDATE magic_links SET used_at = datetime('now') WHERE token = ?`,
    [String(link.token)],
  );

  // Get-or-create user
  const userId = await getOrCreateUser(env, email);

  // Create session
  const sessionId = crypto.randomUUID();
  const sessionTtlDays = Number(env.SESSION_TTL_DAYS) || 30;
  const sessionExp = new Date(Date.now() + sessionTtlDays * 86_400_000);

  await tursoExec(
    env,
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
    [sessionId, userId, sessionExp.toISOString()],
  );

  // Sign JWT (mismo shape que verify por link).
  const jwt = await signJwt(
    {
      sub: sessionId,
      uid: userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(sessionExp.getTime() / 1000),
    },
    env.JWT_SECRET,
  );

  return json({ ok: true, jwt, email, userId, sessionId, expiresAt: Math.floor(sessionExp.getTime() / 1000) });
}

async function getOrCreateUser(env: Env, email: string): Promise<string> {
  const existing = await tursoFirst(env, `SELECT id FROM users WHERE email = ?`, [email]);
  if (existing) return String(existing.id);

  const id = crypto.randomUUID();
  await tursoQuery(env, {
    sql: `INSERT INTO users (id, email) VALUES (?, ?)`,
    args: [id, email],
  });
  return id;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
