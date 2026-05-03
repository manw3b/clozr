import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useBusinessStore } from "../../store/businessStore";
import { useAuthStore } from "../../store/authStore";
import { customersDb } from "../../lib/db/customers";
import { salesDb } from "../../lib/db/sales";
import type { PaymentMethod, SaleStatus, Sale } from "../../types/domain";
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

export interface NewSaleInput {
  clientId: string;
  product: string;
  amount: number;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  paid: number;
}

const PAYMENT_METHOD_TO_DB: Record<PaymentMethod, string> = {
  efectivo: "efectivo",
  transferencia: "transferencia",
  mercadopago: "mercadopago",
  "tarjeta-credito": "tarjeta_credito",
  "tarjeta-debito": "tarjeta_debito",
  "cuenta-corriente": "cuenta_corriente",
  usdt: "usdt",
};

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ventas"] });
      qc.invalidateQueries({ queryKey: ["mi-dia"] });
      qc.invalidateQueries({ queryKey: ["caja"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
    },
  });
}
