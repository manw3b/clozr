/**
 * Logger central de la app. Centralizar significa que mañana podemos:
 * - Cambiar sink (console → archivo via Tauri fs → endpoint remoto)
 * - Filtrar por nivel
 * - Agregar contexto (workspace, user, etc.)
 *
 * Por ahora delega a console pero con un namespace consistente.
 */

type Level = "debug" | "info" | "warn" | "error";

interface LogPayload {
  scope?: string;
  data?: Record<string, unknown>;
  err?: unknown;
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
  if (e && typeof e === "object" && "message" in e && typeof (e as any).message === "string") {
    return (e as any).message;
  }
  return fallback;
}
