/**
 * Billing — suscripciones con Mercado Pago (preapproval) + asientos (T3).
 *
 * Routes:
 *   POST /workspaces/:wid/billing/checkout   (perm billing.manage = owner)
 *       Crea un preapproval (suscripción recurrente mensual en ARS) en MP y
 *       devuelve { init_point } para que el front redirija al pago.
 *   POST /billing/webhook                    (público, sin auth de sesión)
 *       Lo llama Mercado Pago cuando cambia el estado de la suscripción.
 *       Valida la firma, busca el preapproval, y actualiza
 *       plan/seats/plan_status/mp_preapproval_id del workspace. Idempotente.
 *
 * Decisiones de producto (confirmadas):
 *   - Free = 1 asiento. Pro = ARS 25.000/mes, 3 asientos. Team = ARS
 *     60.000/mes, ilimitado (9999). Trial 14 días.
 *   - Cobro recurrente mensual en ARS. external_reference = "wid:plan" para
 *     que el webhook sepa qué workspace y qué plan activar sin estado previo.
 *
 * El webhook es la ÚNICA fuente que escribe el estado de billing; el checkout
 * no muta el workspace (evita marcar "pago" algo que todavía no se cobró).
 *
 * Secrets (wrangler secret put): MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET.
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoFirst } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";
import { requirePerm } from "../permissions";

const MP_API = "https://api.mercadopago.com";

/** plan → monto ARS/mes + asientos. Fuente de verdad del pricing del backend. */
const PLAN_CONFIG: Record<string, { amount: number; seats: number; label: string }> = {
  pro: { amount: 25000, seats: 3, label: "Clozr Pro" },
  team: { amount: 60000, seats: 9999, label: "Clozr Team" },
};

const TRIAL_DAYS = 14;

/* ── POST /workspaces/:wid/billing/checkout ──────────────────────────── */

export async function handleBillingCheckout(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "billing.manage");
  if (denied) return denied;

  if (!env.MP_ACCESS_TOKEN) {
    console.error("[billing] MP_ACCESS_TOKEN no configurado");
    return json({ error: "billing_unavailable" }, 503);
  }

  let body: { plan?: unknown };
  try { body = (await req.json()) as { plan?: unknown }; } catch { return json({ error: "invalid_body" }, 400); }
  const plan = typeof body.plan === "string" ? body.plan : "";
  const cfg = PLAN_CONFIG[plan];
  if (!cfg) return json({ error: "invalid_plan", allowed: Object.keys(PLAN_CONFIG) }, 400);

  // Confirmar que el workspace existe (y de paso traer su nombre no hace falta).
  const ws = await tursoFirst(env, `SELECT id FROM cloud_workspaces WHERE id = ?`, [workspaceId]);
  if (!ws) return json({ error: "not_found" }, 404);

  const preapproval = {
    reason: cfg.label,
    external_reference: `${workspaceId}:${plan}`,
    payer_email: auth.email,
    back_url: "https://clozr.online/app",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: cfg.amount,
      currency_id: "ARS",
      free_trial: { frequency: TRIAL_DAYS, frequency_type: "days" },
    },
    status: "pending",
  };

  let mpRes: Response;
  try {
    mpRes = await fetch(`${MP_API}/preapproval`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(preapproval),
    });
  } catch (e) {
    console.error("[billing] fetch preapproval falló:", e);
    return json({ error: "billing_upstream" }, 502);
  }

  const data = (await mpRes.json().catch(() => null)) as
    | { id?: string; init_point?: string; message?: string }
    | null;
  if (!mpRes.ok || !data?.init_point) {
    console.error("[billing] MP rechazó el preapproval:", mpRes.status, data?.message);
    return json({ error: "billing_upstream", status: mpRes.status }, 502);
  }

  return json({ init_point: data.init_point, preapproval_id: data.id ?? null });
}

/* ── POST /billing/webhook ───────────────────────────────────────────── */

