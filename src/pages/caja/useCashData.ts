import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useBusinessStore } from "../../store/businessStore";
import { useExchangeRateStore } from "../../store/exchangeRateStore";
import { cashDb } from "../../lib/db/cash";
import { cashSessionsDb } from "../../lib/db/cashSessions";
import { getTodayISO } from "../../lib/hooks";
import { toLocalISODate } from "../../lib/format";
import { dbCashMovementToDomain, cashCategoryToDb } from "../../lib/mappers";
import { qk, invalidate } from "../../lib/queryKeys";
import { useCloudQueryConfig } from "../../lib/useCloudPolling";
import type { CashSummary, CashMovementKind, CashCategory } from "../../types/domain";

export type CashPeriod = "today" | "week" | "month";

/**
 * Devuelve el rango {from, to} del período en formato YYYY-MM-DD (local time).
 * Hoy = un solo día. Esta semana = lunes…hoy. Este mes = día 1…hoy.
 */
export function periodRange(period: CashPeriod): { from: string; to: string } {
  const today = new Date();
  const to = toLocalISODate(today);
  const from = new Date(today);
  if (period === "today") {
    // mismo día
  } else if (period === "week") {
    // Lunes de esta semana (getDay: 0=domingo, 1=lunes…6=sábado).
    const dow = from.getDay();
    const offset = dow === 0 ? 6 : dow - 1; // domingo cuenta como fin de semana pasada
    from.setDate(from.getDate() - offset);
  } else {
    from.setDate(1);
  }
  return { from: toLocalISODate(from), to };
}

/**
 * Carga el summary de caja para el período pedido. El balance de apertura
 * (`openingBalance`) siempre es el del día actual — sólo cambian los totales,
 * los movimientos listados y el balance "actual" (que para períodos largos
 * representa el balance acumulado del rango).
 */
export function useCashSummary(period: CashPeriod = "today") {
  const { activeWorkspace } = useWorkspaceStore();
  const { activeBusiness } = useBusinessStore();
  const { usdToArs } = useExchangeRateStore();
  const wid = activeWorkspace?.id ?? "";
  const bid = activeBusiness?.id ?? "";
  const today = getTodayISO();
  const { from, to } = periodRange(period);
  const cloudCfg = useCloudQueryConfig("cash");

  return useQuery({
    queryKey: qk.caja.summary(wid, bid, from, to),
    refetchInterval: cloudCfg.refetchInterval,
    staleTime: cloudCfg.staleTime,
    queryFn: async (): Promise<CashSummary> => {
      const [session, movementsRange, byCurrency] = await Promise.all([
        cashSessionsDb.ensureForDay(wid, bid, today),
        cashDb.getMovements(wid, bid, { from, to }),
        cashDb.getSummaryByCurrency(wid, bid, { from, to }),
      ]);

      const movements = movementsRange.map(dbCashMovementToDomain);
      const opening = {
        ars: session.opened_balance_ars,
        usd: session.opened_balance_usd,
      };

      return {
        date: to,
        openingBalance: opening,
        totalIncome: { ars: byCurrency.ars.ingresos, usd: byCurrency.usd.ingresos },
        totalExpense: { ars: byCurrency.ars.egresos, usd: byCurrency.usd.egresos },
        currentBalance: {
          ars: opening.ars + byCurrency.ars.balance,
          usd: opening.usd + byCurrency.usd.balance,
        },
        usdRate: usdToArs || 1,
        movements,
      };
    },
    enabled: !!wid && !!bid,
  });
}

export function useCreateMovement() {
  const qc = useQueryClient();
  const { activeWorkspace } = useWorkspaceStore();
  const { activeBusiness } = useBusinessStore();
  const wid = activeWorkspace?.id ?? "";
  const bid = activeBusiness?.id ?? "";

  return useMutation({
    mutationFn: async (input: {
      kind: CashMovementKind;
      amount: number;
      currency: "ARS" | "USD";
      category: CashCategory;
      description: string;
    }) => {
      const { type, direction } = cashCategoryToDb(input.category, input.kind);
      await cashDb.createMovement(wid, bid, {
        type,
        direction,
        amount: input.amount,
        currency: input.currency,
        description: input.description,
      });
    },
    onSuccess: () => invalidate.afterCashChange(qc),
  });
}

/**
 * Borra un movimiento de caja. Si el movimiento vino de una venta
 * (reference_type='sale'), igual lo borra — el caller decide si confirmar
 * o no antes (ej: window.confirm). La invalidación reactiva summary y
 * arqueos asociados.
 */
export function useDeleteMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cashDb.remove(id),
    onSuccess: () => invalidate.afterCashChange(qc),
  });
}

/** Sesión de caja del día (la que se abrió hoy). Sirve para mostrar el
 *  estado (abierta/cerrada) en el header y los timestamps. */
export function useCashSession() {
  const { activeWorkspace } = useWorkspaceStore();
  const { activeBusiness } = useBusinessStore();
  const wid = activeWorkspace?.id ?? "";
  const bid = activeBusiness?.id ?? "";
  const today = getTodayISO();
  return useQuery({
    queryKey: qk.caja.session(wid, bid, today),
    queryFn: () => cashSessionsDb.ensureForDay(wid, bid, today),
    enabled: !!wid && !!bid,
  });
}

/** Cierra la sesión de caja de HOY con los balances físicos contados.
 *  Devuelve un toast/error al caller; persiste closed_at + balances. */
export function useCloseCashSession() {
  const qc = useQueryClient();
  const { activeWorkspace } = useWorkspaceStore();
  const { activeBusiness } = useBusinessStore();
  const wid = activeWorkspace?.id ?? "";
  const bid = activeBusiness?.id ?? "";
  const today = getTodayISO();

  return useMutation({
    mutationFn: async (input: { ars: number; usd: number }) => {
      const session = await cashSessionsDb.ensureForDay(wid, bid, today);
      if (session.id === "ghost-session") {
        throw new Error("No hay sesión de caja para cerrar");
      }
      await cashSessionsDb.close(session.id, {
        closed_balance_ars: input.ars,
        closed_balance_usd: input.usd,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.caja.all() });
    },
  });
}
