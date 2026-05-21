/**
 * GET /auth/verify?token=XXX
 *
 * Lo abre el USUARIO desde su cliente de email (browser nuevo, sin
 * cookie nuestra). Validamos el token, creamos la session, firmamos
 * un JWT, y redirigimos a `clozr://auth-complete?jwt=XXX`.
 *
 * El SO toma el clozr:// y abre la app Tauri registrada con ese
 * scheme (ver F1.5). La app lee el token y lo guarda en authStore.
 *
 * Flujo completo del usuario:
 *   1. App Tauri → click "Enviar magic link" → POST /auth/request
 *   2. Usuario abre Gmail → click el botón → browser navega a /auth/verify
 *   3. Worker valida → 302 a clozr://auth-complete?jwt=XXX
 *   4. SO abre Tauri → handler de deep link → app logueada
 *
 * Si algo falla, redirigimos a clozr://auth-error?reason=XXX. La app
 * muestra mensaje y permite reintentar.
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { tursoExec, tursoFirst, tursoQuery } from "../turso";
import { signJwt } from "../jwt";

export async function handleAuthVerify(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const scheme = env.DEEP_LINK_SCHEME; // "clozr"

  if (!token) return redirectErr(scheme, "missing_token");

  await ensureSchema(env);

  // 1. Lookup + validate
  const link = await tursoFirst(
    env,
    `SELECT token, email, expires_at, used_at FROM magic_links WHERE token = ?`,
    [token],
  );

  if (!link) return redirectErr(scheme, "invalid_token");
  if (link.used_at) return redirectErr(scheme, "already_used");
  const exp = typeof link.expires_at === "string" ? Date.parse(link.expires_at) : NaN;
  if (!exp || exp < Date.now()) return redirectErr(scheme, "expired");

  const email = String(link.email);

  // 2. Mark token used (defensive: do it ANTES de crear la session, para
  //    que un reintento accidental no cree 2 sessions).
  await tursoExec(env, `UPDATE magic_links SET used_at = datetime('now') WHERE token = ?`, [token]);

  // 3. Get-or-create user
  const userId = await getOrCreateUser(env, email);

  // 4. Create session
  const sessionId = crypto.randomUUID();
  const sessionTtlDays = Number(env.SESSION_TTL_DAYS) || 30;
  const sessionExp = new Date(Date.now() + sessionTtlDays * 86_400_000);

  await tursoExec(
    env,
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
    [sessionId, userId, sessionExp.toISOString()],
  );

  // 5. Sign JWT
  const jwt = await signJwt(
    {
      sub: sessionId,
      uid: userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(sessionExp.getTime() / 1000),
    },
    env.JWT_SECRET,
  );

  // 6. Redirect to deep link.
  //    Tauri parsea ?jwt= y dispara el handler.
  //    También devolvemos una página HTML de fallback por si el SO no
  //    abre el scheme automáticamente (ej: usuario sin Clozr instalado).
  const deepLink = `${scheme}://auth-complete?jwt=${encodeURIComponent(jwt)}`;
  return new Response(renderRedirectPage(deepLink, email), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Refresh = 0 dispara la redirección sin esperar interacción.
      refresh: `0;url=${deepLink}`,
    },
  });
}

/* ── DB helpers ──────────────────────────────────────────────────────── */

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

/* ── HTML helpers ────────────────────────────────────────────────────── */

function redirectErr(scheme: string, reason: string): Response {
  const deepLink = `${scheme}://auth-error?reason=${encodeURIComponent(reason)}`;
  return new Response(renderErrorPage(deepLink, reason), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      refresh: `0;url=${deepLink}`,
    },
  });
}

function renderRedirectPage(deepLink: string, email: string): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Abriendo Clozr...</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 16px; color: #1f2937; text-align: center; }
    h1 { font-size: 22px; margin-bottom: 8px; }
    p { color: #6b7280; font-size: 15px; }
    a.btn { display: inline-block; margin-top: 24px; padding: 12px 22px; background: #ef4444; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Abriendo Clozr…</h1>
  <p>Ya te estamos logueando como <strong>${escapeHtml(email)}</strong>.</p>
  <p>Si la app no se abre sola en unos segundos:</p>
  <a class="btn" href="${escapeHtml(deepLink)}">Abrir Clozr ahora</a>
  <script>
    // Fallback JS: si refresh no funciona (algunos browsers lo restringen),
    // intentamos navegar a clozr:// manualmente.
    setTimeout(function () { window.location.href = ${JSON.stringify(deepLink)}; }, 50);
  </script>
</body>
</html>`;
}

function renderErrorPage(deepLink: string, reason: string): string {
  const REASON_LABELS: Record<string, string> = {
    missing_token: "El link no tiene token.",
    invalid_token: "Este link no es válido.",
    already_used: "Este link ya se usó. Pedí uno nuevo desde la app.",
    expired: "Este link expiró. Pedí uno nuevo desde la app.",
  };
  const label = REASON_LABELS[reason] ?? "Algo salió mal.";
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>No se pudo abrir Clozr</title>
  <style>
    body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 16px; color: #1f2937; text-align: center; }
    h1 { font-size: 22px; margin-bottom: 8px; color: #ef4444; }
    p { color: #6b7280; font-size: 15px; }
  </style>
</head>
<body>
  <h1>No se pudo entrar</h1>
  <p>${escapeHtml(label)}</p>
  <p style="font-size: 13px; color: #9ca3af; margin-top: 24px;">Abrí Clozr y pedí un link nuevo desde la pantalla de login.</p>
  <script>setTimeout(function () { window.location.href = ${JSON.stringify(deepLink)}; }, 50);</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
