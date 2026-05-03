import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useBusinessStore } from "../../store/businessStore";
import { useAuthStore } from "../../store/authStore";
import { salesDb } from "../../lib/db/sales";
import { ensurePricingSchema } from "../../lib/db/ensureSchema";
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

/** Item de la venta (uno o varios por venta). */
export interface NewSaleItem {
  catalogItemId: string | null;
  productDescription: string;
  quantity: number;
  unitPrice: number; // en la currency del payment method
}

/** Shape esperado del NewSaleModal multi-item. */
export interface NewSalePayload {
  clientId: string | null;
  clientName: string | null;
  customerTypeId: string | null;
  items: NewSaleItem[];
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
      // Defensa por si las migraciones 022-025 no corrieron en esta DB
      await ensurePricingSchema();
      const total = input.items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
      await salesDb.createSale(wid, {
        business_id: activeBusiness?.id ?? null,
        customer_id: input.clientId,
        customer_name: input.clientName,
        seller_id: userId ?? null,
        seller_name: userName ?? null,
        notes: null,
        out_of_stock_sale: input.outOfStock,
        items: input.items.map((it) => ({
          description: it.productDescription,
          quantity: it.quantity,
          unit_price: it.unitPrice,
          catalog_item_id: it.catalogItemId,
        })),
        payments: [
          {
            method: input.paymentMethodKind,
            currency: input.currency,
            amount: total,
            is_deposit: false,
          },
        ],
      });
    },
    onSuccess: () => invalidate.afterSaleChange(qc),
  });
}
