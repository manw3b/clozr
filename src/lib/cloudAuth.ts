/**
 * Cliente del backend de auth (Cloudflare Worker).
 *
 * 2 funciones expuestas:
 *   - requestMagicLink(email): POSTea al worker, dispara el envío del email
 *   - parseJwtPayload(jwt): decodifica el payload sin validar firma (la
 *     validación de firma queda del lado del worker; en cliente solo
 *     necesitamos leer exp/uid/sub).
 *
 * La validación criptográfica del JWT NO se hace acá — el client se fía
 * del backend. La razón: si alguien comprometió tu localStorage para meter
 * un JWT falso, ya tiene acceso al disco y a TODO. Validar la firma client-
 * side no agrega seguridad real; sí da overhead inútil.
 */

/**
 * URL base del worker de auth.
 *
 * Permitimos override via env var de Vite (VITE_AUTH_WORKER_URL) para
 * que en development local puedas apuntar a `wrangler dev` (localhost:8787)
 * sin tener que tocar este archivo. En prod usa el worker desplegado.
 *
 * Setear en .env.local de la raíz:
 *   VITE_AUTH_WORKER_URL=http://localhost:8787
 */
const AUTH_BASE =
  (import.meta.env.VITE_AUTH_WORKER_URL as string | undefined) ??
  "https://clozr-auth.pyter-import.workers.dev";

export interface RequestMagicLinkResult {
  ok: boolean;
  sentTo?: string;
  expiresInMin?: number;
  error?: string;
}

/**
 * Pide al worker que mande un magic link a `email`. El worker valida
 * formato, inserta token en magic_links, manda email via Resend.
 *
 * No throwa errors HTTP — los devuelve en el shape { ok: false, error }
 * para que la UI los muestre sin try/catch.
 */
export async function requestMagicLink(email: string): Promise<RequestMagicLinkResult> {
  try {
    const res = await fetch(`${AUTH_BASE}/auth/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = (await res.json()) as RequestMagicLinkResult;
    if (!res.ok) return { ok: false, error: data.error ?? `http_${res.status}` };
    return data;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network_error" };
  }
}

export interface VerifyCodeResult {
  ok: boolean;
  jwt?: string;
  email?: string;
  userId?: string;
  sessionId?: string;
  /** unix seconds */
  expiresAt?: number;
  error?: string;
}

/**
 * Valida el código de 6 dígitos contra el worker. Alternativa al deep
 * link — útil cuando el user lee el email en otro dispositivo y escribe
 * el código en la PC donde corre Clozr.
 *
 * Errores típicos del worker: invalid_code, already_used, expired,
 * invalid_code_format.
 */
export async function verifyCode(email: string, code: string): Promise<VerifyCodeResult> {
  try {
    const res = await fetch(`${AUTH_BASE}/auth/verify-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const data = (await res.json()) as VerifyCodeResult;
    if (!res.ok) return { ok: false, error: data.error ?? `http_${res.status}` };
    return data;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network_error" };
  }
}

/* ── JWT helpers ─────────────────────────────────────────────────────── */

export interface JwtPayload {
  /** subject — session_id */
  sub: string;
  /** user_id */
  uid: string;
  /** issued at (unix seconds) */
  iat: number;
  /** expiration (unix seconds) */
  exp: number;
}

/**
 * Decodifica el payload de un JWT base64url. NO valida firma.
 * Devuelve null si el formato es malo (3 partes, payload válido JSON,
 * tiene los campos requeridos).
 */
export function parseJwtPayload(jwt: string): JwtPayload | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const payloadB64 = parts[1];
  if (!payloadB64) return null;
  try {
    const json = b64urlDecode(payloadB64);
    const obj = JSON.parse(json) as Partial<JwtPayload>;
    if (typeof obj.sub !== "string" || typeof obj.uid !== "string" ||
        typeof obj.iat !== "number" || typeof obj.exp !== "number") {
      return null;
    }
    return { sub: obj.sub, uid: obj.uid, iat: obj.iat, exp: obj.exp };
  } catch {
    return null;
  }
}

function b64urlDecode(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return atob(padded);
}

