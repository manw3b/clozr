import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useBusinessStore } from "../../store/businessStore";
import { useAuthStore } from "../../store/authStore";
import { salesDb } from "../../lib/db/sales";
import { dbSaleRowToDomain } from "../../lib/mappers";
import { qk, invalidate } from "../../lib/queryKeys";

export function useSalesList() {
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";
  return useQuery({
    queryKey: qk.salesByPeriod(wid, "all"),
    queryFn: async () => {
      const rows = await salesDb.getRows(wid, "all");
      return rows.map(dbSaleRowToDomain);
    },
    enabled: !!wid,
  });
}

export function useMarkSalePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (saleId: string) => salesDb.markAsPaid(saleId),
    onSuccess: () => invalidate.afterSaleChange(qc),
  });
}

/** Shape esperado del NewSaleModal nuevo (Fase 7.6). */
export interface NewSalePayload {
  clientId: string | null;
  clientName: string | null;
  customerTypeId: string | null;
  catalogItemId: string | null;
  productDescription: string;
  amount: number;
  currency: "ARS" | "USD";
  paymentMethodId: string;
  paymentMethodName: string;
  paymentMethodKind: string;
  outOfStock: boolean;
}

export function useCreateSale() {
  const qc = useQueryClient();
  const { activeWorkspace } = useWorkspaceStore();
  const { activeBusiness } = useBusinessStore();
  const { userId, userName } = useAuthStore();
  const wid = activeWorkspace?.id ?? "";

  return useMutation({
    mutationFn: async (input: NewSalePayload) => {
      await salesDb.createSale(wid, {
        business_id: activeBusiness?.id ?? null,
        customer_id: input.clientId,
        customer_name: input.clientName,
        seller_id: userId ?? null,
        seller_name: userName ?? null,
        notes: null,
        out_of_stock_sale: input.outOfStock,
        items: [
          {
            description: input.productDescription,
            quantity: 1,
            unit_price: input.amount,
            catalog_item_id: input.catalogItemId,
          },
        ],
        payments: [
          {
            method: input.paymentMethodKind,
            currency: input.currency,
            amount: input.amount,
            is_deposit: false,
          },
        ],
      });
    },
    onSuccess: () => invalidate.afterSaleChange(qc),
  });
}
