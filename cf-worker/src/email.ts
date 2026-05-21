/**
 * Wrapper de Resend para el email de magic link.
 *
 * Por ahora HTML hardcodeado acá. Cuando tengamos > 2 tipos de email
 * (recordatorio de pago, factura, etc) movemos los templates a archivos.
 */

export interface SendMagicLinkOpts {
  to: string;
  link: string;
  /** Código 6 dígitos como alternativa al link. Se muestra grande en
   *  el email — para el caso "abrí el email en cel, ingreso el código
   *  en la app de la PC". */
  code: string;
  apiKey: string;
  from: string;
}

export async function sendMagicLinkEmail(opts: SendMagicLinkOpts): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: opts.to,
      subject: "Tu acceso a Clozr",
      html: renderHtml(opts.link, opts.code),
      text: renderText(opts.link, opts.code),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[resend] HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
}

function renderHtml(link: string, code: string): string {
  // Formato del código con espacio en el medio para que sea fácil de leer/copiar.
  const codeFormatted = `${code.slice(0, 3)} ${code.slice(3)}`;
  return `<!doctype html>
<html>
<body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 40px auto; padding: 0 16px; color: #1f2937;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Tu acceso a Clozr</h1>
  <p style="font-size: 15px; line-height: 1.5;">Para entrar, usá <strong>una</strong> de las dos opciones (el link expira en 15 minutos):</p>

  <h2 style="font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin: 28px 0 12px;">Opción 1 — Abrir Clozr directo</h2>
  <p style="margin: 0 0 8px;">
    <a href="${escapeHtml(link)}"
       style="display: inline-block; padding: 12px 22px; background: #ef4444; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
      Abrir Clozr
    </a>
  </p>
  <p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">Solo funciona si lees este email en la misma PC donde tenés Clozr instalado.</p>

  <h2 style="font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin: 32px 0 12px;">Opción 2 — Ingresá este código en la app</h2>
  <div style="font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 34px; font-weight: 700; letter-spacing: 4px; padding: 18px 24px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 10px; text-align: center; color: #111827; display: inline-block;">
    ${escapeHtml(codeFormatted)}
  </div>
  <p style="font-size: 12px; color: #9ca3af; margin: 8px 0 0;">Si lees este email en el celular, escribí este código en la pantalla de login de Clozr en tu PC.</p>

  <p style="font-size: 12px; color: #9ca3af; margin-top: 32px;">
    Si vos no pediste este email, ignoralo — sin el link o el código nadie puede entrar.
  </p>
</body>
</html>`;
}

function renderText(link: string, code: string): string {
  const codeFormatted = `${code.slice(0, 3)} ${code.slice(3)}`;
  return `Tu acceso a Clozr

Para entrar (link/código expiran en 15 minutos):

Opción 1 — Abrir directo (si lees este email en la PC donde tenés Clozr):
${link}

Opción 2 — Ingresá este código en la app de Clozr de tu PC:
${codeFormatted}

Si vos no pediste este email, ignoralo.`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
