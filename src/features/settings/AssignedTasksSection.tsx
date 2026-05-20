import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Clock, Target, Users as UsersIcon } from "lucide-react";
import { Button } from "../../components/Button";
import { Modal, ModalField } from "../../components/Modal";
import { Input, Select } from "../../components/Input";
import { EmptyState } from "../../components/EmptyState";
import { ConfirmDeleteModal } from "../../components/ConfirmDeleteModal";
import { assignedTasksDb, type CreateTemplateInput } from "../../lib/db/assignedTasks";
import { teamDb } from "../../lib/db/team";
import { useAuthStore, can, assertCan } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import { qk } from "../../lib/queryKeys";
import { color, space, text, weight } from "../../tokens";
import type { AssignedTaskTemplate } from "../../lib/db/types";

/**
 * Sección "Tareas obligatorias del equipo" en Ajustes — accesible solo
 * para owner/admin. Permite definir rutinas que el sistema materializa
 * todos los días en el Mi Día / Tareas del vendedor asignado (o de
 * todos si no se elige uno).
 *
 * Ejemplos de uso:
 *  - "Subir historia a las 10:00" → daily, target_time=10:00, sin count
 *  - "Seguir 30 personas" → daily, target_count=30, contador +1
 *  - "Llamar 50 clientes activos" → daily, target_count=50
 *
 * El vendedor no puede borrar tareas con template_id seteado.
 */
