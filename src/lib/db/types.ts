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
  priority: string | null;
  position: number | null;
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

export interface ProductConditionDetails {
  color?: string;
  storage?: string;
  battery_percent?: number;
  battery_cycles?: number;
  grade?: string;
  notes?: string;
  purchase_date?: string;
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
  conditionDetails?: ProductConditionDetails;
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
}

export type UpdateCustomerInput = Partial<Omit<CreateCustomerInput, "created_by">>;

export interface CreatePipelineItemInput {
  customer_id: string;
  stage_id: string;
  stage_name: string;
  stage_order: number;
  estimated_value?: number | null;
  created_by?: string | null;
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
