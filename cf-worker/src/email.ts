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

/* ── Dunning (recordatorios de pago) ─────────────────────────────────────
 * Mails del ciclo de cobranza cuando una suscripción falla / se cancela, antes
 * de degradar a Free. Los dispara el cron cron/dunning.ts. */

const APP_URL = "https://clozr.online/app";

export interface SendDunningOpts {
  to: string;
  workspaceName: string;
  planLabel: string;
  /** 'first' = aviso inicial (pago falló) · 'final' = último aviso (gracia por vencer). */
  stage: "first" | "final";
  /** Días que faltan para bajar a Free. */
  daysLeft: number;
  apiKey: string;
  from: string;
}

export async function sendDunningEmail(opts: SendDunningOpts): Promise<void> {
  const isFinal = opts.stage === "final";
  const d = Math.max(0, Math.round(opts.daysLeft));
  const diasTxt = d === 1 ? "1 día" : `${d} días`;
  const subject = isFinal
    ? `Te ${d === 1 ? "queda" : "quedan"} ${diasTxt} de tu plan ${opts.planLabel}`
    : `Hubo un problema con tu pago de Clozr`;

  const intro = isFinal
    ? `Tu plan <strong>${escapeHtml(opts.planLabel)}</strong> de <strong>${escapeHtml(opts.workspaceName)}</strong> está por vencer. Si no regularizás el pago, en <strong>${escapeHtml(diasTxt)}</strong> el espacio vuelve al plan Free y perdés los asientos de tu equipo y las funciones del plan.`
    : `No pudimos cobrar la renovación de tu plan <strong>${escapeHtml(opts.planLabel)}</strong> en <strong>${escapeHtml(opts.workspaceName)}</strong>. Tenés <strong>${escapeHtml(diasTxt)}</strong> para regularizarlo antes de que el espacio vuelva al plan Free.`;

  const html = `<!doctype html>
<html>
<body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 40px auto; padding: 0 16px; color: #1f2937;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">${escapeHtml(isFinal ? "Tu plan está por vencer" : "Tu pago no se procesó")}</h1>
  <p style="font-size: 15px; line-height: 1.6; color: #374151;">${intro}</p>
  <p style="margin: 24px 0 8px;">
    <a href="${APP_URL}" style="display: inline-block; padding: 12px 22px; background: #ef4444; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
      Regularizar mi pago
    </a>
  </p>
  <p style="font-size: 13px; color: #6b7280; line-height: 1.5; margin-top: 20px;">
    Entrá a <strong>Ajustes → Plan y facturación</strong> y volvé a activar tu plan. Si ya lo regularizaste, ignorá este mensaje.
  </p>
  <p style="font-size: 12px; color: #9ca3af; margin-top: 28px;">Clozr · el CRM simple para tu negocio.</p>
</body>
</html>`;

  const text = `${isFinal ? "Tu plan Clozr está por vencer" : "Tu pago de Clozr no se procesó"}

${stripTags(intro)}

Regularizá en: ${APP_URL} (Ajustes → Plan y facturación)

Si ya lo regularizaste, ignorá este mensaje.`;

  await sendViaResend(opts.apiKey, { from: opts.from, to: opts.to, subject, html, text });
}

/* ── Win-back (recuperación tras bajar a Free) ───────────────────────────── */

export interface SendWinbackOpts {
  to: string;
  workspaceName: string;
  /** Código de descuento de recuperación. */
  code: string;
  /** % de descuento del código. */
  pct: number;
  /** Días de validez del código. */
  validDays: number;
  apiKey: string;
  from: string;
}

export async function sendWinbackEmail(opts: SendWinbackOpts): Promise<void> {
  const subject = `Volvé a Clozr y llevate ${opts.pct}% off`;
  const html = `<!doctype html>
<html>
<body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 40px auto; padding: 0 16px; color: #1f2937;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Te extrañamos 👋</h1>
  <p style="font-size: 15px; line-height: 1.6; color: #374151;">
    <strong>${escapeHtml(opts.workspaceName)}</strong> volvió al plan Free. Si querés retomar donde lo dejaste, te dejamos un
    <strong>${opts.pct}% de descuento</strong> en tu próximo pago — válido por ${opts.validDays} días.
  </p>
  <div style="font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size: 24px; font-weight: 700; letter-spacing: 2px; padding: 16px 24px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 10px; text-align: center; color: #111827; margin: 20px 0;">
    ${escapeHtml(opts.code)}
  </div>
  <p style="margin: 8px 0 8px;">
    <a href="${APP_URL}" style="display: inline-block; padding: 12px 22px; background: #ef4444; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
      Reactivar mi plan
    </a>
  </p>
  <p style="font-size: 13px; color: #6b7280; line-height: 1.5; margin-top: 18px;">
    Canjealo en <strong>Ajustes → Plan y facturación → ¿Tenés un código?</strong> y después mejorá tu plan.
  </p>
  <p style="font-size: 12px; color: #9ca3af; margin-top: 28px;">Clozr · el CRM simple para tu negocio.</p>
</body>
</html>`;

  const text = `Te extrañamos.

${opts.workspaceName} volvió al plan Free. Te dejamos un ${opts.pct}% de descuento en tu próximo pago (válido por ${opts.validDays} días):

Código: ${opts.code}

Canjealo en Ajustes → Plan y facturación → "¿Tenés un código?" y mejorá tu plan:
${APP_URL}`;

  await sendViaResend(opts.apiKey, { from: opts.from, to: opts.to, subject, html, text });
}

/** POST a Resend. Lanza si la respuesta no es OK (el caller decide qué hacer). */
async function sendViaResend(
  apiKey: string,
  msg: { from: string; to: string; subject: string; html: string; text: string },
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(msg),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[resend] HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
}

/** Quita tags HTML para la versión texto plano (los intros traen <strong>). */
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}
