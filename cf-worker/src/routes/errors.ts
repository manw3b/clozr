/**
 * POST /errors
 *
 * Telemetría mínima de errores del frontend (E2). El cliente postea cuando
 * `log.error` se dispara, con shape:
 *   { message: string; scope?: string; stack?: string; data?: object;
 *     userAgent?: string; appVersion?: string }
 *
 * No requiere auth (queremos capturar errores PRE-login también, ej:
 * fallo cargando workspaces). Pero sí rate-limit por IP para que un
 * cliente roto no nos floodee.
 *
 * Persistimos en `client_errors` table que se crea on-demand. Para
 * postmortems abrís el shell de Turso y queryeás.
 *
 * NO log emails ni nombres de clientes — el cliente debe haber
 * sanitizado antes (en el módulo logger.ts del frontend).
 */

import type { Env } from "../index";
import { tursoExec } from "../turso";

interface ErrorBody {
  message?: unknown;
  scope?: unknown;
  stack?: unknown;
  data?: unknown;
  userAgent?: unknown;
  appVersion?: unknown;
}

let schemaEnsured = false;
async function ensureErrorsTable(env: Env): Promise<void> {
  if (schemaEnsured) return;
  await tursoExec(env, `CREATE TABLE IF NOT EXISTS client_errors (
    id TEXT PRIMARY KEY,
    occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
    message TEXT NOT NULL,
    scope TEXT,
    stack TEXT,
    data_json TEXT,
    user_agent TEXT,
    app_version TEXT
  )`);
  // Índice por fecha para que las queries postmortem sean rápidas.
  await tursoExec(env, `CREATE INDEX IF NOT EXISTS idx_client_errors_occurred
    ON client_errors(occurred_at DESC)`);
  schemaEnsured = true;
}

export async function handleClientError(req: Request, env: Env): Promise<Response> {
  await ensureErrorsTable(env);

  let body: ErrorBody;
  try {
    body = (await req.json()) as ErrorBody;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const message = typeof body.message === "string" ? body.message.slice(0, 1000) : null;
  if (!message) {
    return new Response(JSON.stringify({ error: "missing_message" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const scope = typeof body.scope === "string" ? body.scope.slice(0, 100) : null;
  const stack = typeof body.stack === "string" ? body.stack.slice(0, 4000) : null;
  const dataJson = body.data && typeof body.data === "object"
    ? JSON.stringify(body.data).slice(0, 2000)
    : null;
  const userAgent = typeof body.userAgent === "string" ? body.userAgent.slice(0, 300) : null;
  const appVersion = typeof body.appVersion === "string" ? body.appVersion.slice(0, 30) : null;

  await tursoExec(
    env,
    `INSERT INTO client_errors (id, message, scope, stack, data_json, user_agent, app_version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), message, scope, stack, dataJson, userAgent, appVersion],
  );

  return new Response(JSON.stringify({ ok: true }), {
    status: 202,
    headers: { "content-type": "application/json" },
  });
}
