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
import { Mail, LogOut, CheckCircle2, RefreshCw, Plus, Building2, Check } from "lucide-react";
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import { useUIStore } from "../../store/uiStore";
import { requestMagicLink, verifyCode, fetchMe, createWorkspace } from "../../lib/cloudAuth";
import { color, space, text, weight } from "../../tokens";
import { cloudStyles } from "./cloudStyles";

// CloudAccountSection es la columna más angosta (form de login) — cardStyle
// con maxWidth 520 en vez del 640 default de cloudStyles. inputStyle también
// con mb=12 para apretar un poco el form.
const cardStyle: React.CSSProperties = { ...cloudStyles.card, maxWidth: 520 };
const inputStyle: React.CSSProperties = { ...cloudStyles.input, marginBottom: 12 };
const { title: titleStyle, desc: descStyle, label: labelStyle, btnPrimary, btnGhost } = cloudStyles;

const ROLE_LABELS: Record<string, string> = {
  owner: "Dueño",
  admin: "Encargado",
  vendedor: "Vendedor",
  viewer: "Solo lectura",
};

export function CloudAccountSection() {
  const {
    jwt, email, expiresAt,
    workspaces, activeWorkspaceId,
    setSession, setWorkspaces, setActiveWorkspace, upsertWorkspace,
    clearSession, isLoggedIn,
  } = useCloudAuthStore();
  const { showToast } = useUIStore();

  const loggedIn = isLoggedIn();

  const [emailInput, setEmailInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // Estado del input de código (alternativa al deep link).
  const [codeInput, setCodeInput] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);
  // Estado del flow "crear negocio" (modal inline).
  const [creatingWs, setCreatingWs] = useState(false);
  const [wsName, setWsName] = useState("");
  const [creatingSubmit, setCreatingSubmit] = useState(false);

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

    // Fire-and-forget: hidratar workspaces.
    void fetchMe(res.jwt).then((meRes) => {
      if (meRes.ok) setWorkspaces(meRes.data.workspaces);
    });
  }

  /**
   * Crea un workspace nuevo en la nube. El user que lo crea queda como
   * owner automáticamente (auto-membership server-side).
   */
  async function handleCreateWs(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = wsName.trim();
    if (!trimmed) { showToast("Escribí un nombre", "error"); return; }
    setCreatingSubmit(true);
    const res = await createWorkspace(jwt, trimmed);
    setCreatingSubmit(false);
    if (!res.ok) {
      showToast(`No se pudo crear: ${res.error}`, "error");
      return;
    }
    upsertWorkspace({
      id: res.data.id,
      name: res.data.name,
      role: res.data.role,
      status: res.data.status,
    });
    setCreatingWs(false);
    setWsName("");
    showToast(`Negocio "${res.data.name}" creado en la nube`, "success");
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
          Estás logueado. Tus negocios en la nube viven acá.
          Cuando F2 termine de migrar los datos del cliente/ventas, tu equipo
          va a ver los mismos números desde otras PCs en tiempo real.
        </p>

        {/* Identidad */}
        <div style={{ ...cardStyle, marginBottom: 16 }}>
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

        {/* Workspaces */}
        <h3 style={{ fontSize: 13, fontWeight: 600, color: color.textMuted, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 12px" }}>
          Negocios
        </h3>

        {workspaces.length === 0 && !creatingWs && (
          <div style={{ ...cardStyle, textAlign: "center" }}>
            <Building2 size={32} color={color.textDim} style={{ margin: "0 auto 12px" }} />
            <div style={{ fontSize: text.sm, color: color.textMuted, marginBottom: 8 }}>
              Todavía no creaste tu negocio en la nube.
            </div>
            <div style={{ fontSize: text.xs, color: color.textDim, marginBottom: 16, lineHeight: 1.5 }}>
              Vas a poder invitar a tu encargado y vendedores. Cada uno entra desde su PC con su email.
            </div>
            <button onClick={() => setCreatingWs(true)} style={btnPrimary}>
              <Plus size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
              Crear mi negocio
            </button>
          </div>
        )}

        {workspaces.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {workspaces.map((ws) => {
              const isActive = ws.id === activeWorkspaceId;
              const roleLabel = ROLE_LABELS[ws.role] ?? ws.role;
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => setActiveWorkspace(ws.id)}
                  style={{
                    ...cardStyle,
                    display: "flex",
                    alignItems: "center",
                    gap: space[3],
                    cursor: "pointer",
                    border: `1px solid ${isActive ? color.primary : color.border}`,
                    boxShadow: isActive ? `0 0 0 2px ${color.primary}22` : "none",
                    textAlign: "left",
                  }}
                >
                  <Building2 size={18} color={isActive ? color.primary : color.textMuted} style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
                      {ws.name}
                    </div>
                    <div style={{ fontSize: text.xs, color: color.textDim, marginTop: 2 }}>
                      Tu rol: <strong style={{ color: color.textMuted }}>{roleLabel}</strong>
                    </div>
                  </div>
                  {isActive && <Check size={16} color={color.primary} />}
                </button>
              );
            })}
          </div>
        )}

        {/* Botón "crear otro" cuando ya hay >=1 */}
        {workspaces.length > 0 && !creatingWs && (
          <button onClick={() => setCreatingWs(true)} style={btnGhost}>
            <Plus size={13} />
            Crear otro negocio
          </button>
        )}

        {/* Form inline de crear negocio */}
        {creatingWs && (
          <form onSubmit={handleCreateWs} style={{ ...cardStyle, marginTop: 12 }}>
            <label style={labelStyle}>Nombre del negocio</label>
            <input
              type="text"
              autoFocus
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              placeholder="Ej: iPhone Club"
              maxLength={80}
              disabled={creatingSubmit}
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: space[2] }}>
              <button type="submit" disabled={creatingSubmit} style={{ ...btnPrimary, flex: 1 }}>
                {creatingSubmit ? "Creando..." : "Crear"}
              </button>
              <button
                type="button"
                onClick={() => { setCreatingWs(false); setWsName(""); }}
                disabled={creatingSubmit}
                style={btnGhost}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
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

/* styles compartidos viven en ./cloudStyles.ts */
