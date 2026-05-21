/**
 * CloudAccountSection — UI para loguearse a la nube (Cloudflare Worker
 * + Turso) via magic link. Por ahora la sesión cloud es OPCIONAL: la app
 * sigue funcionando 100% con SQLite local sin login.
 *
 * Flujo:
 *   1. Usuario entra a Ajustes → Cuenta en la nube
 *   2. Escribe email + click "Enviar magic link"
 *   3. Worker manda email via Resend
 *   4. Usuario abre Gmail, click el botón del email
 *   5. SO abre clozr://auth-complete?jwt=XXX → Rust handler → emit event
 *   6. App.tsx useCloudAuthListener recibe event → guarda jwt en
 *      cloudAuthStore → toast "Conectado a la nube"
 *   7. Esta sección re-rendea mostrando email + botón cerrar sesión
 */

import { useState } from "react";
import { Mail, LogOut, CheckCircle2, RefreshCw } from "lucide-react";
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import { useUIStore } from "../../store/uiStore";
import { requestMagicLink, verifyCode } from "../../lib/cloudAuth";
import { color, radius, space, text, weight } from "../../tokens";

export function CloudAccountSection() {
  const { jwt, email, expiresAt, setSession, clearSession, isLoggedIn } = useCloudAuthStore();
  const { showToast } = useUIStore();

  const loggedIn = isLoggedIn();

  const [emailInput, setEmailInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // Estado del input de código (alternativa al deep link).
  const [codeInput, setCodeInput] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = emailInput.trim();
    if (!trimmed) {
      showToast("Escribí tu email", "error");
      return;
    }
    setSubmitting(true);
    // Guardamos el email pendiente para que el listener del deep link lo
    // recupere y lo guarde junto al JWT (el JWT no incluye email para
    // mantenerlo chico — la verificación de membership la hacemos contra
    // el user_id, que sí está en el JWT.uid).
    sessionStorage.setItem("clozr:pending-login-email", trimmed);
    const res = await requestMagicLink(trimmed);
    setSubmitting(false);
    if (!res.ok) {
      sessionStorage.removeItem("clozr:pending-login-email");
      showToast(`No se pudo mandar el link: ${res.error ?? "error"}`, "error");
      return;
    }
    setSentTo(trimmed);
  }

  function handleLogout() {
    clearSession();
    setEmailInput("");
    setSentTo(null);
    setCodeInput("");
    showToast("Sesión cerrada");
  }

  /**
   * Valida el código manual contra el worker. Usa el email guardado en
   * sentTo — el user no tiene que re-escribirlo. Si OK, llena la sesión
   * y vuelve al estado "logueado". Si error, mostramos toast.
   */
  async function handleSubmitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!sentTo) return;
    const cleaned = codeInput.replace(/\D/g, "");
    if (cleaned.length !== 6) {
      showToast("El código tiene que ser de 6 dígitos", "error");
      return;
    }
    setVerifyingCode(true);
    const res = await verifyCode(sentTo, cleaned);
    setVerifyingCode(false);
    if (!res.ok || !res.jwt) {
      const ERR_LABELS: Record<string, string> = {
        invalid_code: "Código incorrecto. Revisalo o pedí uno nuevo.",
        already_used: "Este código ya se usó. Pedí uno nuevo.",
        expired: "El código expiró. Pedí uno nuevo.",
        invalid_code_format: "El código tiene que ser de 6 dígitos.",
      };
      showToast(ERR_LABELS[res.error ?? ""] ?? `Error: ${res.error ?? "desconocido"}`, "error");
      return;
    }
    setSession({
      jwt: res.jwt,
      email: res.email ?? sentTo,
      userId: res.userId ?? "",
      sessionId: res.sessionId ?? "",
      expiresAt: res.expiresAt ?? 0,
    });
    sessionStorage.removeItem("clozr:pending-login-email");
    setSentTo(null);
    setCodeInput("");
    setEmailInput("");
    showToast(`Conectado a la nube como ${res.email ?? sentTo}`, "success");
  }

  /* ────────────────────────────────────────────────────────────────── */
  /* Estado: LOGUEADO                                                    */
  /* ────────────────────────────────────────────────────────────────── */
  if (loggedIn && jwt) {
    const expDate = expiresAt ? new Date(expiresAt * 1000) : null;
    return (
      <div>
        <h2 style={titleStyle}>Cuenta en la nube</h2>
        <p style={descStyle}>
          Estás logueado. Cuando F2 migre datos a Turso, tu equipo va a ver
          los mismos clientes/ventas desde otras PCs.
        </p>

        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: space[3] }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: color.successBg, display: "flex",
              alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <CheckCircle2 size={20} color={color.success} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
                {email || "Sesión activa"}
              </div>
              {expDate && (
                <div style={{ fontSize: text.xs, color: color.textDim, marginTop: 2 }}>
                  Sesión expira {expDate.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
                </div>
              )}
            </div>
            <button onClick={handleLogout} style={btnGhost}>
              <LogOut size={14} />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────────── */
  /* Estado: EMAIL ENVIADO (pendiente que clickee el link O ingrese el code) */
  /* ────────────────────────────────────────────────────────────────── */
  if (sentTo) {
    return (
      <div>
        <h2 style={titleStyle}>Revisá tu email</h2>
        <p style={descStyle}>
          Te mandamos un email a <strong style={{ color: color.text }}>{sentTo}</strong>
          {" "}con dos opciones (puede tardar 1 min — chequeá spam):
        </p>

        {/* Opción 1: link */}
        <div style={{ ...cardStyle, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: space[3] }}>
            <Mail size={20} color={color.textMuted} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text, marginBottom: 2 }}>
                Opción 1 — Click el botón "Abrir Clozr"
              </div>
              <div style={{ fontSize: text.xs, color: color.textDim }}>
                Si estás leyendo el email en esta PC. Te loguea automático.
              </div>
            </div>
          </div>
        </div>

        {/* Opción 2: código manual */}
        <form onSubmit={handleSubmitCode} style={cardStyle}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text, marginBottom: 2 }}>
              Opción 2 — Pegá el código de 6 dígitos
            </div>
            <div style={{ fontSize: text.xs, color: color.textDim }}>
              Si abriste el email en el celular u otro dispositivo.
            </div>
          </div>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="123 456"
            disabled={verifyingCode}
            maxLength={9}
            style={{
              ...inputStyle,
              fontFamily: "ui-monospace, 'SF Mono', Consolas, monospace",
              fontSize: 22,
              letterSpacing: 3,
              textAlign: "center",
            }}
          />
          <div style={{ display: "flex", gap: space[2] }}>
            <button type="submit" disabled={verifyingCode} style={{ ...btnPrimary, flex: 1 }}>
              {verifyingCode ? "Verificando..." : "Confirmar código"}
            </button>
            <button
              type="button"
              onClick={() => { setSentTo(null); setEmailInput(""); setCodeInput(""); }}
              style={btnGhost}
            >
              <RefreshCw size={13} />
              Otro email
            </button>
          </div>
          <div style={{ fontSize: text.xs, color: color.textDim, marginTop: 10 }}>
            El link y el código expiran en 15 minutos.
          </div>
        </form>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────────── */
  /* Estado: NO LOGUEADO — pedir email                                  */
  /* ────────────────────────────────────────────────────────────────── */
  return (
    <div>
      <h2 style={titleStyle}>Cuenta en la nube</h2>
      <p style={descStyle}>
        Conectate con tu email para que cuando termines la migración a la
        nube tu equipo pueda ver los mismos datos desde otras PCs.
        Por ahora es opcional — la app funciona local sin login.
      </p>

      <form onSubmit={handleSubmit} style={cardStyle}>
        <label style={labelStyle}>Email</label>
        <input
          type="email"
          autoComplete="email"
          required
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder="tu@email.com"
          disabled={submitting}
          style={inputStyle}
        />
        <button type="submit" disabled={submitting} style={btnPrimary}>
          {submitting ? "Enviando..." : "Enviar magic link"}
        </button>
      </form>
    </div>
  );
}

/* ── styles ──────────────────────────────────────────────────────────── */

const titleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: color.text,
  letterSpacing: -0.2,
  marginBottom: 4,
};

const descStyle: React.CSSProperties = {
  fontSize: 13,
  color: color.textDim,
  marginBottom: 20,
  lineHeight: 1.5,
};

const cardStyle: React.CSSProperties = {
  padding: space[4],
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  maxWidth: 520,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: color.textMuted,
  marginBottom: 6,
  display: "block",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  background: color.surface2,
  border: `1px solid ${color.borderStrong}`,
  borderRadius: 8,
  color: color.text,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  marginBottom: 12,
};

const btnPrimary: React.CSSProperties = {
  padding: "8px 18px",
  background: color.primary,
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "#fff",
  border: "none",
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  background: "transparent",
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  color: color.textMuted,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};
