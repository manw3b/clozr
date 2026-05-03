import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { customersDb } from "../../lib/db/customers";
import { salesDb } from "../../lib/db/sales";
import { dbCustomerToClient, dbSaleToDomain } from "../../lib/mappers";
import { qk, invalidate } from "../../lib/queryKeys";
import type { Client, ClientDetail, ActivityItem } from "../../types/domain";

export function useClientsList() {
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";
  return useQuery({
    queryKey: qk.clientsList(wid),
    queryFn: async () => {
      const dbCustomers = await customersDb.getAll(wid);
      return dbCustomers.map((c): Client => {
        const base = dbCustomerToClient(c);
        return {
          ...base,
          lastContactAt: c.updated_at,
          lastPurchaseAt: c.updated_at,
          balanceDue: 0, // computed only in detail
        };
      });
    },
    enabled: !!wid,
    staleTime: 30_000,
  });
}

export function useClientDetail(clientId: string | null) {
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";

  return useQuery({
    queryKey: qk.clientDetail(wid, clientId),
    queryFn: async (): Promise<ClientDetail | null> => {
      if (!clientId || !wid) return null;
      const customer = await customersDb.getById(wid, clientId);
      if (!customer) return null;

      const dbSales = await salesDb.getByCustomer(wid, clientId);
      const sales = dbSales.map(dbSaleToDomain);

      const outstandingDebts = dbSales
        .filter((s) => s.is_paid === 0 && s.balance > 0)
        .map((s) => ({
          saleId: s.id,
          amount: s.balance,
          dueAt: s.created_at,
          daysOverdue: Math.max(
            0,
            Math.floor((Date.now() - new Date(s.created_at).getTime()) / 86400000) - 30,
          ),
          product: s.notes ?? "Venta",
        }));

      const activity: ActivityItem[] = dbSales.map((s) => ({
        id: `sale-${s.id}`,
        kind: "sale" as const,
        at: s.created_at,
        title: `Venta ${s.is_paid === 1 ? "pagada" : "registrada"}`,
        description: s.notes ?? undefined,
        amount: s.total,
      }));
      activity.push({
        id: `created-${customer.id}`,
        kind: "created",
        at: customer.created_at,
        title: "Cliente creado",
      });
      activity.sort((a, b) => (a.at < b.at ? 1 : -1));

      const totalDue = outstandingDebts.reduce((sum, d) => sum + d.amount, 0);
      const base = dbCustomerToClient(customer);

      return {
        ...base,
        lastContactAt: customer.updated_at,
        lastPurchaseAt: dbSales[0]?.created_at,
        balanceDue: totalDue,
        totalPurchases: dbSales.length,
        sales,
        outstandingDebts,
        activity,
      };
    },
    enabled: !!clientId && !!wid,
  });
}

export function useDeleteClients() {
  const qc = useQueryClient();
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";

  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await customersDb.remove(wid, id);
      }
    },
    onSuccess: () => invalidate.afterClientChange(qc),
  });
}
