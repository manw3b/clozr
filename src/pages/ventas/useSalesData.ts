import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { salesDb } from "../../lib/db/sales";
import type { Sale } from "../../types/domain";
import type { SaleRow } from "../../lib/db/types";

function dbRowToSale(s: SaleRow): Sale {
  const status: Sale["status"] = s.is_paid === 1 ? "paid" : s.total_paid > 0 ? "partial" : "pending";
  return {
    id: s.id,
    number: `V-${s.id.slice(0, 6).toUpperCase()}`,
    clientId: s.customer_id ?? "",
    clientName: s.customer_name ?? "Sin cliente",
    amount: s.total,
    currency: "ARS",
    status,
    paid: s.total_paid,
    pending: s.balance,
    product: s.items_preview ?? s.notes ?? "Venta",
    createdAt: s.created_at,
    paidAt: s.is_paid === 1 ? s.created_at : undefined,
    notes: s.notes ?? undefined,
  };
}

export function useSalesList() {
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";
  return useQuery({
    queryKey: ["ventas", "list", wid],
    queryFn: async () => {
      const rows = await salesDb.getRows(wid, "all");
      return rows.map(dbRowToSale);
    },
    enabled: !!wid,
  });
}

export function useMarkSalePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (saleId: string) => salesDb.markAsPaid(saleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ventas"] });
      qc.invalidateQueries({ queryKey: ["mi-dia"] });
    },
  });
}
