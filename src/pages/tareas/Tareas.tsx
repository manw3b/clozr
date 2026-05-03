import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Check } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/Button";
import { Tabs } from "../../components/Tabs";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { DataTable, type ColumnDef } from "../../components/data-table";
import { Modal, ModalField } from "../../components/Modal";
import { Input, Select } from "../../components/Input";
import { tasksDb } from "../../lib/db/tasks";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useAuthStore } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import { qk, invalidate } from "../../lib/queryKeys";
import { color, space, text, weight } from "../../tokens";
import type { Task as DbTask, TaskType } from "../../lib/db/types";

type FilterStatus = "todas" | "pendientes" | "completadas";
type FilterType = "todos" | TaskType;

export function Tareas() {
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";
  const qc = useQueryClient();
  const { showToast } = useUIStore();

  const [statusFilter, setStatusFilter] = useState<FilterStatus>("pendientes");
  const [typeFilter, setTypeFilter] = useState<FilterType>("todos");
  const [openForm, setOpenForm] = useState(false);

  const { data: tasks = [] } = useQuery({
    queryKey: qk.tasks(wid),
    queryFn: () => tasksDb.getAll(wid),
    enabled: !!wid,
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => tasksDb.toggleComplete(id, done),
    onSuccess: () => invalidate.afterTaskChange(qc, wid),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => tasksDb.remove(id),
    onSuccess: () => {
      invalidate.afterTaskChange(qc, wid);
      showToast("Tarea eliminada", "success");
    },
  });

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter === "pendientes" && t.completed === 1) return false;
      if (statusFilter === "completadas" && t.completed === 0) return false;
      if (typeFilter !== "todos" && t.type !== typeFilter) return false;
      return true;
    });
  }, [tasks, statusFilter, typeFilter]);

  const columns: ColumnDef<DbTask>[] = [
    {
      id: "completed",
      header: "",
      width: "44px",
      cell: (t) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMut.mutate({ id: t.id, done: t.completed === 0 });
          }}
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            border: `1.5px solid ${t.completed === 1 ? color.success : color.borderStrong}`,
            background: t.completed === 1 ? color.success : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          {t.completed === 1 && <Check size={12} color="#fff" strokeWidth={3} />}
        </button>
      ),
    },
    {
      id: "title",
      header: "Tarea",
      sortable: true,
      width: "minmax(280px, 1.5fr)",
      cell: (t) => (
        <span
          style={{
            fontSize: text.sm,
            fontWeight: weight.medium,
            color: t.completed === 1 ? color.textDim : color.text,
            textDecoration: t.completed === 1 ? "line-through" : "none",
          }}
        >
          {t.title}
        </span>
      ),
    },
    {
      id: "type",
      header: "Tipo",
      sortable: true,
      width: "120px",
      cell: (t) => (
        <Badge tone={t.type === "rutina" ? "info" : "neutral"}>
          {t.type === "rutina" ? "Rutina" : "Puntual"}
        </Badge>
      ),
    },
    {
      id: "due_at",
      header: "Vence",
      sortable: true,
      width: "140px",
      cell: (t) =>
        t.due_at ? (
          <span style={{ fontSize: text.sm, color: color.textMuted }}>
            {new Date(t.due_at).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
          </span>
        ) : (
          <span style={{ color: color.textDim }}>—</span>
        ),
    },
    {
      id: "actions",
      header: "",
      width: "60px",
      cell: (t) => (
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<Trash2 size={13} />}
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`¿Eliminar tarea "${t.title}"?`)) removeMut.mutate(t.id);
          }}
        />
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space[5], height: "100%" }}>
      <PageHeader
        title="Tareas"
        subtitle={`${filtered.length} de ${tasks.length}`}
        actions={
          <Button variant="primary" iconLeft={<Plus size={16} />} onClick={() => setOpenForm(true)}>
            Nueva tarea
          </Button>
        }
      />

      <div style={{ display: "flex", gap: space[3], flexWrap: "wrap" }}>
        <Tabs
          variant="pills"
          size="sm"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as FilterStatus)}
          items={[
            { value: "pendientes", label: "Pendientes" },
            { value: "completadas", label: "Completadas" },
            { value: "todas", label: "Todas" },
          ]}
        />
        <div style={{ flex: 1 }} />
        <Tabs
          variant="pills"
          size="sm"
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as FilterType)}
          items={[
            { value: "todos", label: "Todos los tipos" },
            { value: "puntual", label: "Puntuales" },
            { value: "rutina", label: "Rutinas" },
          ]}
        />
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <DataTable<DbTask>
          rows={filtered}
          columns={columns}
          getRowId={(t) => t.id}
          density="normal"
          empty={
            <EmptyState
              title={tasks.length === 0 ? "Sin tareas" : "Nada para mostrar con esos filtros"}
              description={
                tasks.length === 0
                  ? "Creá una tarea para no olvidarte nada."
                  : "Probá cambiar los filtros."
              }
              action={
                tasks.length === 0
                  ? { label: "Nueva tarea", onClick: () => setOpenForm(true), iconLeft: <Plus size={14} /> }
                  : undefined
              }
            />
          }
        />
      </div>

      <NewTaskModal open={openForm} onClose={() => setOpenForm(false)} />
    </div>
  );
}

function NewTaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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

  return (
    <Modal
      open={open}
      onClose={onClose}
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
