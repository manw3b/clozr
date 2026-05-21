/**
 * Cliente del backend de auth (Cloudflare Worker).
 *
 * 2 funciones expuestas:
 *   - requestMagicLink(email): POSTea al worker, dispara el envío del email
 *   - parseJwtPayload(jwt): decodifica el payload sin validar firma (la
 *     validación de firma queda del lado del worker; en cliente solo
 *     necesitamos leer exp/uid/sub).
 *
 * La validación criptográfica del JWT NO se hace acá — el client se fía
 * del backend. La razón: si alguien comprometió tu localStorage para meter
 * un JWT falso, ya tiene acceso al disco y a TODO. Validar la firma client-
 * side no agrega seguridad real; sí da overhead inútil.
 */

/**
 * URL base del worker de auth.
 *
 * Permitimos override via env var de Vite (VITE_AUTH_WORKER_URL) para
 * que en development local puedas apuntar a `wrangler dev` (localhost:8787)
 * sin tener que tocar este archivo. En prod usa el worker desplegado.
 *
 * Setear en .env.local de la raíz:
 *   VITE_AUTH_WORKER_URL=http://localhost:8787
 */
const AUTH_BASE =
  (import.meta.env.VITE_AUTH_WORKER_URL as string | undefined) ??
  "https://clozr-auth.pyter-import.workers.dev";

export interface RequestMagicLinkResult {
  ok: boolean;
  sentTo?: string;
  expiresInMin?: number;
  error?: string;
}

/**
 * Pide al worker que mande un magic link a `email`. El worker valida
 * formato, inserta token en magic_links, manda email via Resend.
 *
 * No throwa errors HTTP — los devuelve en el shape { ok: false, error }
 * para que la UI los muestre sin try/catch.
 */
export async function requestMagicLink(email: string): Promise<RequestMagicLinkResult> {
  try {
    const res = await fetch(`${AUTH_BASE}/auth/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = (await res.json()) as RequestMagicLinkResult;
    if (!res.ok) return { ok: false, error: data.error ?? `http_${res.status}` };
    return data;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network_error" };
  }
}

export interface VerifyCodeResult {
  ok: boolean;
  jwt?: string;
  email?: string;
  userId?: string;
  sessionId?: string;
  /** unix seconds */
  expiresAt?: number;
  error?: string;
}

/**
 * Valida el código de 6 dígitos contra el worker. Alternativa al deep
 * link — útil cuando el user lee el email en otro dispositivo y escribe
 * el código en la PC donde corre Clozr.
 *
 * Errores típicos del worker: invalid_code, already_used, expired,
 * invalid_code_format.
 */
export async function verifyCode(email: string, code: string): Promise<VerifyCodeResult> {
  try {
    const res = await fetch(`${AUTH_BASE}/auth/verify-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const data = (await res.json()) as VerifyCodeResult;
    if (!res.ok) return { ok: false, error: data.error ?? `http_${res.status}` };
    return data;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network_error" };
  }
}

/* ── JWT helpers ─────────────────────────────────────────────────────── */

export interface JwtPayload {
  /** subject — session_id */
  sub: string;
  /** user_id */
  uid: string;
  /** issued at (unix seconds) */
  iat: number;
  /** expiration (unix seconds) */
  exp: number;
}

/**
 * Decodifica el payload de un JWT base64url. NO valida firma.
 * Devuelve null si el formato es malo (3 partes, payload válido JSON,
 * tiene los campos requeridos).
 */
export function parseJwtPayload(jwt: string): JwtPayload | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const payloadB64 = parts[1];
  if (!payloadB64) return null;
  try {
    const json = b64urlDecode(payloadB64);
    const obj = JSON.parse(json) as Partial<JwtPayload>;
    if (typeof obj.sub !== "string" || typeof obj.uid !== "string" ||
        typeof obj.iat !== "number" || typeof obj.exp !== "number") {
      return null;
    }
    return { sub: obj.sub, uid: obj.uid, iat: obj.iat, exp: obj.exp };
  } catch {
    return null;
  }
}

function b64urlDecode(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return atob(padded);
}

/* ── Deep link URL parsing ───────────────────────────────────────────── */

export interface DeepLinkResult {
  type: "success" | "error";
  /** Para success: el JWT. Para error: vacío. */
  jwt?: string;
  /** Para error: el reason crudo del worker (invalid_token, expired, etc). */
  reason?: string;
}

/**
 * Parsea un URL clozr:// recibido del backend. Acepta los dos formatos
 * que emite el worker:
 *   clozr://auth-complete?jwt=XXX
 *   clozr://auth-error?reason=expired
 */
export function parseAuthDeepLink(url: string): DeepLinkResult | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "clozr:") return null;
    if (u.hostname === "auth-complete") {
      const jwt = u.searchParams.get("jwt");
      if (!jwt) return null;
      return { type: "success", jwt };
    }
    if (u.hostname === "auth-error") {
      const reason = u.searchParams.get("reason") ?? "unknown";
      return { type: "error", reason };
    }
    return null;
  } catch {
    return null;
  }
}
