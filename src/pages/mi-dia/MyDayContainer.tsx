import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MyDay } from "./MyDay";
import { NewSaleModal } from "../ventas/components/NewSaleModal";
import { useCreateSale } from "../ventas/useSalesData";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useBusinessStore } from "../../store/businessStore";
import { useAuthStore } from "../../store/authStore";
import { useUIStore, type ScreenId } from "../../store/uiStore";
import { tasksDb } from "../../lib/db/tasks";
import { followupsDb } from "../../lib/db/followups";
import { salesDb } from "../../lib/db/sales";
import { customersDb } from "../../lib/db/customers";
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
  dbCustomerToInactive,
} from "../../lib/mappers";
import { qk } from "../../lib/queryKeys";
import { useRecordContact } from "../clientes/useClientsData";
import type { MyDayData } from "../../types/domain";

const INACTIVE_DAYS_THRESHOLD = 30;

export function MyDayContainer() {
  const { activeWorkspace } = useWorkspaceStore();
  const { activeBusiness } = useBusinessStore();
  const { userName } = useAuthStore();
  const { setActiveScreen, showToast } = useUIStore();
  const qc = useQueryClient();
  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const createSaleMut = useCreateSale();

  const wid = activeWorkspace?.id ?? "";
  const bid = activeBusiness?.id ?? "";
  const today = getTodayISO();

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

  const customersQ = useQuery({
    queryKey: qk.clientes.list(wid),
    queryFn: () => customersDb.getAll(wid),
    enabled: !!wid,
  });

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

  const markPaidMut = useMutation({
    mutationFn: (saleId: string) => salesDb.markAsPaid(saleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.miDia.all() });
      qc.invalidateQueries({ queryKey: qk.ventas.all() });
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

  const data: MyDayData = useMemo(() => {
    const tasks = (tasksQ.data ?? []).map(dbTaskToDomain);
    const followUps = (followupsQ.data ?? [])
      .filter((f) => f.completed === 0)
      .map(dbFollowupToDomain);
    const todaySales = (salesTodayQ.data ?? []).map(dbSaleRowToDomain);
    const dueCollections = (pendingCobrosQ.data ?? []).map(dbSaleToDueCollection);

    const now = Date.now();
    const inactiveClients = (customersQ.data ?? [])
      .filter((c) => c.status === "dormido" || c.status === "perdido")
      .slice(0, 5)
      .map((c) => {
        const days = Math.floor((now - new Date(c.updated_at).getTime()) / 86400000);
        return dbCustomerToInactive(c, Math.max(INACTIVE_DAYS_THRESHOLD, days));
      });

    const goalAmount = activeWorkspace?.daily_goal ?? 0;
    const goalSalesCount = activeWorkspace?.daily_goal_count ?? 0;
    const todayRevenue = todaySales.reduce((sum, s) => sum + s.amount, 0);

    return {
      greeting: greetingForHour(new Date().getHours()),
      user: { name: userName ?? "" },
      workspace: { name: activeBusiness?.name ?? activeWorkspace?.name ?? "" },
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
  ]);

  return (
    <>
    <MyDay
      data={data}
      onNewSale={() => setNewSaleOpen(true)}
      onSetGoal={(amount) => setGoalMut.mutate({ amountUsd: amount })}
      onSetSalesGoal={(count) => setGoalMut.mutate({ salesCount: count })}
      onToggleTask={(id) => toggleTaskMut.mutate(id)}
      onMarkPaid={(id) => markPaidMut.mutate(id)}
      onCreateTask={() => {
        // Mi Día y Tareas son pantallas distintas: navegamos primero a
        // tareas y luego pedimos abrir el form. El listener vive en
        // Tareas.tsx. Sin la navegación previa el form se montaría
        // pero no se vería porque seguís en Mi Día.
        setActiveScreen("tasks");
        window.dispatchEvent(new CustomEvent("clozr:open-new-task"));
      }}
      onWhatsApp={(clientId, opts) => {
        const customer = customersQ.data?.find((c) => c.id === clientId);
        if (customer?.phone) {
          openWhatsApp(customer.phone, opts?.message);
          recordContactMut.mutate({ customerId: clientId, kind: "whatsapp" });
        }
      }}
      onCall={(clientId) => {
        const customer = customersQ.data?.find((c) => c.id === clientId);
        if (customer?.phone) {
          openTel(customer.phone);
          recordContactMut.mutate({ customerId: clientId, kind: "call" });
        }
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
    <NewSaleModal
      open={newSaleOpen}
      onClose={() => setNewSaleOpen(false)}
      onSubmit={async (data) => {
        await createSaleMut.mutateAsync(data);
        showToast(data.outOfStock ? "Venta fuera de stock registrada" : "Venta registrada", "success");
      }}
    />
    </>
  );
}
