import { useState, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tasksDb } from "../../lib/db/tasks";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useAuthStore } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import { formatDate } from "../../lib/hooks";
import TaskForm, { formatFrequencyLabel } from "./TaskForm";
import type { Task, CreateTaskInput } from "../../lib/db/types";

type FilterStatus = "pendientes" | "completadas" | "todas";
type FilterType = "todas" | "rutina" | "puntual";

const STATUS_FILTERS: Array<{ value: FilterStatus; label: string }> = [
  { value: "pendientes", label: "Pendientes" },
  { value: "completadas", label: "Completadas" },
  { value: "todas", label: "Todas" },
];

function TaskItem({
  task,
  onToggle,
  onDelete,
}: {
  task: Task;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const done = task.completed === 1;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 8,
        background: hovered ? "var(--surface-2)" : "transparent",
        transition: "background 0.12s ease",
      }}
    >
      <button
        onClick={() => onToggle(task.id, !done)}
        style={{
          width: 20,
          height: 20,
          borderRadius: 5,
          border: `2px solid ${done ? "var(--primary)" : "var(--border-strong)"}`,
          background: done ? "var(--primary)" : "transparent",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s",
        }}
      >
        {done && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5l2.5 2.5 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        )}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13.5,
          fontWeight: 500,
          color: done ? "var(--text-dim)" : "var(--text)",
          textDecoration: done ? "line-through" : "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          transition: "color 0.15s",
        }}>
          {task.title}
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 2, alignItems: "center" }}>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--text-dim)",
            background: "var(--surface-2)",
            padding: "1px 6px",
            borderRadius: 4,
          }}>
            {task.type === "rutina"
            ? `Rutina · ${formatFrequencyLabel(task.frequency, task.custom_days ?? null)}`
            : "Puntual"}
          </span>
          {task.due_at && task.type === "puntual" && (
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
              {formatDate(task.due_at)}
            </span>
          )}
          {done && task.completed_at && (
            <span style={{ fontSize: 11, color: "var(--success)" }}>
              ✓ {formatDate(task.completed_at)}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => onDelete(task.id)}
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: 6,
          color: "var(--text-dim)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.1s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--primary-hover)";
          e.currentTarget.style.background = "var(--danger-bg)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--text-dim)";
          e.currentTarget.style.background = "transparent";
        }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function TasksScreen() {
  const { activeWorkspace } = useWorkspaceStore();
  const { userId } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const wid = activeWorkspace?.id ?? "";

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("pendientes");
  const [filterType, setFilterType] = useState<FilterType>("todas");

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", wid],
    queryFn: () => tasksDb.getAll(wid),
    enabled: !!wid,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["tasks", wid] }),
    [queryClient, wid],
  );

  const createMutation = useMutation({
    mutationFn: (data: CreateTaskInput) => tasksDb.create(wid, data),
    onSuccess: () => {
      invalidate();
      showToast("Tarea creada", "success");
    },
    onError: () => showToast("Error al crear tarea"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      tasksDb.toggleComplete(id, completed),
    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks", wid] });
      const prev = queryClient.getQueryData<Task[]>(["tasks", wid]);
      queryClient.setQueryData<Task[]>(["tasks", wid], (old = []) =>
        old.map((t) => (t.id === id ? { ...t, completed: completed ? 1 : 0 } : t)),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(["tasks", wid], ctx?.prev);
      showToast("Error al actualizar tarea");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tasksDb.remove(id),
    onSuccess: () => {
      invalidate();
      showToast("Tarea eliminada", "success");
    },
    onError: () => showToast("Error al eliminar tarea"),
  });

  const filtered = tasks.filter((t) => {
    if (filterType !== "todas" && t.type !== filterType) return false;
    if (filterStatus === "pendientes") return t.completed === 0;
    if (filterStatus === "completadas") return t.completed === 1;
    return true;
  });

  const pendingCount = tasks.filter((t) => t.completed === 0).length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", height: "100%", overflow: "hidden" }}>
      {/* Left: task list */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "24px 28px 0", flexShrink: 0 }}>
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 25, fontWeight: 700, color: "var(--text)", letterSpacing: -0.5 }}>
              Tareas
            </h1>
            {pendingCount > 0 && (
              <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 4 }}>
                {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          {/* Filter row */}
          <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)" }}>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilterStatus(f.value)}
                style={{
                  padding: "8px 14px",
                  fontSize: 13.5,
                  fontWeight: filterStatus === f.value ? 600 : 400,
                  color: filterStatus === f.value ? "var(--primary)" : "var(--text-muted)",
                  borderBottom: filterStatus === f.value ? "2px solid var(--primary)" : "2px solid transparent",
                  marginBottom: -1,
                  transition: "background 0.12s ease",
                  whiteSpace: "nowrap",
                }}
              >
                {f.label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            {(["todas", "puntual", "rutina"] as FilterType[]).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                style={{
                  padding: "6px 12px",
                  fontSize: 12.5,
                  fontWeight: filterType === t ? 600 : 400,
                  color: filterType === t ? "var(--text)" : "var(--text-dim)",
                  marginBottom: 4,
                  borderRadius: 8,
                  background: filterType === t ? "var(--surface-2)" : "transparent",
                  transition: "background 0.12s ease",
                  alignSelf: "center",
                }}
              >
                {t === "todas" ? "Todas" : t === "puntual" ? "Puntuales" : "Rutinas"}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflow: "auto", padding: "8px 12px 24px" }}>
          {isLoading ? (
            <p style={{ padding: "12px", color: "var(--text-dim)", fontSize: 13 }}>Cargando...</p>
          ) : filtered.length === 0 ? (
            <p style={{ padding: "48px 12px", textAlign: "center", color: "var(--text-dim)", fontSize: 14 }}>
              {filterStatus === "pendientes" ? "Sin tareas pendientes" : "Sin tareas"}
            </p>
          ) : (
            filtered.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onToggle={(id, completed) => toggleMutation.mutate({ id, completed })}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: quick create */}
      <div style={{
        borderLeft: "1px solid var(--border)",
        background: "var(--surface)",
        padding: 24,
        overflow: "auto",
        flexShrink: 0,
      }}>
        <h2 style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-muted)",
          marginBottom: 24,
        }}>
          Nueva tarea
        </h2>
        <TaskForm
          inline
          onSubmit={(data) =>
            createMutation.mutateAsync({ ...data, created_by: userId ?? undefined })
          }
          onCancel={() => {}}
        />
      </div>
    </div>
  );
}
