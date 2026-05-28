import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MyDay } from "./MyDay";
import { useCreateSale } from "../ventas/useSalesData";

// D7: modales lazy. NewSaleModal solo se monta cuando newSaleOpen=true,
// igual NewTaskModal y CollectPaymentModal. Antes los 3 venían bundleados
// con MyDay (que es eager) → ~50 kB extra en el chunk principal aunque
// el user nunca toque "Nueva venta". Ahora son chunks separados que se
// bajan on-demand (~150ms primera vez, cacheado después).
const NewSaleModal = lazy(() =>
  import("../ventas/components/NewSaleModal").then((m) => ({ default: m.NewSaleModal })),
);
const NewTaskModal = lazy(() =>
  import("../tareas/components/NewTaskModal").then((m) => ({ default: m.NewTaskModal })),
);
const CollectPaymentModal = lazy(() =>
  import("../../components/CollectPaymentModal").then((m) => ({ default: m.CollectPaymentModal })),
);
import { assignedTasksDb } from "../../lib/db/assignedTasks";
import type { DueCollection } from "../../types/domain";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useBusinessStore } from "../../store/businessStore";
import { useAuthStore } from "../../store/authStore";
import { useUIStore, type ScreenId } from "../../store/uiStore";
import { tasksDb } from "../../lib/db/tasks";
import { useTaskVisibilityFilter } from "../../lib/useTaskVisibilityFilter";
import { followupsDb } from "../../lib/db/followups";
import { salesDb } from "../../lib/db/sales";
import { scoreDb } from "../../lib/db/score";
import { workspaceDb } from "../../lib/db/workspace";
import { openWhatsApp, openTel } from "../../lib/openExternal";
import { getTodayISO } from "../../lib/hooks";
import {
  greetingForHour,
  dbTaskToDomain,
  dbFollowupToDomain,
  dbSaleRowToDomain,
  dbSaleToDueCollection,
} from "../../lib/mappers";
import { qk } from "../../lib/queryKeys";
import { useClientsList, useRecordContact } from "../clientes/useClientsData";
import type { MyDayData, InactiveClient } from "../../types/domain";

