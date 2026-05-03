import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MyDay } from "./MyDay";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useBusinessStore } from "../../store/businessStore";
import { useAuthStore } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import { tasksDb } from "../../lib/db/tasks";
import { followupsDb } from "../../lib/db/followups";
import { salesDb } from "../../lib/db/sales";
import { customersDb } from "../../lib/db/customers";
import { scoreDb } from "../../lib/db/score";
import { getTodayISO } from "../../lib/hooks";
import {
  greetingForHour,
  dbTaskToDomain,
  dbFollowupToDomain,
  dbSaleToDomain,
  dbSaleToDueCollection,
  dbCustomerToInactive,
} from "./mappers";
import type { MyDayData } from "../../types/domain";

const INACTIVE_DAYS_THRESHOLD = 30;

export function MyDayContainer() {
  const { activeWorkspace } = useWorkspaceStore();
  const { activeBusiness } = useBusinessStore();
  const { userName } = useAuthStore();
  const { setActiveScreen } = useUIStore();
  const qc = useQueryClient();

  const wid = activeWorkspace?.id ?? "";
  const bid = activeBusiness?.id ?? "";
  const today = getTodayISO();

  // Tasks
  const tasksQ = useQuery({
    queryKey: ["mi-dia", "tasks", wid],
    queryFn: () => tasksDb.getAll(wid),
    enabled: !!wid,
  });

  // Follow-ups del día
  const followupsQ = useQuery({
    queryKey: ["mi-dia", "followups", wid, bid, today],
    queryFn: () => followupsDb.getForDay(wid, bid, today),
    enabled: !!wid && !!bid,
  });

  // Ventas de hoy
  const salesTodayQ = useQuery({
    queryKey: ["mi-dia", "sales-today", wid],
    queryFn: () => salesDb.getRows(wid, "today"),
    enabled: !!wid,
  });

  // Cobros pendientes
  const pendingCobrosQ = useQuery({
    queryKey: ["mi-dia", "pending-cobros", wid],
    queryFn: () => salesDb.getPendingCobros(wid, 5),
    enabled: !!wid,
  });

  // Clientes inactivos (sin compra hace >30 días)
  const customersQ = useQuery({
    queryKey: ["mi-dia", "customers", wid],
    queryFn: () => customersDb.getAll(wid),
    enabled: !!wid,
  });

  // Score del día
  const scoreQ = useQuery({
    queryKey: ["mi-dia", "score", wid],
    queryFn: () => scoreDb.calculateDayScore(wid),
    enabled: !!wid,
    refetchInterval: 60_000,
  });

  // Mutations
  const toggleTaskMut = useMutation({
    mutationFn: async (id: string) => {
      const t = tasksQ.data?.find((x) => x.id === id);
      if (!t) return;
      await tasksDb.toggleComplete(id, t.completed === 0);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mi-dia", "tasks"] });
      qc.invalidateQueries({ queryKey: ["mi-dia", "score"] });
    },
  });

  const markPaidMut = useMutation({
    mutationFn: (saleId: string) => salesDb.markAsPaid(saleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mi-dia", "pending-cobros"] });
      qc.invalidateQueries({ queryKey: ["mi-dia", "sales-today"] });
    },
  });

  // Build MyDayData
  const data: MyDayData = useMemo(() => {
    const tasks = (tasksQ.data ?? []).map(dbTaskToDomain);
    const followUps = (followupsQ.data ?? [])
      .filter((f) => f.completed === 0)
      .map(dbFollowupToDomain);
    const todaySales = (salesTodayQ.data ?? []).map(dbSaleToDomain);
    const dueCollections = (pendingCobrosQ.data ?? []).map(dbSaleToDueCollection);

    // Inactivos = customers con last contact > 30d (proxy: status dormido/perdido o sin compras)
    const now = Date.now();
    const inactiveClients = (customersQ.data ?? [])
      .filter((c) => c.status === "dormido" || c.status === "perdido")
      .slice(0, 5)
      .map((c) => {
        const days = Math.floor((now - new Date(c.updated_at).getTime()) / 86400000);
        return dbCustomerToInactive(c, Math.max(INACTIVE_DAYS_THRESHOLD, days));
      });

    // Goal
    const goalAmount = activeWorkspace?.daily_goal ?? 0;
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
        salesGoal: undefined,
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
    <MyDay
      data={data}
      onToggleTask={(id) => toggleTaskMut.mutate(id)}
      onMarkPaid={(id) => markPaidMut.mutate(id)}
      onWhatsApp={(clientId) => {
        const customer = customersQ.data?.find((c) => c.id === clientId);
        if (customer?.phone) {
          const num = customer.phone.replace(/\D/g, "");
          const final = num.startsWith("54") ? num : `54${num}`;
          window.open(`https://wa.me/${final}`, "_blank");
        }
      }}
      onCall={(clientId) => {
        const customer = customersQ.data?.find((c) => c.id === clientId);
        if (customer?.phone) window.open(`tel:${customer.phone}`);
      }}
      onNavigate={(page) => {
        const map: Record<string, string> = {
          tareas: "tasks",
          pipeline: "pipeline",
          clientes: "customers",
          ventas: "sales",
          deudas: "cash",
        };
        const target = map[page];
        if (target) setActiveScreen(target as never);
      }}
    />
  );
}