export function AssignedTasksSection({ wid }: { wid: string }) {
  const role = useAuthStore((s) => s.userRole);
  const allowed = can(role, "manageAssignedTasks");
  const qc = useQueryClient();
  const { showToast } = useUIStore();

  const [editing, setEditing] = useState<AssignedTaskTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<AssignedTaskTemplate | null>(null);

  const templatesQ = useQuery({
    queryKey: ["assigned-task-templates", wid],
    queryFn: () => assignedTasksDb.getTemplates(wid),
    enabled: !!wid && allowed,
  });

  const membersQ = useQuery({
    queryKey: qk.team.list(wid),
    queryFn: () => teamDb.getMembers(wid),
    enabled: !!wid && allowed,
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => {
      assertCan(role, "manageAssignedTasks");
      return assignedTasksDb.removeTemplate(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assigned-task-templates"] });
      showToast("Tarea obligatoria eliminada", "success");
    },
  });

  if (!allowed) {
    return (
      <EmptyState
        icon={<Target size={24} />}
        title="Sin acceso"
        description="Solo el dueño o encargado puede gestionar las tareas obligatorias del equipo."
      />
    );
  }

  const templates = templatesQ.data ?? [];
  const members = membersQ.data ?? [];
  const memberById = new Map(members.map((m) => [m.user_id, m]));

  return (
    <div>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: space[5] }}>
        <div>
          <h2 style={{ margin: 0, fontSize: text.lg, fontWeight: weight.bold, color: color.text, letterSpacing: "-0.2px" }}>
            Tareas obligatorias del equipo
          </h2>
          <p style={{ margin: "4px 0 0 0", fontSize: text.sm, color: color.textDim }}>
            Definí rutinas que cada vendedor tiene que cumplir. El sistema las arma cada día en su Mi Día.
          </p>
        </div>
        <Button variant="primary" size="md" iconLeft={<Plus size={14} />} onClick={() => setCreating(true)}>
          Nueva
        </Button>
      </header>

      {templates.length === 0 ? (
        <EmptyState
          icon={<Target size={24} />}
          title="Sin tareas obligatorias todavía"
          description='Ejemplos: "Subir historia a las 10:00", "Seguir 30 personas", "Llamar a 20 clientes inactivos".'
          action={{ label: "Crear primera", onClick: () => setCreating(true), iconLeft: <Plus size={14} /> }}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
          {templates.map((t) => {
            const assignee = t.assigned_to_user_id ? memberById.get(t.assigned_to_user_id) : null;
            return (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: space[3],
                  padding: space[3],
                  background: color.surface,
                  border: `1px solid ${color.border}`,
                  borderRadius: 10,
                  opacity: t.is_active === 1 ? 1 : 0.55,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: text.sm,
                      fontWeight: weight.semibold,
                      color: color.text,
                      marginBottom: 2,
                    }}
                  >
                    {t.title}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: space[2], fontSize: text.xs, color: color.textMuted }}>
                    <Meta>
                      {t.frequency === "daily" ? "Diaria" : t.frequency === "weekly" ? "Semanal" : "Mensual"}
                    </Meta>
                    {t.target_time && (
                      <Meta>
                        <Clock size={11} /> {t.target_time}
                      </Meta>
                    )}
                    {t.target_count && (
                      <Meta>
                        <Target size={11} /> Meta: {t.target_count}
                      </Meta>
                    )}
                    <Meta>
                      <UsersIcon size={11} />
                      {assignee
                        ? assignee.name
                        : t.assigned_to_user_id
                          ? "(usuario sin datos)"
                          : "Todos los vendedores"}
                    </Meta>
                    {t.is_active === 0 && (
                      <span style={{ color: color.warning, fontWeight: weight.semibold }}>
                        Pausada
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <div style={{ marginTop: 4, fontSize: text.xs, color: color.textDim }}>
                      {t.description}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setEditing(t)}
                  className="btn-icon muted"
                  style={{ width: 28, height: 28, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                  aria-label="Editar"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => setToDelete(t)}
                  className="btn-icon danger"
                  style={{ width: 28, height: 28, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                  aria-label="Eliminar"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <TemplateFormModal
          open
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          wid={wid}
          template={editing}
          members={members.filter((m) => m.role !== "owner")}
        />
      )}

      {toDelete && (
        <ConfirmDeleteModal
          open
          onClose={() => setToDelete(null)}
          title={`Eliminar "${toDelete.title}"`}
          description={
            <>
              La tarea deja de materializarse cada día. Las instancias ya
              creadas en el histórico de los vendedores quedan como están
              (no se borran retroactivamente).
            </>
          }
          confirmText={toDelete.title}
          confirmLabel="Eliminar"
          onConfirm={async () => {
            await new Promise<void>((resolve, reject) =>
              removeMut.mutate(toDelete.id, {
                onSuccess: () => resolve(),
                onError: (err) => {
                  showToast(err instanceof Error ? err.message : "Error", "error");
                  reject(err);
                },
              }),
            );
          }}
        />
      )}
    </div>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 7px",
        background: color.surface2,
        border: `1px solid ${color.border}`,
        borderRadius: 4,
      }}
    >
      {children}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────
 *  Form modal (create + edit)
 * ──────────────────────────────────────────────────────────────────── */

function TemplateFormModal({
  open,
  onClose,
  wid,
  template,
  members,
}: {
  open: boolean;
  onClose: () => void;
  wid: string;
  template: AssignedTaskTemplate | null;
  members: { user_id: string; name: string }[];
}) {
  const role = useAuthStore((s) => s.userRole);
  const userId = useAuthStore((s) => s.userId);
  const qc = useQueryClient();
  const { showToast } = useUIStore();
  const editing = !!template;

  const [title, setTitle] = useState(template?.title ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">(
    template?.frequency ?? "daily",
  );
  const [targetTime, setTargetTime] = useState(template?.target_time ?? "");
  const [targetCount, setTargetCount] = useState(
    template?.target_count ? String(template.target_count) : "",
  );
  const [assignedTo, setAssignedTo] = useState<string>(template?.assigned_to_user_id ?? "");
  const [isActive, setIsActive] = useState<boolean>((template?.is_active ?? 1) === 1);

  useEffect(() => {
    if (!open) return;
    setTitle(template?.title ?? "");
    setDescription(template?.description ?? "");
    setFrequency(template?.frequency ?? "daily");
    setTargetTime(template?.target_time ?? "");
    setTargetCount(template?.target_count ? String(template.target_count) : "");
    setAssignedTo(template?.assigned_to_user_id ?? "");
    setIsActive((template?.is_active ?? 1) === 1);
  }, [open, template]);

  const mut = useMutation({
    mutationFn: async () => {
      assertCan(role, "manageAssignedTasks");
      const payload: CreateTemplateInput = {
        title: title.trim(),
        description: description.trim() || null,
        frequency,
        target_time: targetTime.trim() || null,
        target_count: targetCount.trim() ? parseInt(targetCount, 10) : null,
        assigned_to_user_id: assignedTo || null,
        created_by: userId ?? null,
      };
      if (editing && template) {
        await assignedTasksDb.updateTemplate(template.id, {
          ...payload,
          is_active: isActive ? 1 : 0,
        });
      } else {
        await assignedTasksDb.createTemplate(wid, payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assigned-task-templates"] });
      showToast(editing ? "Tarea actualizada" : "Tarea creada", "success");
      onClose();
    },
  });

  const canSubmit = title.trim().length >= 2;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Editar tarea obligatoria" : "Nueva tarea obligatoria"}
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
            {editing ? "Guardar" : "Crear"}
          </Button>
        </>
      }
    >
      <ModalField label="Qué hay que hacer" required>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='Ej: "Subir historia a Instagram", "Seguir 30 personas"'
          autoFocus
        />
      </ModalField>

      <ModalField label="Descripción / detalle (opcional)">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Notas adicionales para el vendedor"
        />
      </ModalField>

      <ModalField label="Frecuencia" required>
        <Select value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}>
          <option value="daily">Diaria (todos los días)</option>
          <option value="weekly">Semanal (una vez por semana)</option>
          <option value="monthly">Mensual (una vez por mes)</option>
        </Select>
      </ModalField>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: space[3] }}>
        <ModalField
          label="Horario sugerido"
          hint="Solo recordatorio. Formato 24h"
        >
          <Input
            type="time"
            value={targetTime}
            onChange={(e) => setTargetTime(e.target.value)}
          />
        </ModalField>

        <ModalField
          label="Meta numérica"
          hint='Si es "seguir 30 personas", poné 30'
        >
          <Input
            type="number"
            min="1"
            value={targetCount}
            onChange={(e) => setTargetCount(e.target.value)}
            placeholder="—"
          />
        </ModalField>
      </div>

      <ModalField
        label="Asignar a"
        hint="Si lo dejás vacío, se aplica a TODOS los vendedores"
      >
        <Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
          <option value="">— Todos los vendedores —</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.name}
            </option>
          ))}
        </Select>
      </ModalField>

      {editing && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: space[2],
            marginTop: space[2],
            fontSize: text.sm,
            color: color.textMuted,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Activa (si la desactivás, deja de materializarse pero queda guardada)
        </label>
      )}
    </Modal>
  );
}