export function MyDayContainer() {
  const { activeWorkspace } = useWorkspaceStore();
  const { activeBusiness } = useBusinessStore();
  const { userName, userId } = useAuthStore();
  const { setActiveScreen, showToast } = useUIStore();
  const qc = useQueryClient();
  const [newSaleOpen, setNewSaleOpen] = useState(false);
  // "Crear tarea" desde Mi Día abre este modal INLINE. La intención de
  // Mi Día son atajos rápidos del día a día sin salir del dashboard —
  // si el usuario quiere la vista full de tareas (filtros, contextos,
  // bulk actions), ahí sí navega a la screen "Tareas" con el menú.
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  // Cobrar — abre modal con monto + método. Antes hacíamos markAsPaid
  // bruto (asume "pagó todo, sin saber cómo") que rompía la trazabilidad
  // a Caja. Ahora siempre pasa por el modal que insert sale_payments.
  const [collectingFrom, setCollectingFrom] = useState<DueCollection | null>(null);
  const createSaleMut = useCreateSale();

  const wid = activeWorkspace?.id ?? "";
  const bid = activeBusiness?.id ?? "";
  const today = getTodayISO();

  // Materializa templates obligatorios al abrir Mi Día + cada 60s
  // mientras esté montada (G+2). Idempotente. Cuando el owner crea un
  // template nuevo, el vendedor que está mirando Mi Día lo recibe en el
  // próximo tick sin tener que recargar la pantalla.
  useEffect(() => {
    if (!wid || !userId) return;
    let cancelled = false;
    const run = () => {
      assignedTasksDb
        .materializeForToday(wid, userId)
        .then((n) => {
          if (!cancelled && n > 0) qc.invalidateQueries({ queryKey: qk.tasks.all() });
        })
        .catch(() => {
          /* best-effort */
        });
    };
    run();
    const interval = setInterval(run, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [wid, userId, qc]);

  const tasksQ = useQuery({
    queryKey: qk.tasks.list(wid),
    queryFn: () => tasksDb.getAll(wid),
    enabled: !!wid,
  });

  const followupsQ = useQuery({
    queryKey: qk.followups.forDay(wid, bid, today),
    queryFn: () => followupsDb.getForDay(wid, bid, today),
    enabled: !!wid && !!bid,
  });

  const salesTodayQ = useQuery({
    queryKey: qk.ventas.byPeriod(wid, "today"),
    queryFn: () => salesDb.getRows(wid, "today"),
    enabled: !!wid,
  });

  const pendingCobrosQ = useQuery({
    queryKey: qk.ventas.pendingCobros(wid),
    queryFn: () => salesDb.getPendingCobros(wid, 5),
    enabled: !!wid,
  });

  // Usamos el mismo hook que la pantalla Clientes — devuelve Client[] con
  // status ya derivado de actividad (active/new/inactive/risk según días
  // sin contacto). Antes hacíamos otro useQuery con la MISMA queryKey pero
  // queryFn distinta (raw vs enriched), lo que era un bug latente: el que
  // mountaba primero ganaba y el otro componente recibía data del shape
  // equivocado.
  const customersQ = useClientsList();

  const scoreQ = useQuery({
    queryKey: qk.miDia.score(wid),
    queryFn: () => scoreDb.calculateDayScore(wid),
    enabled: !!wid,
    refetchInterval: 60_000,
  });

  const toggleTaskMut = useMutation({
    mutationFn: async (id: string) => {
      const t = tasksQ.data?.find((x) => x.id === id);
      if (!t) return;
      await tasksDb.toggleComplete(id, t.completed === 0);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.tasks.list(wid) });
      qc.invalidateQueries({ queryKey: qk.miDia.score(wid) });
    },
  });


  const recordContactMut = useRecordContact();

  // Setear el objetivo del día desde el Hero. Acepta tanto monto como
  // cantidad de ventas (parcial — sólo se actualiza lo que se pasa).
  // Refresh del store para que el Hero re-renderice con el nuevo valor.
  const setGoalMut = useMutation({
    mutationFn: async (
      patch: { amountUsd?: number; salesCount?: number },
    ) => {
      if (!activeWorkspace) throw new Error("Sin workspace activo");
      const updates: Parameters<typeof workspaceDb.update>[1] = {};
      if (patch.amountUsd !== undefined) {
        updates.daily_goal = patch.amountUsd;
        updates.daily_goal_currency = "USD";
      }
      if (patch.salesCount !== undefined) {
        updates.daily_goal_count = patch.salesCount;
      }
      if (Object.keys(updates).length === 0) return;
      await workspaceDb.update(activeWorkspace.id, updates);
      const all = await workspaceDb.getAll();
      const updated = all.find((w) => w.id === activeWorkspace.id);
      if (updated) useWorkspaceStore.setState({ workspaces: all, activeWorkspace: updated });
    },
    onSuccess: () => {
      showToast("Objetivo actualizado", "success");
      qc.invalidateQueries({ queryKey: qk.miDia.score(wid) });
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : "Error al guardar", "error");
    },
  });

  // G+1: filtrar tareas por assigned_to según rol del user. Owner/admin
  // ven todo; vendedor/viewer ven solo las suyas o sin asignar.
  const shouldShowTask = useTaskVisibilityFilter();

  const data: MyDayData = useMemo(() => {
    const tasks = (tasksQ.data ?? [])
      .filter(shouldShowTask)
      .map(dbTaskToDomain);
    const followUps = (followupsQ.data ?? [])
      .filter((f) => f.completed === 0)
      .map(dbFollowupToDomain);
    const todaySales = (salesTodayQ.data ?? []).map(dbSaleRowToDomain);
    const dueCollections = (pendingCobrosQ.data ?? []).map(dbSaleToDueCollection);

    const now = Date.now();
    // Filtramos los Client enriquecidos por status DERIVADO (no por la
    // columna manual del DB que casi nadie actualizaba). Tomamos hasta 5,
    // priorizando los más viejos sin contacto.
    const inactiveClients: InactiveClient[] = (customersQ.data ?? [])
      .filter((c) => c.status === "inactive" || c.status === "risk")
      .map((c): InactiveClient => {
        // Fallback chain: contacto > creación > "ahora" (defensivo —
        // createdAt es opcional en el tipo aunque siempre viene del DB).
        const refDate = c.lastContactAt ?? c.createdAt ?? new Date().toISOString();
        const days = Math.floor((now - new Date(refDate).getTime()) / 86_400_000);
        return {
          client: c,
          daysSinceContact: Math.max(0, days),
          totalPurchases: c.totalPurchases ?? 0,
        };
      })
      .sort((a, b) => b.daysSinceContact - a.daysSinceContact)
      .slice(0, 5);

    const goalAmount = activeWorkspace?.daily_goal ?? 0;
    const goalSalesCount = activeWorkspace?.daily_goal_count ?? 0;
    const todayRevenue = todaySales.reduce((sum, s) => sum + s.amount, 0);

    return {
      greeting: greetingForHour(new Date().getHours()),
      user: { name: userName ?? "" },
      workspace: {
        name: activeBusiness?.name ?? activeWorkspace?.name ?? "",
        logoPath: activeWorkspace?.logo_path ?? null,
      },
      date: new Date().toISOString(),
      goal: {
        amount: goalAmount,
        current: todayRevenue,
        salesCount: todaySales.length,
        salesGoal: goalSalesCount > 0 ? goalSalesCount : undefined,
      },
      tasks,
      followUps,
      todaySales,
      dueCollections,
      inactiveClients,
      score: scoreQ.data ?? 0,
    };
  }, [
    tasksQ.data,
    followupsQ.data,
    salesTodayQ.data,
    pendingCobrosQ.data,
    customersQ.data,
    scoreQ.data,
    activeWorkspace,
    activeBusiness,
    userName,
    shouldShowTask,
  ]);

  return (
    <>
    <MyDay
      data={data}
      onNewSale={() => setNewSaleOpen(true)}
      onSetGoal={(amount) => setGoalMut.mutate({ amountUsd: amount })}
      onSetSalesGoal={(count) => setGoalMut.mutate({ salesCount: count })}
      onToggleTask={(id) => toggleTaskMut.mutate(id)}
      onMarkPaid={(id) => {
        // Buscamos el DueCollection completo para pasarle al modal
        // (necesita total + balance + currency, no solo id).
        const collection = data.dueCollections.find((c) => c.saleId === id);
        if (collection) setCollectingFrom(collection);
      }}
      onCreateTask={() => setNewTaskOpen(true)}
      onTaskProgressDelta={(taskId, delta) => {
        // +1 / -1 contra el contador de tareas obligatorias. Después de
        // mutar, invalida la query de tareas para refrescar el render.
        assignedTasksDb
          .incrementProgress(taskId, delta)
          .then(() => {
            qc.invalidateQueries({ queryKey: qk.tasks.list(wid) });
            qc.invalidateQueries({ queryKey: qk.miDia.score(wid) });
          })
          .catch((err) => {
            showToast(err instanceof Error ? err.message : "Error al actualizar", "error");
          });
      }}
      onWhatsApp={(clientId, opts) => {
        const customer = customersQ.data?.find((c) => c.id === clientId);
        if (!customer) {
          showToast("No se encontró el cliente", "error");
          return;
        }
        if (!customer.phone) {
          showToast(`${customer.name} no tiene teléfono cargado`, "error");
          return;
        }
        openWhatsApp(customer.phone, opts?.message);
        recordContactMut.mutate({ customerId: clientId, kind: "whatsapp" });
      }}
      onCall={(clientId) => {
        const customer = customersQ.data?.find((c) => c.id === clientId);
        if (!customer) {
          showToast("No se encontró el cliente", "error");
          return;
        }
        if (!customer.phone) {
          showToast(`${customer.name} no tiene teléfono cargado`, "error");
          return;
        }
        openTel(customer.phone);
        recordContactMut.mutate({ customerId: clientId, kind: "call" });
      }}
      onNavigate={(page) => {
        const map: Record<string, ScreenId> = {
          tareas: "tasks",
          pipeline: "pipeline",
          clientes: "customers",
          ventas: "sales",
          deudas: "cash",
        };
        const target = map[page];
        if (target) setActiveScreen(target);
      }}
    />
    {/* Mount condicional + Suspense — los modales lazy bajan su chunk
        recién cuando el user abre el modal por primera vez. */}
    {newSaleOpen && (
      <Suspense fallback={null}>
        <NewSaleModal
          open={newSaleOpen}
          onClose={() => setNewSaleOpen(false)}
          onSubmit={async (data) => {
            await createSaleMut.mutateAsync(data);
            showToast(data.outOfStock ? "Venta fuera de stock registrada" : "Venta registrada", "success");
          }}
        />
      </Suspense>
    )}
    {newTaskOpen && (
      <Suspense fallback={null}>
        <NewTaskModal open={newTaskOpen} onClose={() => setNewTaskOpen(false)} />
      </Suspense>
    )}
    {collectingFrom && (
      <Suspense fallback={null}>
        <CollectPaymentModal
          open={!!collectingFrom}
          onClose={() => setCollectingFrom(null)}
          sale={{
            id: collectingFrom.saleId,
            clientName: collectingFrom.clientName,
            total: collectingFrom.total,
            balance: collectingFrom.amount,
            currency: collectingFrom.currency,
          }}
        />
      </Suspense>
    )}
    </>
  );
}
