/**
 * Tipos compartidos del dominio Clozr.
 * Estos van a usarse por TanStack Query, Zustand stores y los plugins de Tauri/SQLite.
 */

export type ClientType = 'final' | 'revendedor' | 'mayorista' | 'empresa';
export type ClientStatus = 'active' | 'inactive' | 'risk' | 'new';

/** Etiqueta visual asignable a un cliente. Coincide con la fila de la
 *  tabla customer_tags (resumen — sólo los campos que el front necesita
 *  para renderizar). */
export interface ClientTag {
  id: string;
  name: string;
  color: string;
}

export interface Client {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  type: ClientType;
  status?: ClientStatus;
  lastContactAt?: string;
  lastPurchaseAt?: string;
  lifetimeValue?: number;
  balanceDue?: number;
  totalPurchases?: number;
  notes?: string;
  createdAt?: string;
  /** Etiquetas asignadas. Configurables desde Settings → Etiquetas. */
  tags?: ClientTag[];
  /** Redes sociales opcionales (handle sin @ o URL completa). Migration 029. */
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  twitter?: string;
}

/* ============================================================
 *  Lead
 * ============================================================ */

/**
 * El id de una etapa del pipeline.
 *
 * Antes era un union literal cerrado, pero ahora las etapas son configurables
 * por workspace (tabla pipeline_stages) y pueden tener id custom (UUID o
 * slug). Mantenemos los semantic ids viejos como referencia/seed pero el
 * tipo es `string` para soportar etapas custom.
 */
export type LeadStage = string;
export type CanonicalLeadStage =
  | 'prospecto'
  | 'contactado'
  | 'visita-agendada'
  | 'presupuestado'
  | 'negociando'
  | 'cerrado'
  | 'perdido';

export type LeadPriority = 'low' | 'medium' | 'high' | 'hot';

export interface Lead {
  id: string;
  clientId: string;
  clientName: string;
  clientInitials?: string;
  clientType?: ClientType;
  stage: LeadStage;
  position?: number;
  amount?: number;
  currency?: 'ARS' | 'USD';
  product?: string;
  priority?: LeadPriority;
  createdAt: string;
  stageChangedAt?: string;
  nextActionAt?: string;
  nextActionLabel?: string;
  ownerId?: string;
  ownerName?: string;
  shortNote?: string;
  /** Hora exacta de la visita (sólo cuando stage = visita-agendada). */
  visitAt?: string;
  /** Código mayorista asignado al agendar (ej "B1202"). */
  wholesaleCode?: string;
  /** De dónde llegó el lead — sirve para reportes "qué canal me trae plata". */
  source?: LeadSource;
  /** Si el producto fue elegido del catálogo, su id queda asociado al
   *  lead para poder traer precios sugeridos al convertir a venta. */
  catalogItemId?: string;
}

export type LeadSource = 'referido' | 'walk-in' | 'web' | 'redes' | 'otro';
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  referido: 'Referido',
  'walk-in': 'Walk-in',
  web: 'Web',
  redes: 'Redes',
  otro: 'Otro',
};

/* ============================================================
 *  Tareas
 * ============================================================ */

export type TaskType = 'puntual' | 'rutina';
export type TaskStatus = 'pending' | 'done' | 'snoozed';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;
  priority?: TaskPriority;
  dueAt?: string;
  clientId?: string;
  clientName?: string;
  /** Migration 030 — si fue materializada desde un template obligatorio. */
  templateId?: string;
  /** Migration 030 — meta numérica (ej: 30 personas). */
  targetCount?: number;
  /** Migration 030 — contador progresivo +1. */
  progress?: number;
}

export type FollowUpReason =
  | 'cotizacion-enviada'
  | 'lead-tibio'
  | 'sin-respuesta'
  | 'recordatorio'
  | 'cobro-pendiente'
  | 'post-venta'
  | 'cliente-inactivo';

export interface FollowUp {
  id: string;
  clientId: string;
  clientName: string;
  reason: FollowUpReason;
  dueAt: string;
  daysSinceContact?: number;
  amount?: number;
  notes?: string;
}

