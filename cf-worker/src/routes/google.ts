/**
 * Google OAuth (Authorization Code flow).
 *
 *   GET /auth/google/start?redirect=<url>   → 302 a Google
 *   GET /auth/google/callback?code&state    → intercambia, emite JWT, 302 al front
 *
 * El Worker sigue siendo la AUTORIDAD de auth: termina emitiendo el MISMO
 * JWT que verify-code ({ sub: sessionId, uid: userId, iat, exp }), así el
 * front no distingue entre login por email o por Google.
 *
 * State: no tenemos storage de sesión server-side, así que firmamos el
 * state como un mini-JWT (HS256 con JWT_SECRET) que lleva el redirect y un
 * nonce + exp corto. En el callback lo verificamos — sirve de anti-CSRF.
 *
 * Verificación del id_token: confiamos en el id_token devuelto por el token
 * endpoint de Google (canal TLS autenticado con nuestro client_secret —
 * patrón estándar del authorization-code flow). Validamos aud/iss/exp y
 * exigimos email_verified. No re-verificamos la firma JWKS (innecesario en
 * este flow porque el token no pasó por el browser).
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { signJwt, verifyJwt } from "../jwt";
import { tursoExec, tursoFirst, tursoQuery } from "../turso";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

/** Hosts a los que permitimos redirigir de vuelta (anti open-redirect). */
function isAllowedRedirect(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.hostname !== "localhost") return false;
    const h = u.hostname;
    return (
      h === "clozr.online" ||
      h.endsWith(".clozr.online") ||
      h.endsWith(".vercel.app") ||
      h === "localhost"
    );
  } catch {
    return false;
  }
}

function callbackUri(req: Request): string {
  return `${new URL(req.url).origin}/auth/google/callback`;
}

/* ── GET /auth/google/start ──────────────────────────────────────────── */
export async function handleGoogleStart(req: Request, env: Env): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return new Response("google_oauth_not_configured", { status: 500 });
  }
  const url = new URL(req.url);
  const redirect = url.searchParams.get("redirect") ?? "";
  const safeRedirect = isAllowedRedirect(redirect) ? redirect : "https://clozr.online/app";

  // State firmado (reusamos signJwt: sub=redirect, uid=nonce, exp=+10min).
  const now = Math.floor(Date.now() / 1000);
  const state = await signJwt(
    { sub: safeRedirect, uid: crypto.randomUUID(), iat: now, exp: now + 600 },
    env.JWT_SECRET,
  );

  const auth = new URL(GOOGLE_AUTH);
  auth.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  auth.searchParams.set("redirect_uri", callbackUri(req));
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid email profile");
  auth.searchParams.set("state", state);
  auth.searchParams.set("access_type", "online");
  auth.searchParams.set("prompt", "select_account");

  return Response.redirect(auth.toString(), 302);
}

/* ── GET /auth/google/callback ───────────────────────────────────────── */
export async function handleGoogleCallback(req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const url = new URL(req.url);

  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // Validar state primero — define a dónde volvemos en caso de error.
  const statePayload = state ? await verifyJwt(state, env.JWT_SECRET) : null;
  const redirect = statePayload && isAllowedRedirect(statePayload.sub)
    ? statePayload.sub
    : "https://clozr.online/app";

  if (error) return back(redirect, { error: "google_denied" });
  if (!statePayload) return back(redirect, { error: "bad_state" });
  if (!code) return back(redirect, { error: "no_code" });
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return back(redirect, { error: "not_configured" });
  }

  // 1. Intercambiar code por tokens.
  let email: string | null = null;
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: callbackUri(req),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return back(redirect, { error: "token_exchange_failed" });
    const tokens = (await tokenRes.json()) as { id_token?: string };
    if (!tokens.id_token) return back(redirect, { error: "no_id_token" });

    // 2. Decodificar y validar el id_token.
    const claims = decodeJwtPayload(tokens.id_token);
    if (!claims) return back(redirect, { error: "bad_id_token" });
    const aud = claims.aud;
    const iss = claims.iss;
    const exp = typeof claims.exp === "number" ? claims.exp : 0;
    if (aud !== env.GOOGLE_CLIENT_ID) return back(redirect, { error: "aud_mismatch" });
    if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") {
      return back(redirect, { error: "iss_mismatch" });
    }
    if (exp * 1000 < Date.now()) return back(redirect, { error: "id_token_expired" });
    if (claims.email_verified !== true && claims.email_verified !== "true") {
      return back(redirect, { error: "email_not_verified" });
    }
    email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : null;
  } catch {
    return back(redirect, { error: "google_error" });
  }

  if (!email) return back(redirect, { error: "no_email" });

  // 3. get-or-create user + session (mismo patrón que verify-code).
  const userId = await getOrCreateUser(env, email);
  const sessionId = crypto.randomUUID();
  const sessionTtlDays = Number(env.SESSION_TTL_DAYS) || 30;
  const sessionExp = new Date(Date.now() + sessionTtlDays * 86_400_000);
  await tursoExec(
    env,
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
    [sessionId, userId, sessionExp.toISOString()],
  );

  const jwt = await signJwt(
    {
      sub: sessionId,
      uid: userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(sessionExp.getTime() / 1000),
    },
    env.JWT_SECRET,
  );

  // 4. Volver al front con el token en el fragment (#token=...).
  return back(redirect, { token: jwt });
}

/* ── helpers ─────────────────────────────────────────────────────────── */

function back(redirect: string, params: Record<string, string>): Response {
  const frag = new URLSearchParams(params).toString();
  return Response.redirect(`${redirect}#${frag}`, 302);
}

interface GoogleClaims {
  email?: unknown;
  email_verified?: unknown;
  aud?: unknown;
  iss?: unknown;
  exp?: unknown;
}
function decodeJwtPayload(jwt: string): GoogleClaims | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const p = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const padded = p + "=".repeat((4 - (p.length % 4)) % 4);
    return JSON.parse(atob(padded)) as GoogleClaims;
  } catch {
    return null;
  }
}

async function getOrCreateUser(env: Env, email: string): Promise<string> {
  const existing = await tursoFirst(env, `SELECT id FROM users WHERE email = ?`, [email]);
  if (existing) return String(existing.id);
  const id = crypto.randomUUID();
  await tursoQuery(env, { sql: `INSERT INTO users (id, email) VALUES (?, ?)`, args: [id, email] });
  return id;
}
