import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useBusinessStore } from "../../store/businessStore";
import { useAuthStore } from "../../store/authStore";
import { customersDb } from "../../lib/db/customers";
import { salesDb } from "../../lib/db/sales";
import { dbSaleRowToDomain, PAYMENT_METHOD_TO_DB } from "../../lib/mappers";
import { qk, invalidate } from "../../lib/queryKeys";
import type { PaymentMethod, SaleStatus } from "../../types/domain";

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

export interface NewSaleInput {
  clientId: string;
  product: string;
  amount: number;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  paid: number;
}

export function useCreateSale() {
  const qc = useQueryClient();
  const { activeWorkspace } = useWorkspaceStore();
  const { activeBusiness } = useBusinessStore();
  const { userId, userName } = useAuthStore();
  const wid = activeWorkspace?.id ?? "";

  return useMutation({
    mutationFn: async (input: NewSaleInput) => {
      const customer = await customersDb.getById(wid, input.clientId);
      const customerName = customer?.name ?? null;

      await salesDb.createSale(wid, {
        business_id: activeBusiness?.id ?? null,
        customer_id: input.clientId,
        customer_name: customerName,
        seller_id: userId ?? null,
        seller_name: userName ?? null,
        notes: null,
        items: [
          {
            description: input.product,
            quantity: 1,
            unit_price: input.amount,
          },
        ],
        payments:
          input.paid > 0
            ? [
                {
                  method: PAYMENT_METHOD_TO_DB[input.paymentMethod],
                  currency: "ARS",
                  amount: input.paid,
                  is_deposit: input.status === "partial",
                },
              ]
            : [],
      });
    },
    onSuccess: () => invalidate.afterSaleChange(qc),
  });
}
