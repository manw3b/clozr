// Stored value in customers.type — now driven by customer_types table
export type CustomerType = string;

export type CashMovementType = "venta" | "cobro" | "compra" | "gasto" | "otro";
export type CashDirection = "in" | "out";

export interface Business {
  id: string;
  workspace_id: string;
  name: string;
  emoji: string;
  color: string;
  daily_goal: number;
  currency: string;
  active: number;
  sort_order: number;
  created_at: string;
}

export interface CashMovement {
  id: string;
  workspace_id: string;
  business_id: string;
  type: CashMovementType;
  direction: CashDirection;
  amount: number;
  currency: string;
  description: string | null;
  customer_id: string | null;
  customer_name: string | null;
  reference_id: string | null;
  reference_type: string | null;
  created_at: string;
}

export type FollowupKind =
  | "manual"
  | "auto-postsale"
  | "auto-inactive"
  | "cobro-pendiente"
  /** Generado automáticamente cuando un lead cambia de etapa en el pipeline. */
  | "auto-stage";

export interface Followup {
  id: string;
  workspace_id: string;
  business_id: string;
  customer_id: string | null;
  customer_name: string | null;
  text: string;
  due_date: string;
  completed: number;
  completed_at: string | null;
  created_at: string;
  kind?: FollowupKind | null;
}

export interface CashSummary {
  ingresos: number;
  egresos: number;
  balance: number;
}

export interface CreateCashMovementInput {
  type: CashMovementType;
  direction: CashDirection;
  amount: number;
  currency?: string;
  description?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
}

export interface CreateFollowupInput {
  customer_id?: string | null;
  customer_name?: string | null;
  text: string;
  due_date: string;
  kind?: FollowupKind;
}

export interface UrgentPipelineItem {
  id: string;
  customer_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  stage_name: string;
  inactive_days: number;
}

export interface CreateBusinessInput {
  name: string;
  emoji?: string;
  color?: string;
  daily_goal?: number;
  currency?: string;
}
export type CustomerStatus = "activo" | "potencial" | "dormido" | "perdido";
export type TaskType = "rutina" | "puntual";
export type TaskFrequency = "diaria" | "semanal" | "mensual" | "anual" | "custom";
export type PipelineStatus = "open" | "won" | "lost";
export type PipelinePriority = "low" | "medium" | "high" | "hot";
export type ActivityResult = "positivo" | "neutro" | "negativo";
export type CatalogFieldType = "text" | "number" | "imei" | "select" | "date";

export interface Workspace {
  id: string;
  name: string;
  emoji: string;
  color: string;
  plan: string;
  logo_path: string | null;
  daily_goal: number;
  daily_goal_currency: string;
  /** Migration 029: objetivo de cantidad de ventas del día (0 = sin objetivo) */
  daily_goal_count: number;
  created_at: string;
}

export interface ExchangeRate {
  id: string;
  workspace_id: string;
  usd_to_ars: number;
  updated_at: string;
  updated_by: string | null;
}

export interface ProductTemplate {
  id: string;
  brand: string;
  category: string;
  subcategory: string;
  name: string;
  storage: string | null;
  color: string | null;
  screen_size: string | null;
  year: number | null;
  condition: string;
  is_builtin: number;
  image_path: string | null;
  created_at: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  phone: string | null;
  role_description: string | null;
  avatar_color: string | null;
  notes: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  workspace_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: CustomerType;
  status: CustomerStatus;
  pricing_policy_json: string | null;
  barrio: string | null;
  address: string | null;
  notes: string | null;
  avatar_path: string | null;
  total_sales: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Migration 029 — redes sociales opcionales. Handle (sin @) o URL completa. */
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  twitter: string | null;
}

export interface PipelineItem {
  id: string;
  workspace_id: string;
  customer_id: string;
  customer_name: string | null;
  stage_id: string;
  stage_name: string;
  stage_order: number;
  status: PipelineStatus;
  estimated_value: number | null;
  currency: string;
  inactive_days: number;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string | null;
  /** Migration 021 */
  product: string | null;
  next_action_at: string | null;
  next_action_label: string | null;
  owner_id: string | null;
  owner_name: string | null;
  short_note: string | null;
  priority: PipelinePriority | null;
  position: number | null;
  /** Migration 031 */
  wholesale_code: string | null;
  visit_at: string | null;
  /** Migration 033 */
  lead_source: string | null;
  catalog_item_id: string | null;
}

/** KV de configuración por workspace (migration 031). */
export interface WorkspaceSettingRow {
  workspace_id: string;
  key: string;
  value: string | null;
  updated_at: string;
}

