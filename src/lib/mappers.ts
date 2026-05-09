/**
 * Source of truth para conversiones entre el schema de SQLite (lib/db/types)
 * y los tipos del dominio UI (types/domain).
 *
 * Reglas:
 * - Domain types son source of truth. Si un campo no existe en DB, se devuelve undefined / valor sensato.
 * - Cada mapper es puro (sin queries, sin efectos).
 * - Nuevos mappers van acá, no en hooks de pages.
 */
import type {
  Task as DbTask,
  Followup as DbFollowup,
  Sale as DbSale,
  SaleRow as DbSaleRow,
  Customer as DbCustomer,
  PipelineItem as DbPipelineItem,
  CashMovement as DbCashMovement,
  CashMovementType,
  CashDirection,
} from "./db/types";
import type {
  Task,
  FollowUp,
  Sale,
  DueCollection,
  InactiveClient,
  Client,
  ClientType,
  Lead,
  LeadStage,
  LeadPriority,
  CashMovement as DomainCashMovement,
  CashMovementKind,
  CashCategory,
  PaymentMethod,
} from "../types/domain";

/** Maps the DB-stored payment method (snake_case) back to the domain PaymentMethod (kebab-case). */
function paymentMethodFromDb(m: string | null): PaymentMethod | undefined {
  if (!m) return undefined;
  const map: Record<string, PaymentMethod> = {
    efectivo: "efectivo",
    transferencia: "transferencia",
    mercadopago: "mercadopago",
    tarjeta_credito: "tarjeta-credito",
    tarjeta_debito: "tarjeta-debito",
    cuenta_corriente: "cuenta-corriente",
    usdt: "usdt",
  };
  return map[m];
}

/* ── Helpers puros ──────────────────────────────────────────── */

export function greetingForHour(h: number): "morning" | "afternoon" | "evening" | "night" {
  if (h < 12) return "morning";
  if (h < 19) return "afternoon";
  if (h < 22) return "evening";
  return "night";
}

export function nameInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? "";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

/* ── Tasks ──────────────────────────────────────────────────── */

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

/* ── Followups ──────────────────────────────────────────────── */

export function dbFollowupToDomain(f: DbFollowup): FollowUp {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = f.due_date < today;
  // Reason desde el kind del DB; si no hay kind, deriva del estado
  let reason: FollowUp["reason"];
  if (f.kind === "auto-postsale") reason = "post-venta";
  else if (f.kind === "auto-inactive") reason = "cliente-inactivo";
  else if (f.kind === "cobro-pendiente") reason = "cobro-pendiente";
  else reason = isOverdue ? "sin-respuesta" : "recordatorio";
  return {
    id: f.id,
    clientId: f.customer_id ?? "",
    clientName: f.customer_name ?? f.text.slice(0, 32),
    reason,
    dueAt: f.due_date,
    notes: f.text,
  };
}

/* ── Sales ──────────────────────────────────────────────────── */

function saleStatus(isPaid: number, totalPaid: number): Sale["status"] {
  if (isPaid === 1) return "paid";
  if (totalPaid > 0) return "partial";
  return "pending";
}

export function dbSaleToDomain(s: DbSale): Sale {
  return {
    id: s.id,
    number: `V-${s.id.slice(0, 6).toUpperCase()}`,
    clientId: s.customer_id ?? "",
    clientName: s.customer_name ?? "Sin cliente",
    amount: s.total,
    currency: "ARS",
    status: saleStatus(s.is_paid, s.total_paid),
    paid: s.total_paid,
    pending: s.balance,
    product: s.notes ?? "Venta",
    paymentMethod: paymentMethodFromDb(s.payment_method),
    createdAt: s.created_at,
    paidAt: s.is_paid === 1 ? s.created_at : undefined,
    notes: s.notes ?? undefined,
  };
}

export function dbSaleRowToDomain(s: DbSaleRow): Sale {
  return {
    id: s.id,
    number: `V-${s.id.slice(0, 6).toUpperCase()}`,
    clientId: s.customer_id ?? "",
    clientName: s.customer_name ?? "Sin cliente",
    // Nuevo modelo: sales.total siempre en USD (fuente de verdad).
    // Las ventas antiguas pre-refactor pueden mostrar el símbolo USD aunque
    // se hayan registrado en ARS — aceptable transitoriamente.
    amount: s.total,
    currency: "USD",
    status: saleStatus(s.is_paid, s.total_paid),
    paid: s.total_paid,
    pending: s.balance,
    product: s.items_preview ?? s.notes ?? "Venta",
    paymentMethod: paymentMethodFromDb(s.payment_method),
    createdAt: s.created_at,
    paidAt: s.is_paid === 1 ? s.created_at : undefined,
    notes: s.notes ?? undefined,
  };
}

