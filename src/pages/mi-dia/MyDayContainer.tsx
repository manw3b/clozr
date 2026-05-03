import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MyDay } from "./MyDay";
import { NewSaleModal } from "../ventas/components/NewSaleModal";
import { useCreateSale } from "../ventas/useSalesData";
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
    queryKey: qk.tasks(wid),
    queryFn: () => tasksDb.getAll(wid),
    enabled: !!wid,
  });

  const followupsQ = useQuery({
    queryKey: qk.followupsForDay(wid, bid, today),
    queryFn: () => followupsDb.getForDay(wid, bid, today),
    enabled: !!wid && !!bid,
  });

  const salesTodayQ = useQuery({
    queryKey: qk.salesByPeriod(wid, "today"),
    queryFn: () => salesDb.getRows(wid, "today"),
    enabled: !!wid,
  });

  const pendingCobrosQ = useQuery({
    queryKey: qk.pendingCobros(wid),
    queryFn: () => salesDb.getPendingCobros(wid, 5),
    enabled: !!wid,
  });

  const customersQ = useQuery({
    queryKey: qk.clientsList(wid),
    queryFn: () => customersDb.getAll(wid),
    enabled: !!wid,
  });

  const scoreQ = useQuery({
    queryKey: qk.dayScore(wid),
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
      qc.invalidateQueries({ queryKey: qk.tasks(wid) });
      qc.invalidateQueries({ queryKey: qk.dayScore(wid) });
    },
  });

  const markPaidMut = useMutation({
    mutationFn: (saleId: string) => salesDb.markAsPaid(saleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mi-dia"] });
      qc.invalidateQueries({ queryKey: ["ventas"] });
    },
  });

  const recordContactMut = useRecordContact();

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
    <>
    <MyDay
      data={data}
      onNewSale={() => setNewSaleOpen(true)}
      onToggleTask={(id) => toggleTaskMut.mutate(id)}
      onMarkPaid={(id) => markPaidMut.mutate(id)}
      onWhatsApp={(clientId) => {
        const customer = customersQ.data?.find((c) => c.id === clientId);
        if (customer?.phone) {
          const num = customer.phone.replace(/\D/g, "");
          const final = num.startsWith("54") ? num : `54${num}`;
          window.open(`https://wa.me/${final}`, "_blank");
          recordContactMut.mutate({ customerId: clientId, kind: "whatsapp" });
        }
      }}
      onCall={(clientId) => {
        const customer = customersQ.data?.find((c) => c.id === clientId);
        if (customer?.phone) {
          window.open(`tel:${customer.phone}`);
          recordContactMut.mutate({ customerId: clientId, kind: "call" });
        }
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
    <NewSaleModal
      open={newSaleOpen}
      onClose={() => setNewSaleOpen(false)}
      onSubmit={(data) => {
        createSaleMut.mutate(data, {
          onSuccess: () => {
            showToast(data.outOfStock ? "Venta fuera de stock registrada" : "Venta registrada", "success");
            setNewSaleOpen(false);
          },
        });
      }}
    />
    </>
  );
}