/* ── API authenticated calls ─────────────────────────────────────────── */

/**
 * Listener para 401 (JWT expirado o revocado server-side). La app lo
 * registra al boot via onAuthExpired() y limpia el cloudAuthStore +
 * muestra toast. Lo dejamos como callback en vez de import directo para
 * evitar circular dependency cloudAuth ↔ cloudAuthStore (este file no
 * importa el store; el caller subscribe).
 */
let expiredHandler: (() => void) | null = null;
/** Registra el handler global para 401. Llamarse UNA vez al boot de la app. */
export function onAuthExpired(fn: () => void): void {
  expiredHandler = fn;
}

/**
 * Hace un fetch al worker con el JWT del cloudAuthStore en el header.
 * Devuelve { ok, data } o { ok: false, error }. No throwa.
 *
 * El JWT lo lee dinámicamente del store en cada call para que un logout
 * en otra tab/instancia se respete inmediatamente.
 *
 * Si el server responde 401 (JWT expirado / session revocada), invoca
 * el expiredHandler global UNA vez para que la app limpie sesión y
 * muestre toast. Las requests subsiguientes no van a re-disparar
 * porque jwt va a ser null después del clear.
 */
async function authFetch<T>(
  jwt: string | null,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  if (!jwt) return { ok: false, error: "no_jwt" };
  try {
    const res = await fetch(`${AUTH_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${jwt}`,
        "content-type": "application/json",
      },
    });
    const text = await res.text();
    const data = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) {
      const err = (data && typeof data === "object" && "error" in data) ? String((data as { error: unknown }).error) : `http_${res.status}`;
      if (res.status === 401 && expiredHandler) {
        // Dispara una sola vez por ráfaga — el handler se encarga de
        // clearSession() lo que hará que la próxima authFetch reciba
        // jwt=null y nunca llegue acá.
        try { expiredHandler(); } catch { /* swallow */ }
      }
      return { ok: false, error: err, status: res.status };
    }
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network_error" };
  }
}

/* ── /me ─────────────────────────────────────────────────────────────── */

export interface MeUser {
  id: string;
  email: string;
  name: string | null;
  /** F: "free" | "pro" | "enterprise". Optional para back-compat con
   *  versiones del worker pre-F que no devuelven el campo. */
  plan?: string;
  /** F: nichos comprados. Optional por la misma razón. */
  owned_industries?: string[];
}

export interface MeWorkspace {
  id: string;
  name: string;
  role: "owner" | "admin" | "vendedor" | "viewer";
  status: "active" | "invited" | "revoked";
  /** F: rubro del workspace. Optional para back-compat. */
  industry?: string;
  /** G/A4: meta diaria del workspace compartida en equipo. */
  daily_goal?: number;
  daily_goal_currency?: string;
  daily_goal_count?: number;
  /** I: keys de R2 — el cliente arma `{AUTH_BASE}/assets/{key}`. */
  logo_key?: string | null;
  banner_key?: string | null;
}

export interface MeResponse {
  user: MeUser;
  workspaces: MeWorkspace[];
}

export function fetchMe(jwt: string | null) {
  return authFetch<MeResponse>(jwt, "/me");
}

/* ── /workspaces ─────────────────────────────────────────────────────── */

export interface CreatedWorkspace {
  id: string;
  name: string;
  role: "owner";
  status: "active";
}

