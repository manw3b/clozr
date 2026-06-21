/**
 * CloudTeamSection — gestión del equipo del workspace cloud activo.
 *
 * Visible solo si cloudAuth.loggedIn y hay activeWorkspaceId. Si no,
 * muestra placeholder pidiendo loguearse / elegir workspace primero.
 *
 * Funcionalidades:
 *   - Listar miembros (con role label, status, fecha de invite)
 *   - Invitar nuevo (email + role) — solo owner|admin
 *   - Cambiar rol — solo owner|admin, con guards server-side
 *   - Expulsar — soft delete (status='revoked')
 *
 * Los permisos los chequea el server-side; nosotros mostramos UI
 * pesimista (escondemos botones para roles que no pueden actuar) pero
 * el server es la fuente de verdad.
 */

import { useEffect, useState } from "react";
import { Plus, Trash2, ShieldCheck, UserMinus, AlertCircle, Mail, RefreshCw, KeyRound, Copy, X } from "lucide-react";
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import { useUIStore } from "../../store/uiStore";
import {
  listMembers, inviteMember, patchMemberRole, revokeMember, issueAccessCode,
  type MemberRow,
} from "../../lib/cloudAuth";
import { confirmAsync } from "../../lib/confirmAsync";
import { color, radius, space, text, weight } from "../../tokens";
import { cloudStyles } from "./cloudStyles";

const { title: titleStyle, desc: descStyle, card: cardStyle, label: labelStyle, input: inputStyle, btnPrimary, btnGhost } = cloudStyles;

const ROLE_LABELS: Record<string, string> = {
  owner: "Dueño",
  admin: "Encargado",
  vendedor: "Vendedor",
  viewer: "Solo lectura",
};

const INVITABLE_ROLES: Array<{ value: "admin" | "vendedor" | "viewer"; label: string; desc: string }> = [
  { value: "admin", label: "Encargado", desc: "Casi todo menos equipo y facturación: precios, catálogo, costos, borrar ventas." },
  { value: "vendedor", label: "Vendedor", desc: "Vende y cobra, crea clientes y leads, registra caja. No ve costos ni edita precios." },
  { value: "viewer", label: "Solo lectura", desc: "Ve todo, pero no crea ni edita nada." },
];

/** Qué puede hacer cada rol — leyenda visible en la sección de equipo. */
const ROLE_LEGEND: Array<{ label: string; desc: string }> = [
  { label: "Dueño", desc: "Control total: maneja el equipo, el plan y la facturación, y los ajustes del workspace. Incluye todo lo del Encargado." },
  { label: "Encargado", desc: "Casi todo: ve costos, edita precios, catálogo e inventario, borra ventas y clientes, regulariza y maneja pagos. No toca equipo ni facturación." },
  { label: "Vendedor", desc: "El día a día: crea ventas y cobra, crea y edita clientes y leads, registra caja. No ve costos, no edita precios ni borra." },
  { label: "Solo lectura", desc: "Ve la información del negocio pero no puede crear ni editar nada." },
];

