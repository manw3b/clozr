import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useBusinessStore } from "../../store/businessStore";
import { useAuthStore } from "../../store/authStore";
import { salesDb } from "../../lib/db/sales";
import { ensurePricingSchema } from "../../lib/db/ensureSchema";
import { followupsDb } from "../../lib/db/followups";
import { dbSaleRowToDomain } from "../../lib/mappers";
import { qk, invalidate } from "../../lib/queryKeys";
import { useCloudPolling } from "../../lib/useCloudPolling";

export function useSalesList() {
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";
  const refetchInterval = useCloudPolling("sales");
  return useQuery({
    queryKey: qk.ventas.byPeriod(wid, "all"),
    refetchInterval,
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
  /** Precio unitario en USD (siempre). El método de pago decide la moneda final. */
  unitPriceUsd: number;
  /** IMEI/serie de la unidad específica vendida (si aplica). Marca el catalog_imei como vendido. */
  imei?: string | null;
}

/** Shape esperado del NewSaleModal multi-item. */
export interface NewSalePayload {
  clientId: string | null;
  clientName: string | null;
  customerTypeId: string | null;
  items: NewSaleItem[];
  /** Moneda en la que el cliente efectivamente paga (define la moneda del sale_payment). */
  paymentCurrency: "ARS" | "USD";
  /** Cotización USD→ARS al momento de la venta (se guarda para histórico). */
  usdToArs: number;
  paymentMethodId: string;
  paymentMethodName: string;
  paymentMethodKind: string;
  /** % del modificador del método (positivo o negativo). */
  paymentModifierPct: number;
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
      // Total siempre en USD (fuente de verdad)
      const totalUsd = input.items.reduce((s, it) => s + it.unitPriceUsd * it.quantity, 0);
      // Aplicar modificador % y convertir a la moneda del payment para el registro
      const modifierFactor = 1 + (input.paymentModifierPct || 0) / 100;
      const paymentAmount =
        input.paymentCurrency === "USD"
          ? totalUsd * modifierFactor
          : totalUsd * input.usdToArs * modifierFactor;

      await salesDb.createSale(wid, {
        business_id: activeBusiness?.id ?? null,
        customer_id: input.clientId,
        customer_name: input.clientName,
        seller_id: userId ?? null,
        seller_name: userName ?? null,
        notes: null,
        out_of_stock_sale: input.outOfStock,
        usd_to_ars: input.usdToArs,
        items: input.items.map((it) => ({
          description: it.productDescription,
          quantity: it.quantity,
          // unit_price siempre en USD (fuente de verdad)
          unit_price: it.unitPriceUsd,
          base_price: it.unitPriceUsd,
          catalog_item_id: it.catalogItemId,
          imei: it.imei ?? null,
          from_stock: !!it.imei,
        })),
        payments: [
          {
            method: input.paymentMethodKind,
            currency: input.paymentCurrency,
            amount: paymentAmount,
            is_deposit: false,
          },
        ],
      });

      // Auto-followup post-venta a 30 días — solo si hay cliente identificado
      if (input.clientId && input.clientName && activeBusiness?.id) {
        const productDescription =
          input.items[0]?.productDescription ?? "Producto";
        try {
          await followupsDb.createPostSaleFollowup(
            wid,
            activeBusiness.id,
            input.clientId,
            input.clientName,
            productDescription,
            30,
          );
        } catch {
          /* el seguimiento es bonus, no falla la venta */
        }
      }
    },
    onSuccess: () => {
      invalidate.afterSaleChange(qc);
      // Invalidar followups también
      qc.invalidateQueries({ queryKey: qk.followups.all() });
    },
  });
}
