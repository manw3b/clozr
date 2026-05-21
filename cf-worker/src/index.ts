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

        // case "POST /auth/request":  → F1.3 (próximo commit)
        // case "GET /auth/verify":    → F1.4

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
 * Aplica CORS headers según ALLOWED_ORIGINS de wrangler.toml.
 * Para evitar reflejar cualquier origin, validamos contra la lista.
 */
function cors(req: Request, env: Env, res: Response): Response {
  const origin = req.headers.get("origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  const headers = new Headers(res.headers);
  if (allowed.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
    headers.set("access-control-allow-headers", "content-type, authorization");
    headers.set("access-control-max-age", "86400");
    headers.set("vary", "origin");
  }
  return new Response(res.body, { status: res.status, headers });
}
