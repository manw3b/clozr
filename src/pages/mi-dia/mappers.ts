/**
 * Mappers entre el schema actual de SQLite y los tipos del domain (Sprint 2+).
 */
import type {
  Task as DbTask,
  Followup as DbFollowup,
  Sale as DbSale,
  Customer as DbCustomer,
} from "../../lib/db/types";
import type {
  Task,
  FollowUp,
  Sale,
  DueCollection,
  InactiveClient,
  Client,
  ClientType,
} from "../../types/domain";

export function greetingForHour(h: number): "morning" | "afternoon" | "evening" | "night" {
  if (h < 12) return "morning";
  if (h < 19) return "afternoon";
  if (h < 22) return "evening";
  return "night";
}

export function dbTaskToDomain(t: DbTask): Task {
  return {
    id: t.id,
    title: t.title,
    type: t.type === "rutina" ? "rutina" : "puntual",
    status: t.completed === 1 ? "done" : "pending",
    priority: undefined,
    dueAt: t.due_at ?? undefined,
  };
}

export function dbFollowupToDomain(f: DbFollowup): FollowUp {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = f.due_date < today;
  return {
    id: f.id,
    clientId: f.customer_id ?? "",
    clientName: f.customer_name ?? f.text.slice(0, 32),
    reason: isOverdue ? "sin-respuesta" : "recordatorio",
    dueAt: f.due_date,
    notes: f.text,
  };
}

export function dbSaleToDomain(s: DbSale): Sale {
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
    product: s.notes ?? "Venta",
    createdAt: s.created_at,
    paidAt: s.is_paid === 1 ? s.created_at : undefined,
  };
}

export function dbSaleToDueCollection(s: DbSale): DueCollection {
  const due = s.created_at; // We don't track explicit due date yet
  const daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(due).getTime()) / 86400000) - 30);
  return {
    id: s.id,
    saleId: s.id,
    clientId: s.customer_id ?? "",
    clientName: s.customer_name ?? "Sin cliente",
    amount: s.balance,
    dueAt: due,
    daysOverdue,
    product: s.notes ?? undefined,
  };
}

const CUSTOMER_TYPE_MAP: Record<string, ClientType> = {
  final: "final",
  revendedor: "revendedor",
  mayorista: "mayorista",
  empresa: "empresa",
};

export function dbCustomerToClient(c: DbCustomer): Client {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone ?? undefined,
    email: c.email ?? undefined,
    type: CUSTOMER_TYPE_MAP[c.type] ?? "final",
    status: c.status === "activo" ? "active" : c.status === "dormido" ? "inactive" : c.status === "perdido" ? "risk" : "new",
    lifetimeValue: c.total_sales,
    totalPurchases: undefined,
    notes: c.notes ?? undefined,
    createdAt: c.created_at,
  };
}

export function dbCustomerToInactive(c: DbCustomer, daysSinceContact: number): InactiveClient {
  return {
    client: dbCustomerToClient(c),
    daysSinceContact,
    totalPurchases: c.total_sales,
  };
}