export function dbSaleToDueCollection(s: DbSale): DueCollection {
  const due = s.created_at;
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

/* ── Customers ──────────────────────────────────────────────── */

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
    status:
      c.status === "activo"
        ? "active"
        : c.status === "dormido"
          ? "inactive"
          : c.status === "perdido"
            ? "risk"
            : "new",
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

/* ── Pipeline (Lead) ────────────────────────────────────────── */

const STAGE_LABEL_TO_ID: Record<string, LeadStage> = {
  prospecto: "prospecto",
  prospect: "prospecto",
  contactado: "contactado",
  contacted: "contactado",
  "visita agendada": "visita-agendada",
  "visita-agendada": "visita-agendada",
  presupuestado: "presupuestado",
  negociando: "negociando",
  cerrado: "cerrado",
  perdido: "perdido",
};

export function leadStageFromDb(stageNameOrId: string): LeadStage {
  return STAGE_LABEL_TO_ID[stageNameOrId.toLowerCase().trim()] ?? "prospecto";
}

export function leadPriorityFromInactiveDays(days: number): LeadPriority {
  if (days >= 14) return "low";
  if (days >= 7) return "medium";
  return "high";
}

function isLeadPriority(s: string | null): s is LeadPriority {
  return s === "low" || s === "medium" || s === "high" || s === "hot";
}

export function dbItemToLead(p: DbPipelineItem): Lead {
  // Use the explicit priority if set, otherwise derive from inactive_days.
  const priority: LeadPriority = isLeadPriority(p.priority)
    ? p.priority
    : leadPriorityFromInactiveDays(p.inactive_days ?? 0);

  return {
    id: p.id,
    clientId: p.customer_id,
    clientName: p.customer_name ?? "Sin cliente",
    clientInitials: nameInitials(p.customer_name),
    stage: leadStageFromDb(p.stage_name ?? p.stage_id),
    amount: p.estimated_value ?? undefined,
    currency: (p.currency as "ARS" | "USD") ?? "ARS",
    priority,
    position: p.position ?? undefined,
    product: p.product ?? undefined,
    nextActionAt: p.next_action_at ?? undefined,
    nextActionLabel: p.next_action_label ?? undefined,
    ownerId: p.owner_id ?? undefined,
    ownerName: p.owner_name ?? undefined,
    shortNote: p.short_note ?? undefined,
    visitAt: p.visit_at ?? undefined,
    wholesaleCode: p.wholesale_code ?? undefined,
    createdAt: p.created_at,
    stageChangedAt: p.updated_at,
  };
}

/* ── Cash ───────────────────────────────────────────────────── */

export function cashCategoryFromDb(type: CashMovementType, direction: CashDirection): CashCategory {
  if (direction === "in") {
    if (type === "venta" || type === "cobro") return "sale-payment";
    return "cash-in";
  }
  if (type === "compra") return "supplier";
  return "other";
}

export function cashKindFromDb(direction: CashDirection): CashMovementKind {
  return direction === "in" ? "income" : "expense";
}

export function dbCashMovementToDomain(m: DbCashMovement): DomainCashMovement {
  return {
    id: m.id,
    kind: cashKindFromDb(m.direction),
    amount: m.amount,
    currency: (m.currency as "ARS" | "USD") ?? "ARS",
    description: m.description ?? "(sin descripción)",
    category: cashCategoryFromDb(m.type, m.direction),
    createdAt: m.created_at,
    saleId: m.reference_type === "sale" ? m.reference_id ?? undefined : undefined,
    clientName: m.customer_name ?? undefined,
  };
}

export function cashCategoryToDb(
  category: CashCategory,
  kind: CashMovementKind,
): { type: CashMovementType; direction: CashDirection } {
  const direction: CashDirection = kind === "income" ? "in" : "out";
  let type: CashMovementType = "otro";
  if (category === "sale-payment") type = kind === "income" ? "cobro" : "otro";
  else if (category === "supplier") type = "compra";
  else if (category === "cash-in" || category === "transfer-in") type = "otro";
  else if (kind === "expense") type = "gasto";
  return { type, direction };
}

/* ── Payment methods ────────────────────────────────────────── */

export const PAYMENT_METHOD_TO_DB: Record<PaymentMethod, string> = {
  efectivo: "efectivo",
  transferencia: "transferencia",
  mercadopago: "mercadopago",
  "tarjeta-credito": "tarjeta_credito",
  "tarjeta-debito": "tarjeta_debito",
  "cuenta-corriente": "cuenta_corriente",
  usdt: "usdt",
};
