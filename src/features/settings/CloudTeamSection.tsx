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
import { Plus, Trash2, ShieldCheck, UserMinus, AlertCircle, Mail, RefreshCw } from "lucide-react";
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import { useUIStore } from "../../store/uiStore";
import {
  listMembers, inviteMember, patchMemberRole, revokeMember,
  type MemberRow,
} from "../../lib/cloudAuth";
import { color, radius, space, text, weight } from "../../tokens";

const ROLE_LABELS: Record<string, string> = {
  owner: "Dueño",
  admin: "Encargado",
  vendedor: "Vendedor",
  viewer: "Solo lectura",
};

const INVITABLE_ROLES: Array<{ value: "admin" | "vendedor" | "viewer"; label: string; desc: string }> = [
  { value: "admin", label: "Encargado", desc: "Casi todo menos cambios críticos." },
  { value: "vendedor", label: "Vendedor", desc: "Vende, crea clientes, cobra." },
  { value: "viewer", label: "Solo lectura", desc: "Ve pero no edita." },
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

  async function handleRevoke(m: MemberRow) {
    if (!activeWorkspaceId) return;
    // Confirmar inline con un toast-no-confirm: en lugar de modal, usamos
    // toast con undo (TODO: usar useUndoableActions). Por ahora directo.
    if (!confirm(`¿Expulsar a ${m.email} del equipo? Puede ser re-invitado luego.`)) return;
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
                  <div style={{ display: "flex", gap: 6 }}>
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
    </div>
  );
}

/* ── styles (copy-paste de CloudAccountSection — quizás extraer luego) ─ */

const titleStyle: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, color: color.text,
  letterSpacing: -0.2, marginBottom: 4,
};
const descStyle: React.CSSProperties = {
  fontSize: 13, color: color.textDim, marginBottom: 20, lineHeight: 1.5,
};
const cardStyle: React.CSSProperties = {
  padding: space[4], background: color.surface,
  border: `1px solid ${color.border}`, borderRadius: radius.lg,
  maxWidth: 640,
};
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: color.textMuted,
  marginBottom: 6, display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px",
  background: color.surface2, border: `1px solid ${color.borderStrong}`,
  borderRadius: 8, color: color.text, fontSize: 13, outline: "none",
  boxSizing: "border-box", marginBottom: 14,
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 18px", background: color.primary,
  borderRadius: 8, fontSize: 13, fontWeight: 600,
  color: "#fff", border: "none", cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "6px 12px", background: "transparent",
  border: `1px solid ${color.border}`, borderRadius: 8,
  color: color.textMuted, fontSize: 12, fontWeight: 500, cursor: "pointer",
};
