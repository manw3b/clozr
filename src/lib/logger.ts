/**
 * Logger central de la app. Centralizar significa que mañana podemos:
 * - Cambiar sink (console → archivo via Tauri fs → endpoint remoto)
 * - Filtrar por nivel
 * - Agregar contexto (workspace, user, etc.)
 *
 * E2: ahora también pipeamos `log.error` al endpoint /errors del worker
 * para postmortems. Best-effort: si la red está caída o el worker no
 * responde, swallowamos silenciosamente (logger NO debe rompernos la app).
 */

type Level = "debug" | "info" | "warn" | "error";

interface LogPayload {
  scope?: string;
  data?: Record<string, unknown>;
  err?: unknown;
}

const AUTH_BASE =
  (import.meta.env.VITE_AUTH_WORKER_URL as string | undefined) ??
  "https://clozr-auth.pyter-import.workers.dev";

// Versión de app — el build inyecta `__APP_VERSION__` desde package.json.
// Si por algún motivo no está, mandamos "unknown" en vez de fallar.
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "unknown";

/**
 * Manda un error al worker. Best-effort — silencioso si la red falla.
 * Antes de mandar, sanitizamos PII básica: stack puede contener paths
 * locales del filesystem del user (Windows: "C:\Users\NOMBRE\...") que
 * los reemplazamos con "{user}".
 */
function pipeErrorToBackend(message: string, payload?: LogPayload): void {
  try {
    const stack = payload?.err instanceof Error ? payload.err.stack : undefined;
    const sanitizedStack = stack
      ? stack
          .replace(/[A-Z]:\\Users\\[^\\]+/g, "{user}")
          .replace(/\/home\/[^/]+/g, "{user}")
          .slice(0, 4000)
      : undefined;
    const body = JSON.stringify({
      message: message.slice(0, 1000),
      scope: payload?.scope,
      stack: sanitizedStack,
      data: payload?.data,
      userAgent: navigator.userAgent,
      appVersion: APP_VERSION,
    });
    // No await — fire and forget.
    void fetch(`${AUTH_BASE}/errors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }).catch(() => {
      /* silent */
    });
  } catch {
    /* defensive: el logger NUNCA debe crashear */
  }
}

function emit(level: Level, message: string, payload?: LogPayload) {
  const ts = new Date().toISOString();
  const prefix = `[clozr${payload?.scope ? `:${payload.scope}` : ""}]`;
  const args: unknown[] = [`${prefix} ${message}`];
  if (payload?.data) args.push(payload.data);
  if (payload?.err) args.push(payload.err);

  // Always include timestamp on error/warn for postmortems
  if (level === "error" || level === "warn") {
    args.unshift(ts);
  }

  switch (level) {
    case "debug":
      // eslint-disable-next-line no-console -- logger sink: debug solo en DEV
      if (import.meta.env.DEV) console.debug(...args);
      break;
    case "info":
      console.info(...args);
      break;
    case "warn":
      console.warn(...args);
      break;
    case "error":
      console.error(...args);
      // E2: solo errores van al endpoint. Warn no — son muchos y casi
      // siempre recuperables. DEV-mode skip — el dev tiene la consola
      // a la vista y no necesita el round-trip.
      if (!import.meta.env.DEV) pipeErrorToBackend(message, payload);
      break;
  }
}

export const log = {
  debug: (message: string, payload?: LogPayload) => emit("debug", message, payload),
  info: (message: string, payload?: LogPayload) => emit("info", message, payload),
  warn: (message: string, payload?: LogPayload) => emit("warn", message, payload),
  error: (message: string, payload?: LogPayload) => emit("error", message, payload),
};

/** Extrae un mensaje legible de cualquier error. */
export function errorMessage(e: unknown, fallback = "Ocurrió un error"): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    const msg = (e as { message: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return fallback;
}
