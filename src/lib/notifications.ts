/**
 * Hook para contar notificaciones reales que un vendedor querría ver:
 * - Tareas vencidas (puntuales con due_at < hoy y completed=0)
 * - Cobros vencidos (sales con balance > 0 y created_at > 30 días)
 * - Leads estancados (>7 días en la misma columna)
 */
import { useQuery } from "@tanstack/react-query";
import { dbSelect } from "./db/index";
import { useWorkspaceStore } from "../store/workspaceStore";
import { qk } from "./queryKeys";

export interface NotificationCounts {
  overdueTasks: number;
  overdueCollections: number;
  stuckLeads: number;
  total: number;
}

export interface NotificationItem {
  id: string;
  kind: "task" | "collection" | "lead";
  title: string;
  subtitle: string;
  daysOverdue: number;
  /** Pantalla a abrir cuando hacés click */
  screen: "tasks" | "cash" | "pipeline";
}

async function getCounts(workspaceId: string): Promise<{
  counts: NotificationCounts;
  items: NotificationItem[];
}> {
  if (!workspaceId) return { counts: { overdueTasks: 0, overdueCollections: 0, stuckLeads: 0, total: 0 }, items: [] };

  // Defensivo: cada query envuelta en try/catch para que si una tabla/columna
  // no existe en una DB vieja, las otras notificaciones sigan funcionando y
  // no rompamos toda la app con un toast de error global.
  const safeSelect = async <T>(sql: string, params: unknown[]): Promise<T[]> => {
    try {
      return await dbSelect<T>(sql, params);
    } catch {
      return [];
    }
  };
  const [tasks, collections, leads] = await Promise.all([
    safeSelect<{ id: string; title: string; due_at: string }>(
      `SELECT id, title, due_at FROM tasks
       WHERE workspace_id = ? AND completed = 0 AND type = 'puntual'
         AND due_at IS NOT NULL AND date(due_at) < date('now')
       ORDER BY due_at ASC LIMIT 20`,
      [workspaceId],
    ),
    safeSelect<{ id: string; customer_name: string | null; balance: number; created_at: string }>(
      `SELECT id, customer_name, balance, created_at FROM sales
       WHERE workspace_id = ? AND is_paid = 0 AND balance > 0
         AND date(created_at) < date('now', '-30 days')
       ORDER BY created_at ASC LIMIT 20`,
      [workspaceId],
    ),
    safeSelect<{ id: string; customer_name: string | null; stage_name: string; updated_at: string }>(
      `SELECT id, customer_name, stage_name, updated_at FROM pipeline_items
       WHERE workspace_id = ? AND status = 'open'
         AND CAST((julianday('now') - julianday(COALESCE(updated_at, created_at))) AS INTEGER) >= 7
       ORDER BY updated_at ASC LIMIT 20`,
      [workspaceId],
    ),
  ]);

  const items: NotificationItem[] = [];
  const now = Date.now();

  for (const t of tasks) {
    const days = Math.floor((now - new Date(t.due_at).getTime()) / 86_400_000);
    items.push({
      id: `task-${t.id}`,
      kind: "task",
      title: t.title,
      subtitle: `Tarea vencida hace ${days} día${days === 1 ? "" : "s"}`,
      daysOverdue: days,
      screen: "tasks",
    });
  }

  for (const c of collections) {
    const days = Math.floor((now - new Date(c.created_at).getTime()) / 86_400_000) - 30;
    items.push({
      id: `collection-${c.id}`,
      kind: "collection",
      title: c.customer_name ?? "Cobro pendiente",
      subtitle: `Cobro vencido hace ${days} día${days === 1 ? "" : "s"}`,
      daysOverdue: days,
      screen: "cash",
    });
  }

  for (const l of leads) {
    const days = Math.floor((now - new Date(l.updated_at).getTime()) / 86_400_000);
    items.push({
      id: `lead-${l.id}`,
      kind: "lead",
      title: l.customer_name ?? "Lead",
      subtitle: `Estancado en ${l.stage_name} hace ${days} días`,
      daysOverdue: days,
      screen: "pipeline",
    });
  }

  // Sort by days overdue desc (most urgent first)
  items.sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    counts: {
      overdueTasks: tasks.length,
      overdueCollections: collections.length,
      stuckLeads: leads.length,
      total: tasks.length + collections.length + leads.length,
    },
    items,
  };
}

export function useNotifications() {
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";
  return useQuery({
    queryKey: qk.notifications.list(wid),
    queryFn: () => getCounts(wid),
    enabled: !!wid,
    refetchInterval: 5 * 60_000, // refetch cada 5 min
    staleTime: 60_000,
  });
}

// Re-export del nombre estandarizado para queryKeys (no rompe naming convention)
export const notificationsQueryKey = qk;
