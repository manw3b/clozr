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

  // Token: 32 bytes random → hex (64 chars). Va en el link del email,
  // unguessable en la ventana de 15 min.
  // Code: 6 dígitos. Para el caso "abrí el email en el celular, quiero
  // loguearme en la PC". El user lee el código y lo escribe en la app.
  // 6 dígitos = 1M combinaciones, suficiente con TTL 15 min y rate
  // limit (futuro). Brute force = 95 años a 1 req/seg.
  const token = randomHex(32);
  const code = randomDigits(6);
  const ttlMin = Number(env.MAGIC_LINK_TTL_MIN) || 15;
  const expiresAt = new Date(Date.now() + ttlMin * 60_000).toISOString();

  await tursoExec(
    env,
    `INSERT INTO magic_links (token, email, expires_at, code) VALUES (?, ?, ?, ?)`,
    [token, email, expiresAt, code],
  );

  // Workers expone la URL del request. La verify route va al mismo origen.
  // En dev local con wrangler: http://localhost:8787. En prod: el subdominio.
  const origin = new URL(req.url).origin;
  // El link que va al EMAIL es HTTPS — apunta al worker /auth/verify.
  // El worker validará y redirigirá al deep link clozr://auth-complete.
  // No mandamos el clozr:// directo porque algunos clientes de email
  // strippan schemes no-http.
  const link = `${origin}/auth/verify?token=${encodeURIComponent(token)}`;

  // El envío de email es BEST-EFFORT.
  //
  // Por qué: si el dominio sender no está verificado en Resend (sandbox),
  // solo se puede mandar email al owner de la cuenta Resend (en nuestro
  // caso pyter.import@gmail.com). Cualquier otro destinatario devuelve
  // 403. Si lo hiciéramos sync, el endpoint fallaría con 500 y el
  // miembro invitado vería "Failed to fetch" en su app — no podría
  // avanzar a la pantalla con "Opción 2 — pegá el código".
  //
  // En cambio devolvemos ok=true (el magic_link YA está persistido en
  // DB) + flag emailFailed para que la UI muestre algo distintivo. El
  // owner puede entonces compartir el código manualmente via
  // /workspaces/.../access-code y el invitado lo pega.
  let emailFailed = false;
  try {
    await sendMagicLinkEmail({
      to: email,
      link,
      code,
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM,
    });
  } catch (e) {
    emailFailed = true;
    // eslint-disable-next-line no-console
    console.warn("[auth/request] email send failed (magic_link igual creado):", e);
  }

  return json({ ok: true, sentTo: email, expiresInMin: ttlMin, emailFailed });
}

/* ── helpers ─────────────────────────────────────────────────────────── */

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Devuelve N dígitos uniformemente random.
 * Usa rejection sampling para evitar bias en módulo (los últimos
 * múltiplos de 256 no son 10-divisibles → un % 10 sesga a los chicos).
 */
function randomDigits(n: number): string {
  let out = "";
  while (out.length < n) {
    const buf = new Uint8Array(n);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      // Aceptamos solo bytes en [0, 249] para que el módulo 10 sea uniforme.
      if (b >= 250) continue;
      out += String(b % 10);
      if (out.length === n) break;
    }
  }
  return out;
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
