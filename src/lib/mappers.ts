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
import { toLocalISODate } from "./format";

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
    templateId: t.template_id ?? undefined,
    targetCount: t.target_count ?? undefined,
    progress: t.progress ?? undefined,
  };
}

/* ── Followups ──────────────────────────────────────────────── */

export function dbFollowupToDomain(f: DbFollowup): FollowUp {
  const today = toLocalISODate();
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
    // sales.total está en USD (fuente de verdad del escritorio). Mapper legacy
    // que todavía alimenta la vista de Clientes (useClientsData).
    amount: s.total,
    currency: "USD",
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
    total: s.total,
    // sales.balance/total están en USD (fuente de verdad del escritorio), así
    // que el saldo se muestra en dólares. Al cobrar, el método de pago elegido
    // define la moneda del nuevo pago (ARS o USD).
    currency: "USD",
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
    // El status base viene del DB column (manual). Se OVERRIDE en
    // useClientsList con deriveActivityStatus(lastContactAt, createdAt)
    // para reflejar actividad real sin pedirle al usuario que lo marque
    // cliente por cliente.
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
    instagram: c.instagram ?? undefined,
    facebook: c.facebook ?? undefined,
    tiktok: c.tiktok ?? undefined,
    twitter: c.twitter ?? undefined,
  };
}

/**
 * Deriva el "status de actividad" de un cliente según cuándo fue su último
 * contacto. Reemplaza el flag manual `customers.status` del schema (que
 * casi nadie actualizaba) por una clasificación automática que se calcula
 * en cada read.
 *
 * Umbrales:
 *  - sin contacto y creado hace ≤30d → "new"      (cliente reciente)
 *  - último contacto ≤30d            → "active"   (todo bien)
 *  - último contacto 31-90d          → "inactive" (dormido, hay que despertar)
 *  - último contacto >90d            → "risk"     (perdiéndose)
 *  - sin contacto y creado hace >30d → "inactive" (nunca lo trabajamos)
 *
 * Si en el futuro querés umbrales configurables por workspace, mover acá
 * a un parámetro. Por ahora estos números son razonables para iPhone Club.
 */
export function deriveActivityStatus(
  lastContactAt: string | null | undefined,
  createdAt: string,
): import("../types/domain").ClientStatus {
  const DAY = 86_400_000;
  const now = Date.now();

  if (!lastContactAt) {
    const ageMs = now - new Date(createdAt).getTime();
    return ageMs <= 30 * DAY ? "new" : "inactive";
  }

  const sinceMs = now - new Date(lastContactAt).getTime();
  const days = sinceMs / DAY;

  if (days <= 30) return "active";
  if (days <= 90) return "inactive";
  return "risk";
}

export function dbCustomerToInactive(c: DbCustomer, daysSinceContact: number): InactiveClient {
  return {
    client: dbCustomerToClient(c),
    daysSinceContact,
    totalPurchases: c.total_sales,
  };
}

/* ── Pipeline (Lead) ────────────────────────────────────────── */

/**
 * Mapeo legacy: en versiones viejas de la app, pipeline_items.stage_name
 * guardaba el LABEL en castellano ("Visita Agendada") en vez del id. Acá
 * canonicalizamos. Para stages custom (id desconocido), devolvemos el
 * input tal cual para que el renderer dinámico los matche por id.
 */
const STAGE_LABEL_TO_ID: Record<string, LeadStage> = {
  prospecto: "prospecto",
  prospect: "prospecto",
  contactado: "contactado",
  contacted: "contactado",
  "visita agendada": "visita-agendada",
  "visita-agendada": "visita-agendada",
  visita_agendada: "visita-agendada",
  presupuestado: "presupuestado",
  negociando: "negociando",
  cerrado: "cerrado",
  perdido: "perdido",
};

export function leadStageFromDb(stageNameOrId: string): LeadStage {
  if (!stageNameOrId) return "prospecto";
  const key = stageNameOrId.toLowerCase().trim();
  // Si lo conocemos en el mapeo legacy, devolvemos el id canonical;
  // si no, asumimos que ya es un id válido (custom stage).
  return STAGE_LABEL_TO_ID[key] ?? stageNameOrId;
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
    // stage_id es la fuente de verdad de pipeline_stages.id — pasa como
    // está (los ids custom como UUID o "visita_agendada" con guion bajo
    // tienen que sobrevivir al round-trip sin que el mapper legacy los
    // transforme). Sólo si no hay stage_id caemos al label legacy.
    stage: p.stage_id || leadStageFromDb(p.stage_name ?? ""),
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
    source: (p.lead_source as Lead["source"]) ?? undefined,
    catalogItemId: p.catalog_item_id ?? undefined,
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
