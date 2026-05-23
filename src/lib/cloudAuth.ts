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
 * Hace un fetch al worker con el JWT del cloudAuthStore en el header.
 * Devuelve { ok, data } o { ok: false, error }. No throwa.
 *
 * El JWT lo lee dinámicamente del store en cada call para que un logout
 * en otra tab/instancia se respete inmediatamente.
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
}

export interface MeWorkspace {
  id: string;
  name: string;
  role: "owner" | "admin" | "vendedor" | "viewer";
  status: "active" | "invited" | "revoked";
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