export async function handleBillingWebhook(req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);

  const url = new URL(req.url);

  // El body puede traer { type/topic, data: { id } } o { resource }. MP también
  // manda data.id como query param. Cubrimos ambos.
  let parsed: { type?: string; topic?: string; action?: string; data?: { id?: string }; resource?: string } = {};
  try { parsed = (await req.json()) as typeof parsed; } catch { /* puede venir vacío */ }

  const type = parsed.type ?? parsed.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "";
  // Solo nos interesan eventos de suscripción (preapproval).
  if (type && !/preapproval/i.test(type)) {
    return json({ ok: true, ignored: type });
  }

  const dataId =
    parsed.data?.id ??
    url.searchParams.get("data.id") ??
    (parsed.resource ? parsed.resource.split("/").pop() : undefined) ??
    undefined;
  if (!dataId) return json({ ok: true, ignored: "no_data_id" });

  // Validar firma de MP (x-signature/x-request-id). Si no hay secret, se
  // loguea y se procesa igual (solo aceptable en dev).
  if (!(await verifyMpSignature(req, env, dataId))) {
    return json({ error: "invalid_signature" }, 401);
  }

  if (!env.MP_ACCESS_TOKEN) {
    console.error("[billing] webhook sin MP_ACCESS_TOKEN — no puedo consultar el preapproval");
    return json({ ok: true, skipped: "no_token" });
  }

  // Traer el preapproval real desde MP (no confiamos en el body del webhook
  // para el estado ni el external_reference).
  let mpRes: Response;
  try {
    mpRes = await fetch(`${MP_API}/preapproval/${encodeURIComponent(dataId)}`, {
      headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
    });
  } catch (e) {
    console.error("[billing] fetch preapproval (webhook) falló:", e);
    // 200 igual para que MP no reintente en loop por un fallo transitorio
    // nuestro; el próximo evento (o un retry de MP) lo resuelve.
    return json({ ok: true, retry_later: true });
  }

  const pre = (await mpRes.json().catch(() => null)) as
    | { external_reference?: string; status?: string }
    | null;
  if (!mpRes.ok || !pre) {
    console.error("[billing] MP no devolvió el preapproval:", mpRes.status);
    return json({ ok: true, retry_later: true });
  }

  const ref = pre.external_reference ?? "";
  const sep = ref.lastIndexOf(":");
  const wid = sep > 0 ? ref.slice(0, sep) : ref;
  const plan = sep > 0 ? ref.slice(sep + 1) : "";
  const cfg = PLAN_CONFIG[plan];
  if (!wid || !cfg) {
    console.warn("[billing] external_reference inesperado:", ref);
    return json({ ok: true, ignored: "bad_reference" });
  }

  const planStatus = mapMpStatus(pre.status);

  if (planStatus === "active") {
    // Alta/renovación OK (incluye el período de trial: MP deja el preapproval
    // en 'authorized'). Activamos el plan + asientos. Idempotente.
    await tursoExec(
      env,
      `UPDATE cloud_workspaces
         SET plan = ?, seats = ?, plan_status = 'active', mp_preapproval_id = ?, updated_at = datetime('now')
         WHERE id = ?`,
      [plan, cfg.seats, dataId, wid],
    );
  } else if (planStatus === "cancelled" || planStatus === "past_due") {
    // Baja/pago atrasado: marcamos el estado pero NO bajamos plan/seats acá.
    // La degradación a free tras el período de gracia (definir días con el
    // usuario) queda como tarea aparte (cron). Idempotente.
    await tursoExec(
      env,
      `UPDATE cloud_workspaces
         SET plan_status = ?, mp_preapproval_id = ?, updated_at = datetime('now')
         WHERE id = ?`,
      [planStatus, dataId, wid],
    );
  }
  // 'pending' u otros: no tocamos nada (esperamos el evento de autorización).

  return json({ ok: true, workspace: wid, plan_status: planStatus });
}

/** Mapea el status del preapproval de MP a nuestro plan_status. */
function mapMpStatus(status: string | undefined): "active" | "cancelled" | "past_due" | "pending" {
  switch (status) {
    case "authorized":
      return "active";
    case "paused":
      return "past_due";
    case "cancelled":
      return "cancelled";
    default:
      return "pending";
  }
}

/**
 * Valida la firma del webhook de Mercado Pago.
 *
 * MP manda `x-signature: ts=<ts>,v1=<hmac>` y `x-request-id`. El manifest a
 * firmar es `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con HMAC-SHA256
 * usando el secret del webhook (dashboard MP). Comparación en tiempo
 * constante.
 *
 * Si MP_WEBHOOK_SECRET no está configurado, logueamos y devolvemos true (no
 * bloqueamos) — solo aceptable en dev. En prod, setear el secret.
 */
async function verifyMpSignature(req: Request, env: Env, dataId: string): Promise<boolean> {
  if (!env.MP_WEBHOOK_SECRET) {
    console.warn("[billing] MP_WEBHOOK_SECRET no configurado — webhook sin validar firma");
    return true;
  }

  const sigHeader = req.headers.get("x-signature") ?? "";
  const requestId = req.headers.get("x-request-id") ?? "";
  if (!sigHeader) return false;

  // Parsear "ts=...,v1=..."
  let ts = "";
  let v1 = "";
  for (const part of sigHeader.split(",")) {
    const [k, v] = part.split("=", 2);
    const key = k?.trim();
    if (key === "ts") ts = (v ?? "").trim();
    else if (key === "v1") v1 = (v ?? "").trim();
  }
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = await hmacSha256Hex(env.MP_WEBHOOK_SECRET, manifest);
  return timingSafeEqual(expected, v1);
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparación en tiempo constante de dos strings hex de igual longitud. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
