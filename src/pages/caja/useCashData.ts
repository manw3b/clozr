import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useBusinessStore } from "../../store/businessStore";
import { useExchangeRateStore } from "../../store/exchangeRateStore";
import { cashDb } from "../../lib/db/cash";
import { getTodayISO } from "../../lib/hooks";
import { dbCashMovementToDomain, cashCategoryToDb } from "../../lib/mappers";
import { qk, invalidate } from "../../lib/queryKeys";
import type { CashSummary, CashMovementKind, CashCategory } from "../../types/domain";

export function useCashSummary() {
  const { activeWorkspace } = useWorkspaceStore();
  const { activeBusiness } = useBusinessStore();
  const { usdToArs } = useExchangeRateStore();
  const wid = activeWorkspace?.id ?? "";
  const bid = activeBusiness?.id ?? "";
  const today = getTodayISO();

  return useQuery({
    queryKey: qk.cashSummary(wid, bid, today),
    queryFn: async (): Promise<CashSummary> => {
      const [movementsToday, byCurrency] = await Promise.all([
        cashDb.getMovements(wid, bid, { from: today, to: today }),
        cashDb.getSummaryByCurrency(wid, bid, { from: today, to: today }),
      ]);

      const movements = movementsToday.map(dbCashMovementToDomain);

      return {
        date: today,
        openingBalance: { ars: 0, usd: 0 }, // TODO Fase 2.2: track day opening
        totalIncome: { ars: byCurrency.ars.ingresos, usd: byCurrency.usd.ingresos },
        totalExpense: { ars: byCurrency.ars.egresos, usd: byCurrency.usd.egresos },
        currentBalance: { ars: byCurrency.ars.balance, usd: byCurrency.usd.balance },
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
