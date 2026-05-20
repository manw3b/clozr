import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal, ModalField } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { Input, Select } from "../../../components/Input";
import { tasksDb } from "../../../lib/db/tasks";
import { useWorkspaceStore } from "../../../store/workspaceStore";
import { useAuthStore } from "../../../store/authStore";
import { useUIStore } from "../../../store/uiStore";
import { invalidate } from "../../../lib/queryKeys";
import type { TaskType } from "../../../types/domain";

/**
 * Modal "Nueva tarea" — usado por Tareas (botón principal) y Mi Día
 * (atajo rápido sin salir del dashboard).
 *
 * Estaba inline dentro de Tareas.tsx pero lo extrajimos para que Mi Día
 * pueda mostrarlo sin navegar a la screen completa. Mi Día son atajos
 * de día a día; Tareas es la vista full para gestionar el backlog.
 */
export function NewTaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeWorkspace } = useWorkspaceStore();
  const { userId } = useAuthStore();
  const qc = useQueryClient();
  const { showToast } = useUIStore();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("puntual");
  const [dueAt, setDueAt] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      tasksDb.create(activeWorkspace?.id ?? "", {
        title: title.trim(),
        type,
        due_at: dueAt || null,
        created_by: userId ?? null,
      }),
    onSuccess: () => {
      invalidate.afterTaskChange(qc, activeWorkspace?.id ?? "");
      showToast("Tarea creada", "success");
      setTitle("");
      setDueAt("");
      setType("puntual");
      onClose();
    },
  });

  const canSubmit = title.trim().length >= 2;

  const isDirty = () =>
    title.trim().length > 0 || dueAt.trim().length > 0 || type !== "puntual";

  return (
    <Modal
      open={open}
      onClose={onClose}
      isDirty={isDirty}
      confirmCloseText="¿Cerrar y descartar la tarea?"
      title="Nueva tarea"
      maxWidth={480}
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
            Crear
          </Button>
        </>
      }
    >
      <ModalField label="Qué hay que hacer" required>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej: Llamar a Carlos"
          autoFocus
        />
      </ModalField>
      <ModalField label="Tipo" required>
        <Select value={type} onChange={(e) => setType(e.target.value as TaskType)}>
          <option value="puntual">Puntual (se completa una sola vez)</option>
          <option value="rutina">Rutina (se reinicia diariamente)</option>
        </Select>
      </ModalField>
      {type === "puntual" && (
        <ModalField label="Vencimiento" hint="Opcional">
          <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </ModalField>
      )}
    </Modal>
  );
}
