import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useBusinessStore } from "../../store/businessStore";
import { useExchangeRateStore } from "../../store/exchangeRateStore";
import { cashDb } from "../../lib/db/cash";
import { getTodayISO } from "../../lib/hooks";
import type {
  CashSummary,
  CashMovement as DomainMovement,
  CashMovementKind,
  CashCategory,
} from "../../types/domain";
import type { CashMovement as DbMovement, CashMovementType, CashDirection } from "../../lib/db/types";

function categoryFromDb(type: CashMovementType, direction: CashDirection): CashCategory {
  if (direction === "in") {
    if (type === "venta" || type === "cobro") return "sale-payment";
    return "cash-in";
  }
  if (type === "compra") return "supplier";
  if (type === "gasto") return "other";
  return "other";
}

function kindFromDb(direction: CashDirection): CashMovementKind {
  return direction === "in" ? "income" : "expense";
}

function dbToDomain(m: DbMovement): DomainMovement {
  return {
    id: m.id,
    kind: kindFromDb(m.direction),
    amount: m.amount,
    currency: (m.currency as "ARS" | "USD") ?? "ARS",
    description: m.description ?? "(sin descripción)",
    category: categoryFromDb(m.type, m.direction),
    createdAt: m.created_at,
    saleId: m.reference_type === "sale" ? m.reference_id ?? undefined : undefined,
    clientName: m.customer_name ?? undefined,
  };
}

function categoryToDb(category: CashCategory, kind: CashMovementKind): { type: CashMovementType; direction: CashDirection } {
  const direction: CashDirection = kind === "income" ? "in" : "out";
  let type: CashMovementType = "otro";
  if (category === "sale-payment") type = kind === "income" ? "cobro" : "otro";
  else if (category === "supplier") type = "compra";
  else if (category === "cash-in" || category === "transfer-in") type = "otro";
  else if (kind === "expense") type = "gasto";
  return { type, direction };
}

export function useCashSummary() {
  const { activeWorkspace } = useWorkspaceStore();
  const { activeBusiness } = useBusinessStore();
  const { usdToArs } = useExchangeRateStore();
  const wid = activeWorkspace?.id ?? "";
  const bid = activeBusiness?.id ?? "";
  const today = getTodayISO();

  return useQuery({
    queryKey: ["caja", "summary", wid, bid, today],
    queryFn: async (): Promise<CashSummary> => {
      const [movementsToday, byCurrency] = await Promise.all([
        cashDb.getMovements(wid, bid, { from: today, to: today }),
        cashDb.getSummaryByCurrency(wid, bid, { from: today, to: today }),
      ]);

      const movements = movementsToday.map(dbToDomain);

      return {
        date: today,
        openingBalance: { ars: 0, usd: 0 }, // TODO: track day opening properly
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
      const { type, direction } = categoryToDb(input.category, input.kind);
      await cashDb.createMovement(wid, bid, {
        type,
        direction,
        amount: input.amount,
        currency: input.currency,
        description: input.description,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["caja"] });
      qc.invalidateQueries({ queryKey: ["mi-dia"] });
    },
  });
}