export function CloudTeamSection() {
  const { jwt, userId, workspaces, activeWorkspaceId, currentRole, isLoggedIn } = useCloudAuthStore();
  const { showToast } = useUIStore();

  const loggedIn = isLoggedIn();
  const role = currentRole();
  const canManage = role === "owner" || role === "admin";
  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "vendedor" | "viewer">("vendedor");
  const [submitting, setSubmitting] = useState(false);
  // Estado del modal "Código de acceso" — cuando el owner clickea el
  // botón de un miembro invited, generamos código y mostramos en modal.
  const [accessCodeModal, setAccessCodeModal] = useState<null | {
    email: string;
    code: string;
    expiresInMin: number;
    generating?: boolean;
  }>(null);

  useEffect(() => {
    if (!loggedIn || !activeWorkspaceId) {
      setMembers(null);
      return;
    }
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, activeWorkspaceId, jwt]);

  async function loadMembers() {
    if (!activeWorkspaceId) return;
    setLoading(true);
    const res = await listMembers(jwt, activeWorkspaceId);
    setLoading(false);
    if (!res.ok) {
      showToast(`No se pudo cargar el equipo: ${res.error}`, "error");
      return;
    }
    setMembers(res.data.members);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspaceId) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email) { showToast("Escribí un email", "error"); return; }
    setSubmitting(true);
    const res = await inviteMember(jwt, activeWorkspaceId, email, inviteRole);
    setSubmitting(false);
    if (!res.ok) {
      const ERR: Record<string, string> = {
        already_member: "Ese email ya es miembro o tiene invitación pendiente.",
        invalid_email: "Email inválido.",
        invalid_role: "Rol inválido.",
        forbidden: "Tu rol no puede invitar.",
      };
      showToast(ERR[res.error] ?? `No se pudo invitar: ${res.error}`, "error");
      return;
    }
    setInviteEmail("");
    setShowInvite(false);
    showToast(`Invitación enviada a ${email}`, "success");
    loadMembers();
  }

  async function handleChangeRole(m: MemberRow, newRole: "admin" | "vendedor" | "viewer" | "owner") {
    if (!activeWorkspaceId) return;
    const res = await patchMemberRole(jwt, activeWorkspaceId, m.id, newRole);
    if (!res.ok) {
      const ERR: Record<string, string> = {
        only_owner_can_promote_to_owner: "Solo un Dueño puede crear otro Dueño.",
        cant_modify_self: "No podés cambiar tu propio rol.",
        workspace_needs_one_owner: "Tiene que haber al menos un Dueño activo.",
        forbidden: "Tu rol no puede cambiar miembros.",
      };
      showToast(ERR[res.error] ?? `No se pudo: ${res.error}`, "error");
      return;
    }
    showToast(`Rol actualizado a ${ROLE_LABELS[newRole]}`, "success");
    loadMembers();
  }

  async function handleIssueCode(m: MemberRow) {
    if (!activeWorkspaceId) return;
    setAccessCodeModal({ email: m.email, code: "", expiresInMin: 0, generating: true });
    const res = await issueAccessCode(jwt, activeWorkspaceId, m.id);
    if (!res.ok) {
      setAccessCodeModal(null);
      showToast(`No se pudo generar el código: ${res.error}`, "error");
      return;
    }
    setAccessCodeModal({
      email: res.data.email,
      code: res.data.code,
      expiresInMin: res.data.expiresInMin,
    });
  }

  function copyInstructionsToClipboard(): void {
    if (!accessCodeModal) return;
    const wsName = activeWs?.name ?? "el equipo";
    const text = `Hola! Te incluí en ${wsName} en Clozr.

1) Descargá Clozr (Windows): https://github.com/manw3b/clozr/releases/latest
2) Instalalo y abrí la app
3) Andá a Ajustes → Cuenta en la nube
4) Email: ${accessCodeModal.email}
5) Click "Enviar magic link" (si tira error de email, no importa)
6) Pegá este código en "Opción 2 — Pegá el código": ${accessCodeModal.code}

El código vence en ${accessCodeModal.expiresInMin} minutos.`;
    navigator.clipboard.writeText(text).then(
      () => showToast("Instrucciones copiadas al portapapeles", "success"),
      () => showToast("No se pudo copiar (manualmente: seleccioná el texto)", "error"),
    );
  }

  async function handleRevoke(m: MemberRow) {
    if (!activeWorkspaceId) return;
    // Confirm con modal. Originalmente la idea era undoable-toast pero
    // expulsar al equipo es una acción rara y crítica — un modal de
    // confirmación tiene más sentido que un toast efímero con "deshacer".
    const ok = await confirmAsync({
      title: "Expulsar del equipo",
      message: `¿Expulsar a ${m.email} del equipo? Puede ser re-invitado luego.`,
      confirmText: "Expulsar",
      tone: "danger",
    });
    if (!ok) return;
    const res = await revokeMember(jwt, activeWorkspaceId, m.id);
    if (!res.ok) {
      const ERR: Record<string, string> = {
        cant_revoke_self: "No podés expulsarte a vos mismo.",
        workspace_needs_one_owner: "No podés expulsar al último Dueño.",
        forbidden: "Tu rol no puede expulsar miembros.",
      };
      showToast(ERR[res.error] ?? `No se pudo: ${res.error}`, "error");
      return;
    }
    showToast(`${m.email} expulsado del equipo`);
    loadMembers();
  }

  /* ────────────────────────────────────────────────────────────────── */
  /* Empty states                                                        */
  /* ────────────────────────────────────────────────────────────────── */
  if (!loggedIn) {
    return (
      <div>
        <h2 style={titleStyle}>Equipo en la nube</h2>
        <p style={descStyle}>
          Para gestionar tu equipo en la nube primero tenés que conectar tu cuenta.
        </p>
        <div style={cardStyle}>
          <AlertCircle size={32} color={color.warning} style={{ margin: "0 auto 12px", display: "block" }} />
          <div style={{ textAlign: "center", fontSize: text.sm, color: color.textMuted }}>
            Andá a <strong style={{ color: color.text }}>Ajustes → Cuenta en la nube</strong> y
            entrá con tu email.
          </div>
        </div>
      </div>
    );
  }

  if (!activeWs) {
    return (
      <div>
        <h2 style={titleStyle}>Equipo en la nube</h2>
        <p style={descStyle}>
          Necesitás un negocio creado en la nube para invitar miembros.
        </p>
        <div style={cardStyle}>
          <AlertCircle size={32} color={color.warning} style={{ margin: "0 auto 12px", display: "block" }} />
          <div style={{ textAlign: "center", fontSize: text.sm, color: color.textMuted }}>
            Andá a <strong style={{ color: color.text }}>Ajustes → Cuenta en la nube</strong> y creá tu negocio.
          </div>
        </div>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────────── */
  /* Vista normal                                                        */
  /* ────────────────────────────────────────────────────────────────── */
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={titleStyle}>Equipo en la nube</h2>
        <button onClick={loadMembers} style={btnGhost} disabled={loading} title="Recargar">
          <RefreshCw size={13} />
        </button>
      </div>
      <p style={descStyle}>
        Miembros de <strong style={{ color: color.text }}>{activeWs.name}</strong>.
        Cada uno entra desde su PC con su email — sin compartir contraseñas.
      </p>

      {/* Acciones */}
      {canManage && !showInvite && (
        <button onClick={() => setShowInvite(true)} style={{ ...btnPrimary, marginBottom: 16 }}>
          <Plus size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Invitar miembro
        </button>
      )}

      {/* Form invitar */}
      {showInvite && (
        <form onSubmit={handleInvite} style={{ ...cardStyle, marginBottom: 16 }}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            autoFocus
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="encargado@gmail.com"
            disabled={submitting}
            style={inputStyle}
          />
          <label style={labelStyle}>Rol</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {INVITABLE_ROLES.map((r) => (
              <label
                key={r.value}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "10px 12px", borderRadius: 8,
                  background: inviteRole === r.value ? `${color.primary}11` : color.surface2,
                  border: `1px solid ${inviteRole === r.value ? color.primary : color.border}`,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio" name="invite-role" value={r.value}
                  checked={inviteRole === r.value}
                  onChange={() => setInviteRole(r.value)}
                  style={{ marginTop: 2 }}
                />
                <div>
                  <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
                    {r.label}
                  </div>
                  <div style={{ fontSize: text.xs, color: color.textDim, marginTop: 2 }}>
                    {r.desc}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: space[2] }}>
            <button type="submit" disabled={submitting} style={{ ...btnPrimary, flex: 1 }}>
              {submitting ? "Enviando..." : "Enviar invitación"}
            </button>
            <button
              type="button"
              onClick={() => { setShowInvite(false); setInviteEmail(""); }}
              disabled={submitting}
              style={btnGhost}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Leyenda de roles — qué puede hacer cada uno */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text, marginBottom: 10 }}>
          ¿Qué puede hacer cada rol?
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ROLE_LEGEND.map((r) => (
            <div key={r.label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <ShieldCheck size={15} color={color.primary} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <span style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>{r.label}</span>
                <span style={{ fontSize: text.xs, color: color.textDim }}> — {r.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lista miembros */}
      {loading && members === null && (
        <div style={{ fontSize: text.sm, color: color.textDim, textAlign: "center", padding: 20 }}>
          Cargando equipo…
        </div>
      )}
      {members !== null && members.length === 0 && (
        <div style={{ fontSize: text.sm, color: color.textDim, textAlign: "center", padding: 20 }}>
          Todavía no hay nadie en este equipo.
        </div>
      )}
      {members !== null && members.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {members.map((m) => {
            const isSelf = m.email === useCloudAuthStore.getState().email;
            const _ = userId; // referenced by isSelf via email; userId unused here
            void _;
            const roleLabel = ROLE_LABELS[m.role] ?? m.role;
            const isPending = m.status === "invited";
            return (
              <div key={m.id} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: space[3] }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: m.role === "owner" ? `${color.primary}22` : color.surface2,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <ShieldCheck size={18} color={m.role === "owner" ? color.primary : color.textDim} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text, display: "flex", gap: 8, alignItems: "center" }}>
                    {m.email}
                    {isSelf && <span style={{ fontSize: 10, color: color.textDim, fontWeight: 500 }}>(vos)</span>}
                  </div>
                  <div style={{ fontSize: text.xs, color: color.textDim, marginTop: 2, display: "flex", gap: 8, alignItems: "center" }}>
                    <strong style={{ color: color.textMuted }}>{roleLabel}</strong>
                    {isPending && (
                      <>
                        <span>·</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: color.warning }}>
                          <Mail size={10} /> Invitación pendiente
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {canManage && !isSelf && m.role !== "owner" && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {/* Botón "Generar código" SIEMPRE disponible mientras
                        Resend esté en sandbox — el email no le llega a
                        nadie que no sea vos. El miembro lo necesita tanto
                        para el primer login (status=invited) como para
                        re-loguearse si pierde la sesión (status=active).
                        Cuando verifiquemos dominio Resend, podemos ocultar
                        el botón para active y dejar solo para invited. */}
                    <button
                      onClick={() => handleIssueCode(m)}
                      style={{
                        ...btnGhost,
                        padding: "5px 10px",
                        color: color.primary,
                        borderColor: color.primary,
                      }}
                      title={isPending
                        ? "Generar código de acceso para compartir por WhatsApp"
                        : "Generar código para que vuelva a entrar (perdió sesión, otra PC, etc)"}
                    >
                      <KeyRound size={13} />
                      Generar código
                    </button>
                    {/* Quick role switcher */}
                    <select
                      value={m.role}
                      onChange={(e) => handleChangeRole(m, e.target.value as "admin" | "vendedor" | "viewer")}
                      style={{
                        padding: "4px 8px",
                        fontSize: text.xs,
                        background: color.surface2,
                        border: `1px solid ${color.border}`,
                        borderRadius: 6,
                        color: color.text,
                      }}
                    >
                      <option value="admin">Encargado</option>
                      <option value="vendedor">Vendedor</option>
                      <option value="viewer">Solo lectura</option>
                    </select>
                    <button
                      onClick={() => handleRevoke(m)}
                      style={{ ...btnGhost, padding: "5px 9px", color: color.danger }}
                      title="Expulsar"
                    >
                      <UserMinus size={13} />
                    </button>
                  </div>
                )}
                {m.role === "owner" && !isSelf && canManage && (
                  <button
                    onClick={() => handleRevoke(m)}
                    style={{ ...btnGhost, padding: "5px 9px", color: color.danger }}
                    title="Expulsar dueño"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal código de acceso */}
      {accessCodeModal && (
        <div
          onClick={() => !accessCodeModal.generating && setAccessCodeModal(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 480, width: "100%",
              background: color.surface, borderRadius: radius.lg,
              padding: 28, position: "relative",
              border: `1px solid ${color.border}`,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          >
            <button
              onClick={() => setAccessCodeModal(null)}
              disabled={accessCodeModal.generating}
              style={{
                position: "absolute", top: 12, right: 12,
                background: "transparent", border: "none",
                color: color.textMuted, cursor: "pointer", padding: 6,
                borderRadius: 6,
              }}
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <KeyRound size={20} color={color.primary} />
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: color.text }}>
                Código de acceso
              </h3>
            </div>
            <p style={{ fontSize: 13, color: color.textDim, marginTop: 4, marginBottom: 20, lineHeight: 1.5 }}>
              Compartile este código a <strong style={{ color: color.text }}>{accessCodeModal.email}</strong> por WhatsApp.
              Lo va a necesitar para entrar a Clozr.
            </p>

            {accessCodeModal.generating ? (
              <div style={{ textAlign: "center", padding: 30, color: color.textDim, fontSize: 13 }}>
                Generando código...
              </div>
            ) : (
              <>
                {/* Código gigante */}
                <div
                  style={{
                    fontFamily: "ui-monospace, 'SF Mono', Consolas, monospace",
                    fontSize: 38, fontWeight: 700, letterSpacing: 6,
                    padding: "20px 24px", background: color.surface2,
                    border: `2px solid ${color.borderStrong}`,
                    borderRadius: 12, textAlign: "center",
                    color: color.text, marginBottom: 16,
                    userSelect: "all",
                  }}
                >
                  {accessCodeModal.code.slice(0, 3)} {accessCodeModal.code.slice(3)}
                </div>

                <button
                  onClick={copyInstructionsToClipboard}
                  style={{
                    width: "100%", padding: "10px 16px", borderRadius: 8,
                    background: color.primary, color: "#fff", border: "none",
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <Copy size={14} />
                  Copiar instrucciones completas
                </button>

                <p style={{ fontSize: 12, color: color.textDim, lineHeight: 1.5, margin: 0 }}>
                  Vence en <strong style={{ color: color.textMuted }}>{accessCodeModal.expiresInMin} minutos</strong>.
                  La persona tiene que abrir Clozr → Ajustes → Cuenta en la nube → email + este código en "Opción 2".
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* styles compartidos viven en ./cloudStyles.ts */
