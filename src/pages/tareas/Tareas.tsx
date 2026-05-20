import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Check } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/Button";
import { Tabs } from "../../components/Tabs";
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
import { tasksDb } from "../../lib/db/tasks";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useUIStore } from "../../store/uiStore";
import { useUndoableActions } from "../../store/useUndoableActions";
import { qk, invalidate } from "../../lib/queryKeys";
import { usePersistedState } from "../../lib/usePersistedState";
import { color, space, text, weight } from "../../tokens";
import { NewTaskModal } from "./components/NewTaskModal";
import { assignedTasksDb } from "../../lib/db/assignedTasks";
import { useAuthStore } from "../../store/authStore";
import type { Task as DbTask, TaskType } from "../../lib/db/types";

type FilterStatus = "todas" | "pendientes" | "completadas";
type FilterType = "todos" | TaskType;

export function Tareas() {
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";
  const qc = useQueryClient();
  const { showToast } = useUIStore();

  const [statusFilter, setStatusFilter] = usePersistedState<FilterStatus>("tareas.statusFilter", "pendientes");
  const [typeFilter, setTypeFilter] = usePersistedState<FilterType>("tareas.typeFilter", "todos");
  const [openForm, setOpenForm] = useState(false);
  const ctxMenu = useContextMenu();
  const [ctxTask, setCtxTask] = useState<DbTask | null>(null);

  useEffect(() => {
    const handler = () => setOpenForm(true);
    window.addEventListener("clozr:open-new-task", handler);
    return () => window.removeEventListener("clozr:open-new-task", handler);
  }, []);

  // Materializa templates obligatorios al abrir la pantalla. Es idempotente,
  // así que si el user ya entró hoy no duplica. Después de materializar,
  // invalida la query de tareas para que el render incluya las nuevas.
  const userId = useAuthStore((s) => s.userId);
  useEffect(() => {
    if (!wid || !userId) return;
    assignedTasksDb
      .materializeForToday(wid, userId)
      .then((n) => {
        if (n > 0) qc.invalidateQueries({ queryKey: qk.tasks.all() });
      })
      .catch(() => {
        /* best-effort: no rompemos la pantalla por esto */
      });
  }, [wid, userId, qc]);

  const { data: tasks = [] } = useQuery({
    queryKey: qk.tasks.list(wid),
    queryFn: () => tasksDb.getAll(wid),
    enabled: !!wid,
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => tasksDb.toggleComplete(id, done),
    onSuccess: () => invalidate.afterTaskChange(qc, wid),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => tasksDb.remove(id),
    // Toast e invalidate los maneja el undoable. Sólo invalidamos al final
    // por consistencia con queries derivadas.
    onSuccess: () => invalidate.afterTaskChange(qc, wid),
  });
  const registerUndo = useUndoableActions((s) => s.register);

  // Helper para los dos call sites (row delete + context menu delete).
  function undoableDeleteTask(t: DbTask) {
    // Guard: tareas obligatorias (materializadas de un template del
    // dueño) no se pueden borrar. El vendedor solo las puede completar.
    if (t.template_id) {
      showToast(
        "Esta tarea es obligatoria — solo el dueño puede sacarla desde Ajustes → Tareas obligatorias.",
        "error",
      );
      return;
    }
    const queryKey = qk.tasks.list(wid);
    const snapshot = qc.getQueryData<DbTask[]>(queryKey);
    qc.setQueryData<DbTask[]>(queryKey, (prev) =>
      prev ? prev.filter((x) => x.id !== t.id) : prev,
    );
    registerUndo({
      label: `Tarea eliminada: ${t.title}`,
      sublabel: t.due_at ? `Vencía ${new Date(t.due_at).toLocaleDateString("es-AR")}` : undefined,
      onUndo: () => {
        if (snapshot) qc.setQueryData(queryKey, snapshot);
      },
      commit: async () => {
        try {
          await removeMut.mutateAsync(t.id);
        } catch (e) {
          if (snapshot) qc.setQueryData(queryKey, snapshot);
          showToast(
            e instanceof Error ? e.message : "No se pudo eliminar",
            "error",
          );
        }
      },
    });
  }

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
            undoableDeleteTask(t);
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
          onRowContextMenu={(t, e) => {
            setCtxTask(t);
            ctxMenu.openAt(e);
          }}
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

      {ctxMenu.open && ctxTask && (
        <ContextMenu position={ctxMenu.position} onClose={ctxMenu.close}>
          <ContextMenuLabel>{ctxTask.title}</ContextMenuLabel>
          <ContextMenuItem
            icon={<Check size={14} />}
            onClick={() => {
              toggleMut.mutate({ id: ctxTask.id, done: ctxTask.completed === 0 });
              ctxMenu.close();
            }}
          >
            {ctxTask.completed === 1 ? "Marcar pendiente" : "Marcar completada"}
          </ContextMenuItem>
          <ContextMenuDivider />
          <ContextMenuItem
            tone="danger"
            icon={<Trash2 size={14} />}
            onClick={() => {
              const t = ctxTask;
              ctxMenu.close();
              undoableDeleteTask(t);
            }}
          >
            Eliminar
          </ContextMenuItem>
        </ContextMenu>
      )}
    </div>
  );
}