/* ============================================================
 *  Ventas — extendido
 * ============================================================ */

export type SaleStatus = 'paid' | 'partial' | 'pending';

export type PaymentMethod =
  | 'efectivo'
  | 'transferencia'
  | 'mercadopago'
  | 'tarjeta-credito'
  | 'tarjeta-debito'
  | 'cuenta-corriente'
  | 'usdt';

export interface SaleItem {
  id: string;
  product: string;
  /** SKU o IMEI */
  sku?: string;
  quantity: number;
  unitPrice: number;
  /** Precio total = unitPrice * quantity (lo guardamos para no recalcular) */
  total: number;
}

export interface Sale {
  id: string;
  /** Número de venta visible (ej: V-0042) */
  number?: string;

  clientId: string;
  clientName: string;
  clientInitials?: string;

  /** Total de la venta */
  amount: number;
  currency?: 'ARS' | 'USD';

  status: SaleStatus;
  /** Monto cobrado hasta el momento */
  paid: number;
  /** Lo que falta cobrar (amount - paid, si status !== 'paid') */
  pending?: number;

  /** Producto principal — texto corto para mostrar en tabla */
  product: string;
  /** Items detallados — para drawer de detalle */
  items?: SaleItem[];

  paymentMethod?: PaymentMethod;
  /** Fecha de creación */
  createdAt: string;
  /** Fecha de pago final (cuando status === 'paid') */
  paidAt?: string;
  /** Vencimiento del pago si está pendiente/parcial */
  dueAt?: string;

  ownerId?: string;
  ownerName?: string;

  notes?: string;
}

/* ============================================================
 *  Caja — extendido
 * ============================================================ */

export type CashMovementKind = 'income' | 'expense';

export type CashCategory =
  /* income */
  | 'sale-payment'   // pago de una venta
  | 'cash-in'        // ingreso manual
  | 'transfer-in'    // transferencia recibida
  /* expense */
  | 'supplier'       // pago a proveedor
  | 'salary'         // sueldo
  | 'rent'           // alquiler
  | 'utilities'      // servicios
  | 'transport'      // logística / envíos
  | 'fees'           // comisiones (MP, banco)
  | 'cash-out'       // retiro
  | 'other';

export interface CashMovement {
  id: string;
  kind: CashMovementKind;
  amount: number;
  currency: 'ARS' | 'USD';
  description: string;
  category: CashCategory;
  /** ISO date */
  createdAt: string;
  /** Si está vinculada a una venta */
  saleId?: string;
  saleNumber?: string;
  clientName?: string;
  paymentMethod?: PaymentMethod;
  /** Quién registró el movimiento */
  by?: string;
}

export interface DueCollection {
  id: string;
  saleId: string;
  clientId: string;
  clientName: string;
  /** Lo que falta cobrar (= sale.balance). */
  amount: number;
  /** Total facturado de la venta (para mostrar "X de Y" en el cobro). */
  total: number;
  /** Moneda de la venta. Hoy siempre ARS por el contexto AR; cuando
   *  haya ventas USD nativas hay que derivarla del payment original. */
  currency: 'ARS' | 'USD';
  dueAt: string;
  daysOverdue: number;
  product?: string;
}

export interface InactiveClient {
  client: Client;
  daysSinceContact: number;
  totalPurchases: number;
}

/* ============================================================
 *  Resumen de caja del día
 * ============================================================ */

export interface CashSummary {
  /** ISO date — fecha del resumen */
  date: string;
  /** Saldo de apertura del día */
  openingBalance: { ars: number; usd: number };
  /** Total ingresos del día */
  totalIncome: { ars: number; usd: number };
  /** Total egresos del día */
  totalExpense: { ars: number; usd: number };
  /** Balance actual = opening + income - expense */
  currentBalance: { ars: number; usd: number };
  /** Cotización USD vigente */
  usdRate: number;
  /** Movimientos del día */
  movements: CashMovement[];
}

