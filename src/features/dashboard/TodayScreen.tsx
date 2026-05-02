import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customersDb } from "../../lib/db/customers";
import { pipelineDb } from "../../lib/db/pipeline";
import { tasksDb } from "../../lib/db/tasks";
import { salesDb } from "../../lib/db/sales";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useAuthStore } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import { getInactiveDays, getTodayISO, formatCurrency, formatDate } from "../../lib/hooks";
import { INACTIVE_WARNING_DAYS } from "../../lib/constants";
import type { Task } from "../../lib/db/types";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "18px 20px",
      }}
    >
      <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6, fontWeight: 500 }}>
        {label}
      </p>
      <p style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.5 }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>{sub}</p>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 11,
      fontWeight: 600,
      color: "var(--text-tertiary)",
      textTransform: "uppercase",
      letterSpacing: "0.6px",
      marginBottom: 10,
    }}>
      {children}
    </h2>
  );
}

function TodayTaskItem({
  task,
  onToggle,
}: {
  task: Task;
  onToggle: (id: string, completed: boolean) => void;
}) {
  const done = task.completed === 1;
  return (
    <button
      onClick={() => onToggle(task.id, !done)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 12px",
        borderRadius: 8,
        textAlign: "left",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div style={{
        width: 18,
        height: 18,
        borderRadius: 5,
        border: `2px solid ${done ? "var(--brand)" : "var(--border-strong)"}`,
        background: done ? "var(--brand)" : "transparent",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.15s",
      }}>
        {done && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5l2.5 2.5 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <span style={{
        fontSize: 14,
        color: done ? "var(--text-tertiary)" : "var(--text-primary)",
        textDecoration: done ? "line-through" : "none",
        flex: 1,
      }}>
        {task.title}
      </span>
      <span style={{
        fontSize: 10,
        color: "var(--text-tertiary)",
        background: "var(--surface-2)",
        padding: "2px 6px",
        borderRadius: 4,
        flexShrink: 0,
      }}>
        {task.type === "rutina" ? "Rutina" : "Puntual"}
      </span>
    </button>
  );
}

export default function TodayScreen() {
  const { activeWorkspace } = useWorkspaceStore();
  const { userName } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const wid = activeWorkspace?.id ?? "";
  const today = getTodayISO();

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", wid],
    queryFn: () => customersDb.getAll(wid),
    enabled: !!wid,
  });

  const { data: pipeline = [], error: ep } = useQuery({
    queryKey: ["pipeline-open", wid],
    queryFn: () => pipelineDb.getAll(wid),
    enabled: !!wid,
  });

  const { data: tasks = [], error: et } = useQuery({
    queryKey: ["tasks", wid],
    queryFn: () => tasksDb.getAll(wid),
    enabled: !!wid,
  });

  const { data: monthSales = 0 } = useQuery({
    queryKey: ["sales-month", wid],
    queryFn: () => salesDb.getMonthTotal(wid),
    enabled: !!wid,
  });

  const { data: recentSales = [] } = useQuery({
    queryKey: ["sales-recent", wid],
    queryFn: () => salesDb.getRecent(wid, 4),
    enabled: !!wid,
  });

  useEffect(() => {
    if (ep) showToast("Error cargando pipeline");
    if (et) showToast("Error cargando tareas");
  }, [ep, et, showToast]);

  const todayTasks = tasks.filter((t) => {
    if (t.type === "rutina") return true;
    return t.due_at?.startsWith(today) ?? false;
  });

  const pendingCount = tasks.filter((t) => t.completed === 0).length;

  const urgentItems = pipeline.filter(
    (p) => getInactiveDays(p.last_activity_at, p.created_at) > INACTIVE_WARNING_DAYS,
  );

  const insights: string[] = [];
  const prospectNoContact = pipeline.filter(
    (p) => p.stage_id === "prospecto" && !p.last_activity_at,
  );
  if (prospectNoContact.length > 0)
    insights.push(`${prospectNoContact.length} lead${prospectNoContact.length > 1 ? "s" : ""} sin contactar`);
  const todayPoint = todayTasks.filter((t) => t.type === "puntual" && !t.completed);
  if (todayPoint.length > 0)
    insights.push(`${todayPoint.length} tarea${todayPoint.length > 1 ? "s" : ""} puntual${todayPoint.length > 1 ? "es" : ""} hoy`);
  if (urgentItems.length > 0)
    insights.push(`${urgentItems.length} lead${urgentItems.length > 1 ? "s" : ""} con más de ${INACTIVE_WARNING_DAYS}d sin actividad`);

  const handleToggleTask = async (id: string, completed: boolean) => {
    const prev = queryClient.getQueryData<Task[]>(["tasks", wid]);
    queryClient.setQueryData<Task[]>(["tasks", wid], (old = []) =>
      old.map((t) => (t.id === id ? { ...t, completed: completed ? 1 : 0 } : t)),
    );
    try {
      await tasksDb.toggleComplete(id, completed);
    } catch (e) {
      console.error("toggleTask error:", e);
      queryClient.setQueryData(["tasks", wid], prev);
      showToast("Error al actualizar tarea");
    }
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24, maxWidth: 1400 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.5 }}>
          {greeting()}{userName ? `, ${userName.split(" ")[0]}` : ""}
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 3 }}>
          {activeWorkspace?.name}
        </p>
      </div>

      {/* 4 metrics in a row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <MetricCard label="Clientes" value={customers.length} sub="total registrados" />
        <MetricCard label="Pipeline activo" value={pipeline.filter(p => p.status === "open").length} sub="leads en proceso" />
        <MetricCard label="Tareas pendientes" value={pendingCount} sub="sin completar" />
        <MetricCard label="Ventas del mes" value={formatCurrency(monthSales)} sub="ARS este mes" />
      </div>

      {/* 2-column content */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 24, alignItems: "start" }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {insights.length > 0 && (
            <section>
              <SectionTitle>Foco del día</SectionTitle>
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                overflow: "hidden",
              }}>
                {insights.map((insight, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "11px 16px",
                      borderBottom: i < insights.length - 1 ? "1px solid var(--border)" : "none",
                      fontSize: 13,
                      color: "var(--text-primary)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand)", flexShrink: 0 }} />
                    {insight}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle>Tareas del día</SectionTitle>
            {todayTasks.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Sin tareas para hoy</p>
            ) : (
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "4px 0",
              }}>
                {todayTasks.map((task) => (
                  <TodayTaskItem key={task.id} task={task} onToggle={handleToggleTask} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {urgentItems.length > 0 && (
            <section>
              <SectionTitle>Pipeline urgente</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {urgentItems.map((item) => {
                  const days = getInactiveDays(item.last_activity_at, item.created_at);
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: "11px 14px",
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                          {item.customer_name ?? "Sin nombre"}
                        </p>
                        <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
                          {item.stage_name}
                        </p>
                      </div>
                      <span style={{
                        padding: "3px 8px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        background: days > 14 ? "var(--red-bg)" : "var(--amber-bg)",
                        color: days > 14 ? "var(--brand-light)" : "var(--amber)",
                        flexShrink: 0,
                      }}>
                        {days}d
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {recentSales.length > 0 && (
            <section>
              <SectionTitle>Ventas recientes</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {recentSales.map((sale) => (
                  <div
                    key={sale.id}
                    style={{
                      padding: "11px 14px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                        {sale.customer_name ?? "Sin cliente"}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
                        {formatDate(sale.sale_date)}
                      </p>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                        ${sale.total.toLocaleString("es-AR")} USD
                      </p>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: sale.is_paid ? "var(--green)" : "var(--amber)",
                      }}>
                        {sale.is_paid ? "Pagado" : "Parcial"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