export function createWorkspace(jwt: string | null, name: string) {
  return authFetch<CreatedWorkspace>(jwt, "/workspaces", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

/* ── /workspaces/:id/members ─────────────────────────────────────────── */

export interface MemberRow {
  id: string;
  /** ID del user vinculado. Null si la membership está pendiente
   *  (invited, sin login todavía). */
  user_id: string | null;
  email: string;
  role: "owner" | "admin" | "vendedor" | "viewer";
  status: "active" | "invited" | "revoked";
  invited_at: string;
  accepted_at: string | null;
  user_name: string | null;
}

export function listMembers(jwt: string | null, workspaceId: string) {
  return authFetch<{ members: MemberRow[] }>(jwt, `/workspaces/${workspaceId}/members`);
}

export function inviteMember(
  jwt: string | null,
  workspaceId: string,
  email: string,
  role: "admin" | "vendedor" | "viewer",
) {
  return authFetch<MemberRow>(jwt, `/workspaces/${workspaceId}/invite`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export function patchMemberRole(
  jwt: string | null,
  workspaceId: string,
  membershipId: string,
  role: "owner" | "admin" | "vendedor" | "viewer",
) {
  return authFetch<{ ok: true; id: string; role: string }>(jwt, `/workspaces/${workspaceId}/members/${membershipId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function revokeMember(jwt: string | null, workspaceId: string, membershipId: string) {
  return authFetch<{ ok: true; id: string }>(jwt, `/workspaces/${workspaceId}/members/${membershipId}`, {
    method: "DELETE",
  });
}

/* ── /workspaces/:id/customers (F2-B R1) ─────────────────────────────── */

/**
 * Shape de un cliente como viene del worker (espejo del local pero con
 * snake_case y sin total_sales/cloud_id propios).
 */
export interface CloudCustomer {
  id: string;
  workspace_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: string | null;
  status: string | null;
  pricing_policy_json: string | null;
  barrio: string | null;
  address: string | null;
  notes: string | null;
  avatar_path: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  twitter: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function fetchCustomers(jwt: string | null, workspaceId: string) {
  return authFetch<{ customers: CloudCustomer[] }>(jwt, `/workspaces/${workspaceId}/customers`);
}

/** Crea un cliente. Si `id` viene en el payload lo respetamos (útil
 *  para mantener el id local sincronizado). Si no, el server genera UUID. */
export function createCustomerCloud(
  jwt: string | null,
  workspaceId: string,
  payload: Partial<CloudCustomer> & { name: string },
) {
  return authFetch<{ ok: true; id: string }>(jwt, `/workspaces/${workspaceId}/customers`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCustomerCloud(
  jwt: string | null,
  workspaceId: string,
  customerId: string,
  payload: Partial<CloudCustomer>,
) {
  return authFetch<{ ok: true }>(jwt, `/workspaces/${workspaceId}/customers/${customerId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteCustomerCloud(jwt: string | null, workspaceId: string, customerId: string) {
  return authFetch<{ ok: true }>(jwt, `/workspaces/${workspaceId}/customers/${customerId}`, {
    method: "DELETE",
  });
}

/**
 * Sube todos los clientes locales al workspace cloud. Idempotente: si
 * el id ya existe, lo skipea. Solo lo puede correr el owner.
 *
 * Devuelve { imported, skipped, errors[] }.
 */
export function importCustomersCloud(
  jwt: string | null,
  workspaceId: string,
  customers: Array<Partial<CloudCustomer> & { id: string; name: string }>,
) {
  return authFetch<{
    ok: true;
    imported: number;
    skipped: number;
    errors: Array<{ id: string; error: string }>;
  }>(jwt, `/workspaces/${workspaceId}/customers/import`, {
    method: "POST",
    body: JSON.stringify({ customers }),
  });
}

/* ── /workspaces/:id/pipeline (F2-B R2) ─────────────────────────────── */

export interface CloudPipelineStage {
  id: string;
  name: string;
  stage_order: number;
  color: string | null;
  is_won: number;
  is_lost: number;
  created_at: string;
}

export interface CloudPipelineItem {
  id: string;
  workspace_id: string;
  customer_id: string;
  customer_name: string | null;
  stage_id: string;
  stage_name: string;
  stage_order: number;
  status: string;
  estimated_value: number | null;
  currency: string | null;
  product: string | null;
  priority: string | null;
  position: number | null;
  next_action_at: string | null;
  next_action_label: string | null;
  owner_id: string | null;
  owner_name: string | null;
  short_note: string | null;
  lead_source: string | null;
  catalog_item_id: string | null;
  wholesale_code: string | null;
  visit_at: string | null;
  inactive_days: number | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* Stages */
export function fetchPipelineStages(jwt: string | null, workspaceId: string) {
  return authFetch<{ stages: CloudPipelineStage[] }>(jwt, `/workspaces/${workspaceId}/pipeline/stages`);
}
export function createPipelineStageCloud(jwt: string | null, workspaceId: string, payload: Partial<CloudPipelineStage> & { id?: string; name: string }) {
  return authFetch<{ ok: true; id: string }>(jwt, `/workspaces/${workspaceId}/pipeline/stages`, {
    method: "POST", body: JSON.stringify(payload),
  });
}
export function updatePipelineStageCloud(jwt: string | null, workspaceId: string, stageId: string, payload: Partial<CloudPipelineStage>) {
  return authFetch<{ ok: true }>(jwt, `/workspaces/${workspaceId}/pipeline/stages/${stageId}`, {
    method: "PATCH", body: JSON.stringify(payload),
  });
}
export function deletePipelineStageCloud(jwt: string | null, workspaceId: string, stageId: string) {
  return authFetch<{ ok: true }>(jwt, `/workspaces/${workspaceId}/pipeline/stages/${stageId}`, { method: "DELETE" });
}
export function importPipelineStagesCloud(jwt: string | null, workspaceId: string, stages: Array<Partial<CloudPipelineStage> & { id: string; name: string }>) {
  return authFetch<{ ok: true; imported: number; skipped: number }>(jwt, `/workspaces/${workspaceId}/pipeline/stages/import`, {
    method: "POST", body: JSON.stringify({ stages }),
  });
}

/* Items */
export function fetchPipelineItems(jwt: string | null, workspaceId: string) {
  return authFetch<{ items: CloudPipelineItem[] }>(jwt, `/workspaces/${workspaceId}/pipeline/items`);
}
export function createPipelineItemCloud(jwt: string | null, workspaceId: string, payload: Partial<CloudPipelineItem> & { id?: string; customer_id: string; stage_id: string; stage_name: string }) {
  return authFetch<{ ok: true; id: string }>(jwt, `/workspaces/${workspaceId}/pipeline/items`, {
    method: "POST", body: JSON.stringify(payload),
  });
}
export function updatePipelineItemCloud(jwt: string | null, workspaceId: string, itemId: string, payload: Partial<CloudPipelineItem>) {
  return authFetch<{ ok: true }>(jwt, `/workspaces/${workspaceId}/pipeline/items/${itemId}`, {
    method: "PATCH", body: JSON.stringify(payload),
  });
}
export function deletePipelineItemCloud(jwt: string | null, workspaceId: string, itemId: string) {
  return authFetch<{ ok: true }>(jwt, `/workspaces/${workspaceId}/pipeline/items/${itemId}`, { method: "DELETE" });
}
export function importPipelineItemsCloud(jwt: string | null, workspaceId: string, items: Array<Partial<CloudPipelineItem> & { id: string; customer_id: string; stage_id: string; stage_name: string }>) {
  return authFetch<{ ok: true; imported: number; skipped: number; errors: Array<{ id: string; error: string }> }>(jwt, `/workspaces/${workspaceId}/pipeline/items/import`, {
    method: "POST", body: JSON.stringify({ items }),
  });
}

/* ── helper genérico para tablas simples (R4+R5) ─────────────────────── */

/**
 * Genera funciones CRUD + import para una tabla "simple" del worker.
 * Hace lo mismo que escribir 5 funciones a mano pero con menos código.
 */
export function cloudTable<T>(segment: string) {
  return {
    list: (jwt: string | null, workspaceId: string) =>
      authFetch<{ items: T[] }>(jwt, `/workspaces/${workspaceId}/${segment}`),
    create: (jwt: string | null, workspaceId: string, payload: Partial<T> & { id?: string }) =>
      authFetch<{ ok: true; id: string }>(jwt, `/workspaces/${workspaceId}/${segment}`, {
        method: "POST", body: JSON.stringify(payload),
      }),
    update: (jwt: string | null, workspaceId: string, id: string, payload: Partial<T>) =>
      authFetch<{ ok: true }>(jwt, `/workspaces/${workspaceId}/${segment}/${id}`, {
        method: "PATCH", body: JSON.stringify(payload),
      }),
    remove: (jwt: string | null, workspaceId: string, id: string) =>
      authFetch<{ ok: true }>(jwt, `/workspaces/${workspaceId}/${segment}/${id}`, { method: "DELETE" }),
    import: (jwt: string | null, workspaceId: string, items: Array<Partial<T> & { id: string }>) =>
      authFetch<{ ok: true; imported: number; skipped: number; errors: Array<{ id: string; error: string }> }>(
        jwt, `/workspaces/${workspaceId}/${segment}/import`,
        { method: "POST", body: JSON.stringify({ items }) },
      ),
  };
}

/* ── tablas R4+R5 (typed shape mínimo; cada Db local conoce el shape full) */

export interface CloudTask {
  id: string; title: string; due_at: string | null; completed: number; type: string;
  [k: string]: unknown;
}
export const tasksApi = cloudTable<CloudTask>("tasks");

export interface CloudCashMovement {
  id: string; kind: string; amount: number; currency: string; description: string | null;
  category: string | null; moved_at: string; [k: string]: unknown;
}
export const cashApi = cloudTable<CloudCashMovement>("cash");

export interface CloudFollowup {
  id: string; customer_id: string; customer_name: string | null;
  reason: string | null; text: string; due_at: string; amount: number | null;
  [k: string]: unknown;
}
export const followupsApi = cloudTable<CloudFollowup>("followups");

export interface CloudCatalogItem {
  id: string; name: string; category: string | null; price: number | null;
  currency: string | null; cost: number | null; sku: string | null;
  [k: string]: unknown;
}
export const catalogApi = cloudTable<CloudCatalogItem>("catalog");

/* ── Workspace assets (I) ────────────────────────────────────────────── */

/**
 * Sube un archivo binario al endpoint del worker. El worker lo guarda en
 * R2 + actualiza cloud_workspaces.logo_key (o banner_key). Devuelve la
 * key persistida.
 *
 * Importante: el body es el ArrayBuffer DIRECTO (no multipart). El
 * worker lee req.arrayBuffer().
 */
export async function uploadWorkspaceAsset(
  jwt: string | null,
  workspaceId: string,
  kind: "logo" | "banner",
  file: Blob,
) {
  if (!jwt) return { ok: false as const, error: "no_jwt" };
  try {
    const res = await fetch(`${AUTH_BASE}/workspaces/${workspaceId}/${kind}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${jwt}`,
        "content-type": file.type || "image/jpeg",
      },
      body: file,
    });
    const data = (await res.json()) as { ok?: boolean; key?: string; error?: string };
    if (!res.ok) return { ok: false as const, error: data.error ?? `http_${res.status}` };
    return { ok: true as const, key: data.key ?? "" };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "network_error" };
  }
}

export async function deleteWorkspaceAsset(
  jwt: string | null,
  workspaceId: string,
  kind: "logo" | "banner",
) {
  return authFetch<{ ok: true }>(jwt, `/workspaces/${workspaceId}/${kind}`, { method: "DELETE" });
}

/** Devuelve la URL pública del asset (proxy del worker con cache 1 año). */
export function workspaceAssetUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  // El worker sirve /assets/{key} con cache-control inmutable.
  return `${AUTH_BASE}/assets/${key}`;
}

/* ── Workspace update (G/A4) ─────────────────────────────────────────── */
export interface UpdateWorkspaceBody {
  name?: string;
  industry?: string;
  daily_goal?: number;
  daily_goal_currency?: string;
  daily_goal_count?: number;
}
export function updateWorkspaceCloud(jwt: string | null, workspaceId: string, body: UpdateWorkspaceBody) {
  return authFetch<{ ok: true }>(jwt, `/workspaces/${workspaceId}`, {
    method: "PATCH", body: JSON.stringify(body),
  });
}

/* ── Assigned task templates (G/A1) ──────────────────────────────────── */
export interface CloudAssignedTaskTemplate {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  frequency: string;
  target_time: string | null;
  target_count: number | null;
  assigned_to_user_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
export const assignedTaskTemplatesApi = {
  list: (jwt: string | null, workspaceId: string) =>
    authFetch<{ items: CloudAssignedTaskTemplate[] }>(jwt, `/workspaces/${workspaceId}/assigned-task-templates`),
  create: (jwt: string | null, workspaceId: string, payload: Partial<CloudAssignedTaskTemplate>) =>
    authFetch<{ ok: true; id: string }>(jwt, `/workspaces/${workspaceId}/assigned-task-templates`, {
      method: "POST", body: JSON.stringify(payload),
    }),
  update: (jwt: string | null, workspaceId: string, id: string, payload: Partial<CloudAssignedTaskTemplate>) =>
    authFetch<{ ok: true }>(jwt, `/workspaces/${workspaceId}/assigned-task-templates/${id}`, {
      method: "PATCH", body: JSON.stringify(payload),
    }),
  remove: (jwt: string | null, workspaceId: string, id: string) =>
    authFetch<{ ok: true }>(jwt, `/workspaces/${workspaceId}/assigned-task-templates/${id}`, {
      method: "DELETE",
    }),
};

/* ── Customer contacts (G/A2) ────────────────────────────────────────── */
export interface CloudCustomerContact {
  id: string;
  workspace_id: string;
  customer_id: string;
  kind: string;
  notes: string | null;
  contacted_by: string | null;
  contacted_by_name: string | null;
  contacted_at: string;
  created_at: string;
}
export const customerContactsApi = {
  list: (jwt: string | null, workspaceId: string, customerId: string) =>
    authFetch<{ items: CloudCustomerContact[] }>(jwt, `/workspaces/${workspaceId}/customers/${customerId}/contacts`),
  create: (jwt: string | null, workspaceId: string, customerId: string, payload: Partial<CloudCustomerContact>) =>
    authFetch<{ ok: true; id: string }>(jwt, `/workspaces/${workspaceId}/customers/${customerId}/contacts`, {
      method: "POST", body: JSON.stringify(payload),
    }),
  lastByCustomer: (jwt: string | null, workspaceId: string) =>
    authFetch<{ lastByCustomer: Record<string, string> }>(jwt, `/workspaces/${workspaceId}/customer-contacts/last-by-customer`),
};

/**
 * Decrement atómico de stock — backend hace `UPDATE ... stock = MAX(0, stock - ?)`
 * en una sola query. Fix de race condition que tenía la versión cliente.
 * Devuelve el nuevo stock después del decremento (clamped a 0).
 */
export async function decrementCatalogStock(
  jwt: string,
  workspaceId: string,
  itemId: string,
  quantity: number,
) {
  return authFetch<{ stock: number; track_stock: number }>(
    jwt,
    `/workspaces/${workspaceId}/catalog/${itemId}/decrement-stock`,
    { method: "POST", body: JSON.stringify({ quantity }) },
  );
}

export interface CloudPaymentMethod {
  id: string; name: string; sort_order: number; enabled: number; currency: string;
}
export const paymentMethodsApi = cloudTable<CloudPaymentMethod>("payment-methods");

export interface CloudCustomerType {
  id: string; name: string; description: string | null; color: string | null; sort_order: number;
}
export const customerTypesApi = cloudTable<CloudCustomerType>("customer-types");

export interface CloudCustomerTag {
  id: string; name: string; color: string | null;
}
export const customerTagsApi = cloudTable<CloudCustomerTag>("customer-tags");

/* ── sales (con items + payments) ────────────────────────────────────── */

export interface CloudSale {
  id: string;
  workspace_id: string;
  customer_id: string | null;
  customer_name: string | null;
  seller_id: string | null;
  seller_name: string | null;
  subtotal: number; total: number; total_paid: number; balance: number;
  is_paid: number;
  payment_method: string | null;
  notes: string | null;
  out_of_stock_sale: number | null;
  regularized_at: string | null;
  regularized_by: string | null;
  sale_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface CloudSaleItem {
  id: string; sale_id: string; catalog_item_id: string | null;
  description: string; quantity: number; unit_price: number;
  base_price: number | null; subtotal: number; imei: string | null;
  from_stock: number;
}

export interface CloudSalePayment {
  id: string; sale_id: string; method: string; currency: string;
  amount: number; is_deposit: number; created_at: string;
}

export function fetchSales(jwt: string | null, workspaceId: string) {
  return authFetch<{ sales: CloudSale[] }>(jwt, `/workspaces/${workspaceId}/sales`);
}
export function fetchSale(jwt: string | null, workspaceId: string, saleId: string) {
  return authFetch<{ sale: CloudSale; items: CloudSaleItem[]; payments: CloudSalePayment[] }>(
    jwt, `/workspaces/${workspaceId}/sales/${saleId}`,
  );
}
export function createSaleCloud(
  jwt: string | null,
  workspaceId: string,
  payload: Partial<CloudSale> & {
    id?: string;
    items?: Partial<CloudSaleItem>[];
    payments?: Partial<CloudSalePayment>[];
    // E1: ambos opcionales — backend los procesa dentro de la misma
    // transacción que la sale. Si vienen vacíos/undefined se comporta
    // igual que antes.
    cash_movements?: Array<{
      id: string;
      kind: "income" | "expense";
      amount: number;
      currency: string;
      description: string;
      category: string;
      sale_id: string;
      customer_name: string | null;
      payment_method: string | null;
      moved_at: string;
    }>;
    stock_decrements?: Array<{ catalog_item_id: string; quantity: number }>;
  },
) {
  return authFetch<{ ok: true; id: string }>(jwt, `/workspaces/${workspaceId}/sales`, {
    method: "POST", body: JSON.stringify(payload),
  });
}
export function updateSaleCloud(jwt: string | null, workspaceId: string, saleId: string, payload: Partial<CloudSale>) {
  return authFetch<{ ok: true }>(jwt, `/workspaces/${workspaceId}/sales/${saleId}`, {
    method: "PATCH", body: JSON.stringify(payload),
  });
}
export function deleteSaleCloud(jwt: string | null, workspaceId: string, saleId: string) {
  return authFetch<{ ok: true }>(jwt, `/workspaces/${workspaceId}/sales/${saleId}`, { method: "DELETE" });
}
export function addSalePaymentCloud(jwt: string | null, workspaceId: string, saleId: string, payload: Partial<CloudSalePayment>) {
  return authFetch<{ ok: true; id: string }>(jwt, `/workspaces/${workspaceId}/sales/${saleId}/payments`, {
    method: "POST", body: JSON.stringify(payload),
  });
}
export function importSalesCloud(
  jwt: string | null,
  workspaceId: string,
  sales: Array<Partial<CloudSale> & { id: string; items?: Partial<CloudSaleItem>[]; payments?: Partial<CloudSalePayment>[] }>,
) {
  return authFetch<{ ok: true; imported: number; skipped: number; errors: Array<{ id: string; error: string }> }>(
    jwt, `/workspaces/${workspaceId}/sales/import`,
    { method: "POST", body: JSON.stringify({ sales }) },
  );
}

/**
 * Genera un código de acceso para un miembro invited. Le permite al
 * owner/admin compartirlo directo con el miembro (por WhatsApp, etc)
 * sin depender del email automático.
 */
export function issueAccessCode(jwt: string | null, workspaceId: string, membershipId: string) {
  return authFetch<{ ok: true; code: string; email: string; expiresInMin: number }>(
    jwt,
    `/workspaces/${workspaceId}/members/${membershipId}/access-code`,
    { method: "POST" },
  );
}

/* ── Deep link URL parsing ───────────────────────────────────────────── */

export interface DeepLinkResult {
  type: "success" | "error";
  /** Para success: el JWT. Para error: vacío. */
  jwt?: string;
  /** Para error: el reason crudo del worker (invalid_token, expired, etc). */
  reason?: string;
}

/**
 * Parsea un URL clozr:// recibido del backend. Acepta los dos formatos
 * que emite el worker:
 *   clozr://auth-complete?jwt=XXX
 *   clozr://auth-error?reason=expired
 */
export function parseAuthDeepLink(url: string): DeepLinkResult | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "clozr:") return null;
    if (u.hostname === "auth-complete") {
      const jwt = u.searchParams.get("jwt");
      if (!jwt) return null;
      return { type: "success", jwt };
    }
    if (u.hostname === "auth-error") {
      const reason = u.searchParams.get("reason") ?? "unknown";
      return { type: "error", reason };
    }
    return null;
  } catch {
    return null;
  }
}
