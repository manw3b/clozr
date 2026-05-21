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

/* ── Invitación a un workspace ───────────────────────────────────────── */

export interface SendInviteOpts {
  to: string;
  workspaceName: string;
  inviterEmail: string;
  role: string;
  apiKey: string;
  from: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Dueño",
  admin: "Encargado",
  vendedor: "Vendedor",
  viewer: "Solo lectura",
};

export async function sendInviteEmail(opts: SendInviteOpts): Promise<void> {
  const roleLabel = ROLE_LABELS[opts.role] ?? opts.role;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: opts.to,
      subject: `${opts.inviterEmail} te invitó a ${opts.workspaceName} en Clozr`,
      html: renderInviteHtml({ workspaceName: opts.workspaceName, inviterEmail: opts.inviterEmail, roleLabel }),
      text: renderInviteText({ workspaceName: opts.workspaceName, inviterEmail: opts.inviterEmail, roleLabel }),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[resend invite] HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
}

function renderInviteHtml(o: { workspaceName: string; inviterEmail: string; roleLabel: string }): string {
  return `<!doctype html>
<html>
<body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 40px auto; padding: 0 16px; color: #1f2937;">
  <h1 style="font-size: 22px; margin: 0 0 12px;">Te invitaron a ${escapeHtml(o.workspaceName)}</h1>
  <p style="font-size: 15px; line-height: 1.5; color: #374151;">
    <strong>${escapeHtml(o.inviterEmail)}</strong> te incluyó como
    <strong>${escapeHtml(o.roleLabel)}</strong> en <strong>${escapeHtml(o.workspaceName)}</strong>.
  </p>
  <p style="font-size: 15px; line-height: 1.5; color: #374151; margin-top: 24px;">
    Para entrar, abrí Clozr en tu PC, andá a <strong>Ajustes → Cuenta en la nube</strong>
    y pedí un magic link con este email. Cuando entres vas a ver el workspace ya disponible.
  </p>
  <p style="font-size: 13px; color: #6b7280; line-height: 1.5; margin-top: 28px;">
    Si no tenés Clozr todavía, descargalo desde
    <a href="https://github.com/manw3b/clozr/releases/latest" style="color: #ef4444;">github.com/manw3b/clozr/releases/latest</a>.
  </p>
  <p style="font-size: 12px; color: #9ca3af; margin-top: 32px;">
    Si no esperabas esta invitación, ignorá este email — no se hace nada sin login.
  </p>
</body>
</html>`;
}

function renderInviteText(o: { workspaceName: string; inviterEmail: string; roleLabel: string }): string {
  return `${o.inviterEmail} te invitó a ${o.workspaceName} en Clozr como ${o.roleLabel}.

Para entrar:
1. Abrí Clozr en tu PC
2. Ajustes → Cuenta en la nube
3. Pedí un magic link con este email
4. Vas a ver el workspace ya disponible

Si no tenés Clozr: https://github.com/manw3b/clozr/releases/latest

Si no esperabas esta invitación, ignorá este email.`;
}
