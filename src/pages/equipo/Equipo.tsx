import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Mail, Phone } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/Button";
import { Avatar } from "../../components/Avatar";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { DataTable, type ColumnDef } from "../../components/data-table";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuLabel,
  useContextMenu,
} from "../../components/ContextMenu";
import { openMail, openTel } from "../../lib/openExternal";
import { Modal, ModalField } from "../../components/Modal";
import { Input, Select } from "../../components/Input";
import { teamDb } from "../../lib/db/team";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useAuthStore, assertCan } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import { color, space, text, weight } from "../../tokens";
import { qk } from "../../lib/queryKeys";
import type { WorkspaceMember, MemberRole } from "../../lib/db/types";

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Propietario",
  admin: "Admin",
  vendedor: "Vendedor",
  viewer: "Solo lectura",
};

const ROLE_TONE: Record<MemberRole, "primary" | "info" | "neutral"> = {
  owner: "primary",
  admin: "info",
  vendedor: "neutral",
  viewer: "neutral",
};

export function Equipo() {
  const { activeWorkspace } = useWorkspaceStore();
  const { showToast } = useUIStore();
  const wid = activeWorkspace?.id ?? "";
  const qc = useQueryClient();
  const currentRole = useAuthStore((s) => s.userRole);
  const [openForm, setOpenForm] = useState(false);
  const ctxMenu = useContextMenu();
  const [ctxMember, setCtxMember] = useState<WorkspaceMember | null>(null);

  const { data: members = [] } = useQuery({
    queryKey: qk.team.list(wid),
    queryFn: () => teamDb.getMembers(wid),
    enabled: !!wid,
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => {
      assertCan(currentRole, "manageTeam");
      return teamDb.removeMember(wid, userId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.team.all() });
      showToast("Miembro eliminado", "success");
    },
  });

  const updateRoleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Exclude<MemberRole, "owner"> }) => {
      assertCan(currentRole, "manageTeam");
      return teamDb.updateRole(wid, userId, role);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.team.all() });
      showToast("Rol actualizado", "success");
    },
  });

  const columns: ColumnDef<WorkspaceMember>[] = [
    {
      id: "name",
      header: "Miembro",
      sortable: true,
      width: "minmax(220px, 1.5fr)",
      cell: (m) => (
        <div style={{ display: "flex", alignItems: "center", gap: space[3] }}>
          <Avatar name={m.name} size={32} bg={m.avatar_color ?? undefined} />
          <div>
            <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
              {m.name}
            </div>
            {m.role_description && (
              <div style={{ fontSize: text.xs, color: color.textMuted }}>{m.role_description}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "role",
      header: "Rol",
      sortable: true,
      width: "120px",
      cell: (m) => <Badge tone={ROLE_TONE[m.role]}>{ROLE_LABEL[m.role]}</Badge>,
    },
    {
      id: "email",
      header: "Email",
      width: "minmax(200px, 1fr)",
      cell: (m) =>
        m.email ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: space[2], color: color.textMuted, fontSize: text.sm }}>
            <Mail size={13} /> {m.email}
          </span>
        ) : (
          <span style={{ color: color.textDim }}>—</span>
        ),
    },
    {
      id: "phone",
      header: "Teléfono",
      width: "150px",
      cell: (m) =>
        m.phone ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: space[2], color: color.textMuted, fontSize: text.sm }}>
            <Phone size={13} /> {m.phone}
          </span>
        ) : (
          <span style={{ color: color.textDim }}>—</span>
        ),
    },
    {
      id: "actions",
      header: "",
      width: "200px",
      cell: (m) =>
        m.role === "owner" ? (
          <span style={{ fontSize: text.xs, color: color.textDim }}>—</span>
        ) : (
          <div style={{ display: "flex", gap: space[2] }}>
            <Select
              size="sm"
              value={m.role}
              onChange={(e) =>
                updateRoleMut.mutate({
                  userId: m.user_id,
                  role: e.target.value as Exclude<MemberRole, "owner">,
                })
              }
            >
              <option value="admin">Admin</option>
              <option value="vendedor">Vendedor</option>
              <option value="viewer">Solo lectura</option>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Trash2 size={13} />}
              onClick={() => {
                if (window.confirm(`¿Eliminar a ${m.name} del equipo?`)) {
                  removeMut.mutate(m.user_id);
                }
              }}
            />
          </div>
        ),
    },
  ];

  const canManage = currentRole === "owner";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space[5], height: "100%" }}>
      <PageHeader
        title="Equipo"
        subtitle={`${members.length} ${members.length === 1 ? "miembro" : "miembros"}`}
        actions={
          canManage ? (
            <Button variant="primary" iconLeft={<Plus size={16} />} onClick={() => setOpenForm(true)}>
              Invitar miembro
            </Button>
          ) : null
        }
      />

      <div style={{ flex: 1, minHeight: 0 }}>
        <DataTable<WorkspaceMember>
          rows={members}
          columns={columns}
          getRowId={(m) => m.user_id}
          onRowContextMenu={(m, e) => {
            setCtxMember(m);
            ctxMenu.openAt(e);
          }}
          density="normal"
          empty={
            <EmptyState
              title="Sin miembros"
              description="Invitá compañeros para que vean y operen este negocio."
              action={{ label: "Invitar miembro", onClick: () => setOpenForm(true), iconLeft: <Plus size={14} /> }}
            />
          }
        />
      </div>

      <AddMemberModal open={openForm} onClose={() => setOpenForm(false)} workspaceId={wid} />

      {ctxMenu.open && ctxMember && (
        <ContextMenu position={ctxMenu.position} onClose={ctxMenu.close}>
          <ContextMenuLabel>{ctxMember.name}</ContextMenuLabel>
          {ctxMember.email && (
            <ContextMenuItem
              icon={<Mail size={14} />}
              onClick={() => {
                if (ctxMember.email) openMail(ctxMember.email);
                ctxMenu.close();
              }}
            >
              Email
            </ContextMenuItem>
          )}
          {ctxMember.phone && (
            <ContextMenuItem
              icon={<Phone size={14} />}
              onClick={() => {
                if (ctxMember.phone) openTel(ctxMember.phone);
                ctxMenu.close();
              }}
            >
              Llamar
            </ContextMenuItem>
          )}
          {canManage && ctxMember.role !== "owner" && (
            <>
              <ContextMenuDivider />
              <ContextMenuItem
                tone="danger"
                icon={<Trash2 size={14} />}
                onClick={() => {
                  if (window.confirm(`¿Quitar a ${ctxMember.name} del equipo?`)) {
                    removeMut.mutate(ctxMember.user_id);
                  }
                  ctxMenu.close();
                }}
              >
                Quitar del equipo
              </ContextMenuItem>
            </>
          )}
        </ContextMenu>
      )}
    </div>
  );
}

