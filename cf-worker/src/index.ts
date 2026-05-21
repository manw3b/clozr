/**
 * Clozr — auth Worker
 *
 * Endpoints:
 *   GET  /                 → health
 *   POST /auth/request     → manda magic link al email (F1.3)
 *   GET  /auth/verify      → valida token, redirige a clozr://auth (F1.4)
 *
 * Stack:
 *   - Cloudflare Workers (fetch handler nativo, sin framework por ahora)
 *   - Turso vía HTTP /v2/pipeline (mismo patrón que validamos en spike)
 *   - Resend para email
 *   - HS256 JWT firmado con SubtleCrypto (no necesitamos lib externa)
 *
 * Cuando este file crezca lo splittemos en routes/ + lib/.
 */

export interface Env {
  // secrets
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  RESEND_API_KEY: string;
  JWT_SECRET: string;
  // vars
  RESEND_FROM: string;
  MAGIC_LINK_TTL_MIN: string;
  SESSION_TTL_DAYS: string;
  DEEP_LINK_SCHEME: string;
  ALLOWED_ORIGINS: string;
}

import { handleAuthRequest } from "./routes/request";
import { handleAuthVerify } from "./routes/verify";
import { handleAuthVerifyCode } from "./routes/verify-code";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight — la app Tauri pega como un browser normal.
    if (req.method === "OPTIONS") {
      return cors(req, env, new Response(null, { status: 204 }));
    }

    try {
      const route = `${req.method} ${url.pathname}`;
      switch (route) {
        case "GET /":
          return cors(req, env, json({ ok: true, service: "clozr-auth", version: "0.1.0" }));

        case "POST /auth/request":
          return cors(req, env, await handleAuthRequest(req, env));

        case "POST /auth/verify-code":
          return cors(req, env, await handleAuthVerifyCode(req, env));

        case "GET /auth/verify":
          // No CORS: este endpoint lo abre el USUARIO desde su email,
          // navega directo, no es una request cross-origin del app.
          return handleAuthVerify(req, env);

        default:
          return cors(req, env, json({ error: "not_found", route }, 404));
      }
    } catch (err) {
      // Nunca devolver stack traces. Log a tail solo.
      console.error("[worker] uncaught", err);
      return cors(req, env, json({ error: "internal" }, 500));
    }
  },
};

/* ── helpers ─────────────────────────────────────────────────────────── */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * CORS abierto para los endpoints de auth.
 *
 * Razonamiento: estos endpoints son intencionalmente públicos
 *   - POST /auth/request: pide un email; manda magic link. Si un sitio
 *     malicioso lo invoca, lo único que logra es mandarle un email al
 *     dueño legítimo de ese email — no se filtra info, no hay efecto
 *     sobre el receptor a menos que CLICKEE el link.
 *   - POST /auth/verify-code: pide email + código. El código está SOLO
 *     en el email del user — un attacker tendría que tener acceso al
 *     email para guessearlo. Si lo tiene, ya ganó.
 *   - GET /: health.
 *
 * No usamos `*` con credentials (browser lo rechaza), pero como NO
 * mandamos cookies, no necesitamos credentials. Reflejamos el origin
 * que venga (incluyendo "null" cuando algunos Tauri/WebView mandan eso).
 *
 * Antes lista de origins explícita (tauri://localhost, https://tauri.localhost,
 * http://localhost:1420) pero Tauri 2 Windows usa "http://tauri.localhost"
 * con el slash final y a veces "null" — la lista era frágil y rompía
 * con "Failed to fetch" desde el WebView2.
 */
function cors(req: Request, env: Env, res: Response): Response {
  // env.ALLOWED_ORIGINS queda para diagnostico; ya no lo usamos en runtime.
  void env;
  const origin = req.headers.get("origin");
  const headers = new Headers(res.headers);
  headers.set("access-control-allow-origin", origin ?? "*");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, authorization");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "origin");
  return new Response(res.body, { status: res.status, headers });
}
