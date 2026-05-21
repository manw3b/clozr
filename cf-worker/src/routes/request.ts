/**
 * POST /auth/request
 *
 * Body: { email: string }
 *
 * 1. Valida email (formato básico)
 * 2. Genera token random (32 bytes → hex)
 * 3. Insert en magic_links con expires_at = now + MAGIC_LINK_TTL_MIN
 * 4. Manda email con link clozr://auth?token=XXX (deep link)
 *
 * Por defensa anti-enumeration, SIEMPRE devolvemos ok aunque el email
 * no exista todavía (acordamos: primer login auto-crea user). Si el
 * email es inválido sí devolvemos 400 — no es info sensible.
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { tursoExec } from "../turso";
import { sendMagicLinkEmail } from "../email";

interface RequestBody {
  email?: unknown;
}

export async function handleAuthRequest(req: Request, env: Env): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  if (typeof body.email !== "string") {
    return json({ error: "missing_email" }, 400);
  }
  const email = body.email.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return json({ error: "invalid_email" }, 400);
  }

  await ensureSchema(env);

  // Token: 32 bytes random → hex (64 chars). Lo suficientemente largo
  // para ser unguessable en la ventana de 15 min.
  const token = randomHex(32);
  const ttlMin = Number(env.MAGIC_LINK_TTL_MIN) || 15;
  const expiresAt = new Date(Date.now() + ttlMin * 60_000).toISOString();

  await tursoExec(
    env,
    `INSERT INTO magic_links (token, email, expires_at) VALUES (?, ?, ?)`,
    [token, email, expiresAt],
  );

  // Workers expone la URL del request. La verify route va al mismo origen.
  // En dev local con wrangler: http://localhost:8787. En prod: el subdominio.
  const origin = new URL(req.url).origin;
  // El link que va al EMAIL es HTTPS — apunta al worker /auth/verify.
  // El worker validará y redirigirá al deep link clozr://auth-complete.
  // No mandamos el clozr:// directo porque algunos clientes de email
  // strippan schemes no-http.
  const link = `${origin}/auth/verify?token=${encodeURIComponent(token)}`;

  await sendMagicLinkEmail({
    to: email,
    link,
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM,
  });

  return json({ ok: true, sentTo: email, expiresInMin: ttlMin });
}

/* ── helpers ─────────────────────────────────────────────────────────── */

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isValidEmail(s: string): boolean {
  // Validación minimal: tiene una @, algo antes y un dot después.
  // No queremos rechazar emails "raros" que el server SMTP igual aceptaría.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