export interface PipelineActivity {
  id: string;
  pipeline_item_id: string;
  type: string;
  description: string | null;
  result: ActivityResult | null;
  performed_at: string;
  performed_by: string | null;
}

export interface Task {
  id: string;
  workspace_id: string;
  type: TaskType;
  frequency: TaskFrequency | null;
  custom_days: string | null;
  title: string;
  completed: number;
  completed_at: string | null;
  assigned_to: string | null;
  due_at: string | null;
  created_by: string | null;
  created_at: string;
  /** Migration 030 — si la tarea fue materializada desde un template
   *  obligatorio del owner. Si está, la tarea NO se puede borrar y muestra
   *  badge "Obligatoria" en la UI. */
  template_id: string | null;
  /** Migration 030 — objetivo numérico copiado del template (ej: 30).
   *  Cuando progress >= target_count → completed=1 automático. */
  target_count: number | null;
  /** Migration 030 — contador progresivo del +1. */
  progress: number | null;
}

/** Migration 030 — Template de tarea obligatoria asignada por el dueño. */
export interface AssignedTaskTemplate {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  frequency: "daily" | "weekly" | "monthly";
  /** Horario sugerido HH:MM o NULL (ej: "10:00"). Solo display. */
  target_time: string | null;
  /** Objetivo numérico o NULL. Si está, materializa con contador +1. */
  target_count: number | null;
  /** User al que se le asigna. NULL = a todos los vendedores. */
  assigned_to_user_id: string | null;
  is_active: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  workspace_id: string;
  business_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  seller_id: string | null;
  seller_name: string | null;
  subtotal: number;
  total: number;
  total_paid: number;
  balance: number;
  is_paid: number;
  notes: string | null;
  sale_date: string;
  created_at: string;
  /** Migration 022: denormalized from primary payment */
  payment_method: string | null;
  /** Migration 025: marca de venta fuera de stock pendiente de regularizar */
  out_of_stock_sale: number;
  regularized_at: string | null;
  regularized_by: string | null;
}

/** Migration 023: método de pago configurable por workspace */
export type PaymentMethodKind =
  | "efectivo"
  | "transferencia"
  | "mercadopago"
  | "tarjeta_credito"
  | "tarjeta_debito"
  | "cuenta_corriente"
  | "usdt"
  | "otro";

export interface PaymentMethodRow {
  id: string;
  workspace_id: string;
  name: string;
  modifier_pct: number;
  currency: "ARS" | "USD";
  kind: PaymentMethodKind;
  active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Migration 024: precios del catálogo por tipo de cliente */
export interface CatalogPriceRow {
  catalog_item_id: string;
  customer_type_id: string;
  price_usd: number;
  updated_at: string;
}

/** Migration 025: precios override por unidad individual de stock */
export interface StockItemPriceRow {
  stock_item_id: string;
  customer_type_id: string;
  price_usd: number;
  updated_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  catalog_item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  base_price: number | null;
  subtotal: number;
  imei: string | null;
  from_stock: number;
}

export interface SalePayment {
  id: string;
  sale_id: string;
  method: string;
  currency: string;
  amount: number;
  is_deposit: number;
}

export interface CatalogItem {
  id: string;
  workspace_id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  price: number | null;
  currency: string;
  track_stock: number;
  stock: number;
  stock_min: number;
  active: number;
  sort_order: number;
  custom_fields_json: string | null;
  image_path: string | null;
  condition: 'new' | 'used' | 'refurbished';
  condition_details_json: string | null;
  /** Migration 024: costo en USD del producto */
  cost_usd?: number;
  created_at: string;
}

export interface CatalogFieldTemplate {
  id: string;
  workspace_id: string;
  category: string | null;
  field_key: string;
  field_label: string;
  field_type: CatalogFieldType;
  options_json: string | null;
  required: number;
  sort_order: number;
}

// Input types

export interface CreateCustomerInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  type?: CustomerType;
  status?: CustomerStatus;
  barrio?: string | null;
  address?: string | null;
  notes?: string | null;
  pricing_policy_json?: string | null;
  avatar_path?: string | null;
  created_by?: string | null;
  /** Migration 029 — redes opcionales. */
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  twitter?: string | null;
}

export type UpdateCustomerInput = Partial<Omit<CreateCustomerInput, "created_by">>;

