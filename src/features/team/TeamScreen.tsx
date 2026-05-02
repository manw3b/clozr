import { useState, useCallback } from "react";
import { UserPlus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { teamDb } from "../../lib/db/team";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useAuthStore } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import Modal from "../../components/Modal";
import Select from "../../components/ui/Select";
import type { MemberRole, WorkspaceMember } from "../../lib/db/types";

const ASSIGNABLE_ROLES: Array<{ value: Exclude<MemberRole, "owner">; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "vendedor", label: "Vendedor" },
  { value: "viewer", label: "Viewer" },
];

const ROLE_BADGE: Record<MemberRole, { bg: string; color: string; label: string }> = {
  owner: { bg: "rgba(255,214,10,0.15)", color: "#FFD60A", label: "Owner" },
  admin: { bg: "rgba(10,132,255,0.15)", color: "#0A84FF", label: "Admin" },
  vendedor: { bg: "rgba(48,209,88,0.15)", color: "#30D158", label: "Vendedor" },
  viewer: { bg: "rgba(99,99,102,0.15)", color: "#636366", label: "Viewer" },
};

const AVATAR_COLORS = [
  "#E8001D", "#0A84FF", "#30D158", "#FFD60A",
  "#FF9F0A", "#BF5AF2", "#FF2D55", "#636366",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ModalState =
  | { type: "add" }
  | { type: "role"; member: WorkspaceMember };

function MemberAvatar({ name, color }: { name: string; color: string | null }) {
  const bg = color ?? "#E8001D";
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%",
      background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0,
    }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function TeamScreen() {
  const { activeWorkspace } = useWorkspaceStore();
  const { userId } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const wid = activeWorkspace?.id ?? "";

  const [modal, setModal] = useState<ModalState | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Add form state
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addRole, setAddRole] = useState<Exclude<MemberRole, "owner">>("vendedor");
  const [addRoleDesc, setAddRoleDesc] = useState("");
  const [addAvatarColor, setAddAvatarColor] = useState("#E8001D");
  const [addNotes, setAddNotes] = useState("");
  const [addError, setAddError] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);

  // Change role state
  const [newRole, setNewRole] = useState<Exclude<MemberRole, "owner">>("vendedor");

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["team", wid] });
  }, [queryClient, wid]);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team", wid],
    queryFn: () => teamDb.getMembers(wid),
    enabled: !!wid,
  });

  const roleMutation = useMutation({
    mutationFn: ({ uid, role }: { uid: string; role: Exclude<MemberRole, "owner"> }) =>
      teamDb.updateRole(wid, uid, role),
    onSuccess: () => {
      invalidate();
      setModal(null);
      showToast("Rol actualizado", "success");
    },
    onError: () => showToast("Error al actualizar el rol"),
  });

  const removeMutation = useMutation({
    mutationFn: (uid: string) => teamDb.removeMember(wid, uid),
    onSuccess: () => {
      invalidate();
      setConfirmDeleteId(null);
      showToast("Miembro eliminado", "success");
    },
    onError: () => showToast("Error al eliminar el miembro"),
  });

  const resetAddForm = () => {
    setAddName(""); setAddEmail(""); setAddPhone(""); setAddRole("vendedor");
    setAddRoleDesc(""); setAddAvatarColor("#E8001D"); setAddNotes(""); setAddError("");
  };

  const handleAdd = async () => {
    if (!addName.trim()) { setAddError("El nombre es obligatorio"); return; }
    if (!EMAIL_RE.test(addEmail.trim())) { setAddError("Email inválido"); return; }
    setAddError("");
    setAddSubmitting(true);
    try {
      await teamDb.addMember(
        wid,
        {
          name: addName,
          email: addEmail,
          phone: addPhone.trim() || null,
          role_description: addRoleDesc.trim() || null,
          avatar_color: addAvatarColor,
          notes: addNotes.trim() || null,
        },
        addRole,
      );
      invalidate();
      setModal(null);
      resetAddForm();
      showToast("Miembro agregado", "success");
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Error al agregar");
    } finally {
      setAddSubmitting(false);
    }
  };

  const openRoleModal = (member: WorkspaceMember) => {
    setNewRole(member.role === "owner" ? "admin" : member.role as Exclude<MemberRole, "owner">);
    setModal({ type: "role", member });
  };

  const totalCount = members.length;
  const adminCount = members.filter((m) => m.role === "owner" || m.role === "admin").length;
  const vendedorCount = members.filter((m) => m.role === "vendedor").length;

  const TH: React.CSSProperties = {
    padding: "10px 16px",
    textAlign: "left",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    background: "var(--bg)",
    zIndex: 1,
  };

  const TD: React.CSSProperties = {
    padding: "12px 16px",
    fontSize: 13.5,
    color: "var(--text-primary)",
    borderBottom: "1px solid var(--border)",
    verticalAlign: "middle",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 13.5,
    outline: "none",
    boxSizing: "border-box",
    transition: "background 0.12s ease",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "24px 28px 0", flexShrink: 0,
      }}>
        <h1 style={{ fontSize: 25, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.5 }}>
          Equipo
        </h1>
        <button
          onClick={() => setModal({ type: "add" })}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            height: 34, padding: "7px 14px", background: "var(--brand)",
            borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: "#fff",
            transition: "background 0.12s ease",
          }}
        >
          <UserPlus size={14} />
          Agregar miembro
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, padding: "24px 28px 0" }}>
        {[
          { label: "Total miembros", value: totalCount },
          { label: "Administradores", value: adminCount },
          { label: "Vendedores", value: vendedorCount },
        ].map((card) => (
          <div key={card.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 500, marginBottom: 6 }}>{card.label}</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.5 }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
        {isLoading ? (
          <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 13.5 }}>Cargando...</div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Nombre", "Email", "Teléfono", "Rol", "Descripción", "Fecha", "Acciones"].map((h) => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const badge = ROLE_BADGE[member.role] ?? ROLE_BADGE.viewer;
                  const isMe = member.user_id === userId;
                  const isOwner = member.role === "owner";
                  const isConfirming = confirmDeleteId === member.user_id;

                  return (
                    <tr key={member.user_id} style={{ borderBottom: "1px solid var(--border)" }}>
                      {/* Nombre */}
                      <td style={TD}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <MemberAvatar name={member.name} color={member.avatar_color} />
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontWeight: 500 }}>{member.name}</span>
                              {isMe && (
                                <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", background: "var(--surface-2)", color: "var(--text-tertiary)", borderRadius: 4 }}>
                                  Vos
                                </span>
                              )}
                            </div>
                            {member.notes && (
                              <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }} title={member.notes}>
                                {member.notes.length > 40 ? member.notes.slice(0, 40) + "…" : member.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td style={{ ...TD, color: "var(--text-secondary)" }}>{member.email}</td>

                      {/* Teléfono */}
                      <td style={{ ...TD, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {member.phone ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span>{member.phone}</span>
                            <a
                              href={`https://wa.me/${member.phone.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Contactar por WhatsApp"
                              style={{ fontSize: 11, fontWeight: 600, color: "#25D366", padding: "2px 6px", background: "rgba(37,211,102,0.12)", borderRadius: 4 }}
                            >
                              WA
                            </a>
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-tertiary)" }}>—</span>
                        )}
                      </td>

                      {/* Rol */}
                      <td style={TD}>
                        <span style={{ display: "inline-block", padding: "3px 9px", background: badge.bg, color: badge.color, borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                          {badge.label}
                        </span>
                      </td>

                      {/* Descripción del rol */}
                      <td style={{ ...TD, color: "var(--text-secondary)", fontSize: 12 }}>
                        {member.role_description ?? "—"}
                      </td>

                      {/* Fecha */}
                      <td style={{ ...TD, color: "var(--text-secondary)", fontSize: 12 }}>
                        {new Date(member.joined_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>

                      {/* Acciones */}
                      <td style={TD}>
                        {isConfirming ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>¿Eliminar?</span>
                            <button onClick={() => removeMutation.mutate(member.user_id)} style={{ fontSize: 12, fontWeight: 600, color: "var(--brand)", padding: "3px 8px", background: "rgba(232,0,29,0.1)", borderRadius: 5 }}>Sí</button>
                            <button onClick={() => setConfirmDeleteId(null)} style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "3px 8px" }}>No</button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 6 }}>
                            {!isOwner && (
                              <button
                                onClick={() => openRoleModal(member)}
                                style={{ padding: "5px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 600, transition: "background 0.12s ease" }}
                              >
                                Cambiar rol
                              </button>
                            )}
                            <button
                              onClick={() => !isOwner && setConfirmDeleteId(member.user_id)}
                              disabled={isOwner}
                              style={{ padding: "5px 12px", borderRadius: 8, background: "transparent", fontSize: 12.5, fontWeight: 600, color: isOwner ? "var(--text-tertiary)" : "var(--brand)", opacity: isOwner ? 0.4 : 1, cursor: isOwner ? "not-allowed" : "pointer", transition: "background 0.12s ease" }}
                            >
                              Eliminar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: agregar miembro */}
      <Modal
        isOpen={modal?.type === "add"}
        onClose={() => { setModal(null); resetAddForm(); }}
        title="Agregar miembro"
        maxWidth={520}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>Nombre completo *</label>
              <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Ej: Ana García" style={inputStyle} autoFocus />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>Email *</label>
              <input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="ana@ejemplo.com" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>Teléfono</label>
              <input type="tel" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} placeholder="+54 9 11..." style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>Rol en el equipo</label>
              <Select
                value={addRole}
                onChange={(v) => setAddRole(v as Exclude<MemberRole, "owner">)}
                options={ASSIGNABLE_ROLES}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>Descripción del rol</label>
            <input value={addRoleDesc} onChange={(e) => setAddRoleDesc(e.target.value)} placeholder="Ej: Vendedor zona norte" style={inputStyle} />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 8, display: "block" }}>Color de avatar</label>
            <div style={{ display: "flex", gap: 8 }}>
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAddAvatarColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: "50%", background: c,
                    border: addAvatarColor === c ? "3px solid #fff" : "3px solid transparent",
                    outline: addAvatarColor === c ? `2px solid ${c}` : "none",
                    transition: "outline 0.1s",
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>Notas internas</label>
            <textarea
              value={addNotes}
              onChange={(e) => setAddNotes(e.target.value)}
              placeholder="Observaciones sobre el miembro..."
              rows={2}
              style={{ ...inputStyle, resize: "none", lineHeight: 1.5 }}
            />
          </div>

          {addError && (
            <p style={{ fontSize: 12, color: "var(--brand)", padding: "8px 12px", background: "rgba(232,0,29,0.1)", borderRadius: 6 }}>
              {addError}
            </p>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
            <button onClick={() => { setModal(null); resetAddForm(); }} style={{ height: 34, padding: "7px 14px", background: "var(--surface-2)", borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", transition: "background 0.12s ease" }}>
              Cancelar
            </button>
            <button
              onClick={handleAdd}
              disabled={addSubmitting}
              style={{ height: 34, padding: "7px 14px", background: "var(--brand)", borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: "#fff", opacity: addSubmitting ? 0.6 : 1, transition: "background 0.12s ease" }}
            >
              {addSubmitting ? "Agregando..." : "Agregar miembro"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: cambiar rol */}
      <Modal isOpen={modal?.type === "role"} onClose={() => setModal(null)} title="Cambiar rol" maxWidth={400}>
        {modal?.type === "role" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{modal.member.name}</p>
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>{modal.member.email}</p>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>Nuevo rol</label>
              <Select
                value={newRole}
                onChange={(v) => setNewRole(v as Exclude<MemberRole, "owner">)}
                options={ASSIGNABLE_ROLES}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <button onClick={() => setModal(null)} style={{ height: 34, padding: "7px 14px", background: "var(--surface-2)", borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", transition: "background 0.12s ease" }}>Cancelar</button>
              <button
                onClick={() => roleMutation.mutate({ uid: modal.member.user_id, role: newRole })}
                disabled={roleMutation.isPending}
                style={{ height: 34, padding: "7px 14px", background: "var(--brand)", borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: "#fff", opacity: roleMutation.isPending ? 0.6 : 1, transition: "background 0.12s ease" }}
              >
                {roleMutation.isPending ? "Guardando..." : "Cambiar rol"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
