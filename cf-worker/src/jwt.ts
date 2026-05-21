/**
 * Mini JWT HS256 con SubtleCrypto.
 *
 * No usamos lib externa porque (a) son ~30 líneas de código y (b) las
 * libs JWT más populares (jsonwebtoken) requieren Node crypto. SubtleCrypto
 * está disponible nativo en Workers.
 *
 * Formato: header.payload.signature (base64url). HMAC-SHA-256.
 */

export interface JwtPayload {
  /** subject — usamos el session.id */
  sub: string;
  /** user_id — para que el cliente sepa quién es sin re-fetch */
  uid: string;
  /** issued at (unix seconds) */
  iat: number;
  /** expiration (unix seconds) */
  exp: number;
}

const HEADER = { alg: "HS256", typ: "JWT" };

export async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
  const headerB64 = b64urlEncode(JSON.stringify(HEADER));
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;
  const sig = await hmacSha256(secret, data);
  return `${data}.${b64urlEncode(sig)}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) return null;
  const expected = await hmacSha256(secret, `${headerB64}.${payloadB64}`);
  if (b64urlEncode(expected) !== sigB64) return null;
  try {
    const payload = JSON.parse(b64urlDecodeStr(payloadB64)) as JwtPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ── crypto helpers ──────────────────────────────────────────────────── */

async function hmacSha256(secret: string, data: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, enc.encode(data));
}

function b64urlEncode(input: string | ArrayBuffer): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] ?? 0);
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecodeStr(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (input.length % 4)) % 4);
  return atob(padded);
}
