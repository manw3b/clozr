/**
 * Routes para tablas simples scope-workspace con CRUD genérico:
 * tasks (R4), cash_movements (R4), followups (R4), catalog_items (R5),
 * payment_methods (R5), customer_types (R5), customer_tags (R5).
 *
 * Cada export define una TableSpec con whitelist + roles, y los handlers
 * por path se reutilizan a través de handleGeneric* en _generic.ts.
 */

import {
  type TableSpec,
} from "./_generic";

const ALL_ROLES = new Set(["owner", "admin", "vendedor", "viewer"]);
const STAFF_ROLES = new Set(["owner", "admin", "vendedor"]);
const MGMT_ROLES = new Set(["owner", "admin"]);

/* ── Tasks (R4) ──────────────────────────────────────────────────────── */
export const tasksSpec: TableSpec = {
  table: "tasks",
  editable: [
    "type", "frequency", "title", "notes", "due_at", "completed", "completed_at",
    "completed_by", "assigned_to", "customer_id", "template_id", "target_count", "progress",
  ],
  required: ["title"],
  rolesRead: ALL_ROLES,
  rolesCreate: STAFF_ROLES,
  rolesEdit: STAFF_ROLES,
  rolesDelete: MGMT_ROLES,
  // Plan de equipos: /tasks* → tasks.write (owner/admin/vendedor).
  permission: "tasks.write",
  orderBy: "due_at ASC, created_at DESC",
};

/* ── Cash movements (R4) ─────────────────────────────────────────────── */
export const cashSpec: TableSpec = {
  table: "cash_movements",
  editable: [
    "kind", "amount", "currency", "description", "category",
    "sale_id", "customer_name", "payment_method", "moved_at",
  ],
  required: ["kind", "amount"],
  rolesRead: ALL_ROLES,
  rolesCreate: STAFF_ROLES,
  rolesEdit: MGMT_ROLES,   // Movimientos no se editan así nomás — solo admin/owner
  rolesDelete: MGMT_ROLES,
  // Plan de equipos: /cash* → cash.write (owner/admin/vendedor).
  permission: "cash.write",
  orderBy: "moved_at DESC",
};

/* ── Followups (R4) ──────────────────────────────────────────────────── */
export const followupsSpec: TableSpec = {
  table: "followups",
  editable: [
    "business_id", "customer_id", "customer_name", "reason", "text",
    "due_at", "days_since_contact", "amount", "notes", "completed_at",
  ],
  required: ["customer_id", "text", "due_at"],
  rolesRead: ALL_ROLES,
  rolesCreate: STAFF_ROLES,
  rolesEdit: STAFF_ROLES,
  rolesDelete: STAFF_ROLES,
  orderBy: "due_at ASC",
};

/* ── Catalog items (R5+ extended) ────────────────────────────────────── */
export const catalogSpec: TableSpec = {
  table: "catalog_items",
  editable: [
    "name", "category", "subcategory", "price", "currency", "cost", "sku", "notes",
    "track_stock", "stock", "stock_min", "active", "sort_order",
    "image_path", "condition", "condition_details_json", "custom_fields_json",
    "cost_usd",
  ],
  required: ["name"],
  rolesRead: ALL_ROLES,
  rolesCreate: MGMT_ROLES,
  rolesEdit: MGMT_ROLES,
  rolesDelete: MGMT_ROLES,
  // Plan de equipos: /catalog* → inventory.write (owner/admin).
  permission: "inventory.write",
  orderBy: "sort_order ASC, category ASC, name ASC",
};

/* ── Payment methods (R5) ────────────────────────────────────────────── */
export const paymentMethodsSpec: TableSpec = {
  table: "payment_methods",
  editable: ["name", "sort_order", "enabled", "currency"],
  required: ["name"],
  rolesRead: ALL_ROLES,
  rolesCreate: MGMT_ROLES,
  rolesEdit: MGMT_ROLES,
  rolesDelete: MGMT_ROLES,
  orderBy: "sort_order ASC, name ASC",
};

/* ── Customer types (R5) ─────────────────────────────────────────────── */
export const customerTypesSpec: TableSpec = {
  table: "customer_types",
  editable: ["name", "description", "color", "sort_order"],
  required: ["name"],
  rolesRead: ALL_ROLES,
  rolesCreate: MGMT_ROLES,
  rolesEdit: MGMT_ROLES,
  rolesDelete: MGMT_ROLES,
  orderBy: "sort_order ASC, name ASC",
};

/* ── Customer tags (R5) ──────────────────────────────────────────────── */
export const customerTagsSpec: TableSpec = {
  table: "customer_tags",
  editable: ["name", "color"],
  required: ["name"],
  rolesRead: ALL_ROLES,
  rolesCreate: STAFF_ROLES,
  rolesEdit: STAFF_ROLES,
  rolesDelete: MGMT_ROLES,
  orderBy: "name ASC",
};

/** Mapa de path-segment → spec. Lo usa el dispatcher para resolver
 *  qué tabla operar sin code duplicado. */
export const SIMPLE_TABLE_SPECS: Record<string, TableSpec> = {
  tasks: tasksSpec,
  cash: cashSpec,
  followups: followupsSpec,
  catalog: catalogSpec,
  "payment-methods": paymentMethodsSpec,
  "customer-types": customerTypesSpec,
  "customer-tags": customerTagsSpec,
};
