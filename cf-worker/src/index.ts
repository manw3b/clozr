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
import { handleMe } from "./routes/me";
import {
  handleCreateWorkspace,
  handleListMembers,
  handleInviteMember,
  handlePatchMember,
  handleRevokeMember,
  handleIssueAccessCode,
} from "./routes/workspaces";
import {
  handleListCustomers,
  handleCreateCustomer,
  handleUpdateCustomer,
  handleDeleteCustomer,
  handleImportCustomers,
} from "./routes/customers";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight — la app Tauri pega como un browser normal.
    if (req.method === "OPTIONS") {
      return cors(req, env, new Response(null, { status: 204 }));
    }

    try {
      const route = `${req.method} ${url.pathname}`;

      // ── Rutas con path dinámico (/workspaces/:id/...) ─────────────
      const wsAccessCodeMatch = url.pathname.match(
        /^\/workspaces\/([^/]+)\/members\/([^/]+)\/access-code\/?$/,
      );
      const wsMembersMatch = url.pathname.match(
        /^\/workspaces\/([^/]+)\/members(?:\/([^/]+))?\/?$/,
      );
      const wsInviteMatch = url.pathname.match(/^\/workspaces\/([^/]+)\/invite\/?$/);

      // Customers paths (F2-B R1):
      //   GET    /workspaces/:wid/customers
      //   POST   /workspaces/:wid/customers
      //   POST   /workspaces/:wid/customers/import
      //   PATCH  /workspaces/:wid/customers/:cid
      //   DELETE /workspaces/:wid/customers/:cid
      const wsCustomersImportMatch = url.pathname.match(
        /^\/workspaces\/([^/]+)\/customers\/import\/?$/,
      );
      const wsCustomerMatch = url.pathname.match(
        /^\/workspaces\/([^/]+)\/customers(?:\/([^/]+))?\/?$/,
      );

      if (wsCustomersImportMatch && req.method === "POST") {
        const wsId = wsCustomersImportMatch[1]!;
        return cors(req, env, await handleImportCustomers(wsId, req, env));
      }
      if (wsCustomerMatch) {
        const wsId = wsCustomerMatch[1]!;
        const cId = wsCustomerMatch[2];
        if (!cId && req.method === "GET")    return cors(req, env, await handleListCustomers(wsId, req, env));
        if (!cId && req.method === "POST")   return cors(req, env, await handleCreateCustomer(wsId, req, env));
        if (cId && req.method === "PATCH")   return cors(req, env, await handleUpdateCustomer(wsId, cId, req, env));
        if (cId && req.method === "DELETE")  return cors(req, env, await handleDeleteCustomer(wsId, cId, req, env));
      }

      // access-code va ANTES que /members/:mid porque su path es más
      // específico (/members/:mid/access-code matches both regex).
      if (wsAccessCodeMatch && req.method === "POST") {
        const wsId = wsAccessCodeMatch[1]!;
        const mId = wsAccessCodeMatch[2]!;
        return cors(req, env, await handleIssueAccessCode(wsId, mId, req, env));
      }
      if (wsMembersMatch) {
        const wsId = wsMembersMatch[1]!;
        const mId = wsMembersMatch[2];
        if (!mId && req.method === "GET") {
          return cors(req, env, await handleListMembers(wsId, req, env));
        }
        if (mId && req.method === "PATCH") {
          return cors(req, env, await handlePatchMember(wsId, mId, req, env));
        }
        if (mId && req.method === "DELETE") {
          return cors(req, env, await handleRevokeMember(wsId, mId, req, env));
        }
      }
      if (wsInviteMatch && req.method === "POST") {
        const wsId = wsInviteMatch[1]!;
        return cors(req, env, await handleInviteMember(wsId, req, env));
      }

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

        case "GET /me":
          return cors(req, env, await handleMe(req, env));

        case "POST /workspaces":
          return cors(req, env, await handleCreateWorkspace(req, env));

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
  headers.set("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, authorization");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "origin");
  return new Response(res.body, { status: res.status, headers });
}
