/**
 * Wrapper de Resend para el email de magic link.
 *
 * Por ahora HTML hardcodeado acá. Cuando tengamos > 2 tipos de email
 * (recordatorio de pago, factura, etc) movemos los templates a archivos.
 */

export interface SendMagicLinkOpts {
  to: string;
  link: string;
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
      html: renderHtml(opts.link),
      text: renderText(opts.link),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[resend] HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
}

function renderHtml(link: string): string {
  return `<!doctype html>
<html>
<body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 40px auto; padding: 0 16px; color: #1f2937;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Tu acceso a Clozr</h1>
  <p style="font-size: 15px; line-height: 1.5;">Hacé click en el botón para entrar. El link expira en 15 minutos.</p>
  <p style="margin: 28px 0;">
    <a href="${escapeHtml(link)}"
       style="display: inline-block; padding: 12px 22px; background: #ef4444; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
      Abrir Clozr
    </a>
  </p>
  <p style="font-size: 13px; color: #6b7280; line-height: 1.5;">
    Si el botón no funciona, copiá y pegá este link en tu navegador:<br>
    <span style="word-break: break-all; color: #4b5563;">${escapeHtml(link)}</span>
  </p>
  <p style="font-size: 12px; color: #9ca3af; margin-top: 32px;">
    Si vos no pediste este email, ignoralo — el link no sirve sin click.
  </p>
</body>
</html>`;
}

function renderText(link: string): string {
  return `Tu acceso a Clozr

Hacé click en el siguiente link para entrar (expira en 15 minutos):

${link}

Si vos no pediste este email, ignoralo.`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