export interface CreatePipelineItemInput {
  customer_id: string;
  stage_id: string;
  stage_name: string;
  stage_order: number;
  estimated_value?: number | null;
  currency?: "ARS" | "USD";
  created_by?: string | null;
  product?: string | null;
  priority?: PipelinePriority | null;
  next_action_at?: string | null;
  next_action_label?: string | null;
  short_note?: string | null;
  customer_name?: string | null;
  /** De dónde llegó el lead (referido/walk-in/web/redes/otro). */
  lead_source?: string | null;
  /** Si el producto fue elegido del catálogo, su id queda asociado. */
  catalog_item_id?: string | null;
}

export interface CreateActivityInput {
  type: string;
  description?: string | null;
  result?: ActivityResult | null;
  performed_by?: string | null;
}

export interface CreateTaskInput {
  type: TaskType;
  frequency?: TaskFrequency | null;
  custom_days?: string | null;
  title: string;
  due_at?: string | null;
  created_by?: string | null;
}

export interface CreateSaleInput {
  customer_id?: string | null;
  customer_name?: string | null;
  seller_id?: string | null;
  seller_name?: string | null;
  notes?: string | null;
  business_id?: string | null;
  /** Migration 025: marca como venta fuera de stock (queda pendiente de regularizar). */
  out_of_stock_sale?: boolean;
  /** Cotización USD→ARS al momento de la venta. Usada para convertir payments
   * en ARS a USD para sales.total_paid y balance (todos en USD). */
  usd_to_ars?: number;
  items: Array<{
    catalog_item_id?: string | null;
    description: string;
    quantity: number;
    unit_price: number;
    base_price?: number | null;
    imei?: string | null;
    from_stock?: boolean;
  }>;
  payments: Array<{
    method: string;
    currency?: string;
    amount: number;
    is_deposit?: boolean;
  }>;
}

export interface UpdateSaleInput {
  notes: string | null;
  payments: Array<{
    method: string;
    currency: string;
    amount: number;
    is_deposit: boolean;
  }>;
}

export interface CreateCatalogItemInput {
  name: string;
  category?: string | null;
  subcategory?: string | null;
  price?: number | null;
  currency?: string;
  track_stock?: boolean;
  stock?: number;
  stock_min?: number;
  sort_order?: number;
  custom_fields_json?: string | null;
  image_path?: string | null;
  condition?: 'new' | 'used' | 'refurbished';
  condition_details_json?: string | null;
}

export type UpdateCatalogItemInput = Partial<CreateCatalogItemInput & { active: boolean }>;

export interface CreateCatalogFieldTemplateInput {
  category: string | null;
  field_key: string;
  field_label: string;
  field_type: CatalogFieldType;
  options_json?: string | null;
  required?: boolean;
  sort_order?: number;
}

export interface CatalogImei {
  id: string;
  catalog_item_id: string;
  imei: string;
  sold_at: string | null;
  sale_id: string | null;
}

export interface SalesMetrics {
  total_sales: number;
  total_revenue: number;
  avg_ticket: number;
  this_month: number;
  last_month: number;
  total_pending: number;
  month_sales_count: number;
}

export interface TopCustomer {
  customer_id: string;
  customer_name: string;
  purchases: number;
  total_spent: number;
  avg_ticket: number;
  last_purchase: string;
}

export interface VendorStats {
  seller_id: string | null;
  seller_name: string | null;
  sales_count: number;
  total_revenue: number;
  avg_ticket: number;
}

export interface MonthlyRevenue {
  month: string;
  sales_count: number;
  revenue: number;
}

export interface SaleRow extends Sale {
  items_count: number;
  items_preview: string | null;
}

export interface CatalogItemWithImeis extends CatalogItem {
  available_imeis: number;
  total_imeis: number;
}

export interface StockViewItem extends CatalogItemWithImeis {
  last_sale_date: string | null;
}

export interface CatalogImeiRow extends CatalogImei {
  product_name: string;
}

export type MemberRole = "owner" | "admin" | "vendedor" | "viewer";

export interface WorkspaceMember {
  user_id: string;
  workspace_id: string;
  role: MemberRole;
  joined_at: string;
  name: string;
  email: string;
  phone: string | null;
  role_description: string | null;
  avatar_color: string | null;
  notes: string | null;
}

export interface PipelineStage {
  id: string;
  workspace_id: string;
  name: string;
  stage_order: number;
  color: string;
  is_won: number;
  is_lost: number;
  created_at: string;
}

export interface CustomerTypeRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
}

export interface CatalogCategoryRow {
  id: string;
  workspace_id: string;
  name: string;
  sort_order: number;
}

export interface InventorySummary {
  total_items: number;
  in_stock: number;
  out_of_stock: number;
  total_value: number;
}