function AddMemberModal({
  open,
  onClose,
  workspaceId,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
}) {
  const qc = useQueryClient();
  const { showToast } = useUIStore();
  const currentRole = useAuthStore((s) => s.userRole);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Exclude<MemberRole, "owner">>("vendedor");
  const [roleDesc, setRoleDesc] = useState("");

  const mut = useMutation({
    mutationFn: () => {
      assertCan(currentRole, "manageTeam");
      return teamDb.addMember(
        workspaceId,
        {
          name,
          email,
          phone: phone || null,
          role_description: roleDesc || null,
        },
        role,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.team.all() });
      showToast("Miembro agregado", "success");
      setName("");
      setEmail("");
      setPhone("");
      setRoleDesc("");
      setRole("vendedor");
      onClose();
    },
  });

  const canSubmit = name.trim().length >= 2 && email.trim().includes("@");

  const isDirty = () =>
    name.trim().length > 0 ||
    email.trim().length > 0 ||
    phone.trim().length > 0 ||
    roleDesc.trim().length > 0 ||
    role !== "vendedor";

  return (
    <Modal
      open={open}
      onClose={onClose}
      isDirty={isDirty}
      confirmCloseText="¿Cerrar y descartar la invitación?"
      title="Invitar miembro"
      maxWidth={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => mut.mutate()}
            disabled={!canSubmit}
            loading={mut.isPending}
          >
            Agregar
          </Button>
        </>
      }
    >
      <ModalField label="Nombre" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Carlos" autoFocus />
      </ModalField>
      <ModalField label="Email" required>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="carlos@ejemplo.com" />
      </ModalField>
      <ModalField label="Teléfono">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+54 9 11 …" />
      </ModalField>
      <ModalField label="Rol" required>
        <Select value={role} onChange={(e) => setRole(e.target.value as Exclude<MemberRole, "owner">)}>
          <option value="vendedor">Vendedor</option>
          <option value="admin">Admin</option>
          <option value="viewer">Solo lectura</option>
        </Select>
      </ModalField>
      <ModalField label="Descripción del rol">
        <Input value={roleDesc} onChange={(e) => setRoleDesc(e.target.value)} placeholder="Ej: Ventas zona norte" />
      </ModalField>
    </Modal>
  );
}