/* ============================================================
 *  Detalle de cliente
 * ============================================================ */

export type ActivityKind =
  | 'sale'
  | 'payment'
  | 'contact'
  | 'note'
  | 'lead-stage-change'
  | 'task'
  | 'created';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  at: string;
  title: string;
  description?: string;
  amount?: number;
  by?: string;
}

export interface ClientDetail extends Client {
  sales: Sale[];
  outstandingDebts: Array<{
    saleId: string;
    amount: number;
    dueAt: string;
    daysOverdue: number;
    product: string;
  }>;
  activity: ActivityItem[];
}

/* ============================================================
 *  Estado agregado de "Mi Día"
 * ============================================================ */

export interface DailyGoal {
  amount: number;
  current: number;
  salesCount: number;
  salesGoal?: number;
}

export interface MyDayData {
  greeting: 'morning' | 'afternoon' | 'evening' | 'night';
  user: { name: string };
  workspace: { name: string };
  date: string;
  goal: DailyGoal;
  tasks: Task[];
  followUps: FollowUp[];
  todaySales: Sale[];
  dueCollections: DueCollection[];
  inactiveClients: InactiveClient[];
  score: number;
}

/* ============================================================
 *  Pipeline — config
 * ============================================================ */

export interface StageConfig {
  id: LeadStage;
  label: string;
  /** ID de la paleta unificada (lib/colorPalette.ts). */
  color: string;
  probability?: number;
  terminal?: boolean;
  /** Migración a stages dinámicos: marca la columna que cuenta como
   *  "ganado" / "perdido" para acciones tipo "Marcar como ganado". */
  isWon?: boolean;
  isLost?: boolean;
  /** Para preservar el orden cuando viene de DB. */
  order?: number;
}

// FALLBACK del kanban cuando la query de pipeline_stages todavía no cargó.
// IDs alineados con DEFAULT_PIPELINE_STAGES en lib/db/settings.ts — si los
// desalineás, se rompe el drag-to-stage: useMoveLead no encuentra el
// stageConfig para el id de destino y el persist se aborta en silencio.
// Si cambiás esta lista, cambiá la otra. Mejor todavía: en algún momento
// unificarlas en una sola constante exportada desde acá.
export const STAGES: StageConfig[] = [
  { id: 'prospecto', label: 'Prospecto', color: 'slate', probability: 0.1 },
  { id: 'contactado', label: 'Contactado', color: 'blue', probability: 0.2 },
  { id: 'visita_agendada', label: 'Visita agendada', color: 'cyan', probability: 0.4 },
  { id: 'presupuestado', label: 'Presupuestado', color: 'yellow', probability: 0.5 },
  { id: 'aprobado', label: 'Aprobado', color: 'amber', probability: 0.7 },
  { id: 'instalado', label: 'Instalado', color: 'green', probability: 0.9 },
  { id: 'cobrado', label: 'Cobrado', color: 'green', probability: 1, terminal: true },
  { id: 'perdido', label: 'Perdido', color: 'red', probability: 0, terminal: true },
];

/* ============================================================
 *  Labels para UI
 * ============================================================ */

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  'efectivo': 'Efectivo',
  'transferencia': 'Transferencia',
  'mercadopago': 'MercadoPago',
  'tarjeta-credito': 'Tarjeta crédito',
  'tarjeta-debito': 'Tarjeta débito',
  'cuenta-corriente': 'Cuenta corriente',
  'usdt': 'USDT',
};

export const CASH_CATEGORY_LABELS: Record<CashCategory, string> = {
  'sale-payment': 'Pago de venta',
  'cash-in': 'Ingreso manual',
  'transfer-in': 'Transferencia recibida',
  'supplier': 'Proveedor',
  'salary': 'Sueldo',
  'rent': 'Alquiler',
  'utilities': 'Servicios',
  'transport': 'Logística / Envíos',
  'fees': 'Comisiones',
  'cash-out': 'Retiro',
  'other': 'Otro',
};
