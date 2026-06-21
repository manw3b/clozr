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
import { ensureSchema, ensureBillingSchema } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoFirst } from "../turso";
import { usdToArs } from "../dolar";
import { CATALOG_PACKS, unlockCatalog } from "../catalog";
import { applyWorkspaceDiscount } from "../discounts";
import { getRoleInWorkspace, json } from "./_generic";
import { requirePerm } from "../permissions";

const MP_API = "https://api.mercadopago.com";

/** plan → precio USD/mes + asientos base. Fuente de verdad del pricing.
 *  Se cobra en ARS al dólar blue del momento (ver dolar.ts). */
export const PLAN_CONFIG: Record<string, { usd: number; baseSeats: number; label: string }> = {
  pro: { usd: 20, baseSeats: 2, label: "Clozr Pro" },
  team: { usd: 45, baseSeats: 5, label: "Clozr Team" },
};

/** Cada empleado extra (más allá de los incluidos en el plan) cuesta esto/mes. */
export const EXTRA_SEAT_USD = 5;

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

  let body: { plan?: unknown; extra_seats?: unknown };
  try { body = (await req.json()) as { plan?: unknown; extra_seats?: unknown }; } catch { return json({ error: "invalid_body" }, 400); }
  const plan = typeof body.plan === "string" ? body.plan : "";
  const cfg = PLAN_CONFIG[plan];
  if (!cfg) return json({ error: "invalid_plan", allowed: Object.keys(PLAN_CONFIG) }, 400);

  // Empleados extra (además de los incluidos en el plan): +EXTRA_SEAT_USD c/u.
  let extraSeats = 0;
  if (body.extra_seats != null) {
    const n = Number(body.extra_seats);
    if (!Number.isInteger(n) || n < 0 || n > 100) return json({ error: "invalid_extra_seats" }, 400);
    extraSeats = n;
  }

  // Confirmar que el workspace existe (y de paso traer su nombre no hace falta).
  const ws = await tursoFirst(env, `SELECT id FROM cloud_workspaces WHERE id = ?`, [workspaceId]);
  if (!ws) return json({ error: "not_found" }, 404);

  // Precio en USD (fuente de verdad), con descuento del workspace si aplica,
  // → ARS al blue del momento.
  const baseUsd = cfg.usd + extraSeats * EXTRA_SEAT_USD;
  const totalUsd = await applyWorkspaceDiscount(env, workspaceId, baseUsd, "plan", plan);
  let amountArs: number;
  try {
    amountArs = await usdToArs(totalUsd);
  } catch (e) {
    console.error("[billing] no pude resolver la cotización del dólar:", e);
    return json({ error: "exchange_unavailable" }, 503);
  }

  const preapproval = {
    reason: extraSeats > 0 ? `${cfg.label} + ${extraSeats} empleado(s)` : cfg.label,
    external_reference: `${workspaceId}:${plan}:${extraSeats}`,
    payer_email: auth.email,
    back_url: "https://clozr.online/app",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: amountArs,
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

/* ── POST /workspaces/:wid/billing/seats ─────────────────────────────────
 * Cambia los empleados extra de una suscripción ACTIVA sin re-checkout:
 * actualiza el monto del preapproval en MP (USD→ARS al blue) y, si MP lo
 * acepta, persiste extra_seats + seats. Si MP rechaza el cambio de monto
 * (p.ej. requiere re-autorización del pagador), devuelve needs_recheckout y
 * el front ofrece re-suscribir. */
export async function handleUpdateSeats(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureBillingSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "billing.manage");
  if (denied) return denied;

  let body: { extra_seats?: unknown };
  try { body = (await req.json()) as { extra_seats?: unknown }; } catch { return json({ error: "invalid_body" }, 400); }
  const extra = Number(body.extra_seats);
  if (!Number.isInteger(extra) || extra < 0 || extra > 100) return json({ error: "invalid_extra_seats" }, 400);

  const ws = await tursoFirst(
    env,
    `SELECT plan, plan_status, mp_preapproval_id FROM cloud_workspaces WHERE id = ?`,
    [workspaceId],
  );
  if (!ws) return json({ error: "not_found" }, 404);
  const plan = String(ws.plan ?? "free");
  const cfg = PLAN_CONFIG[plan];
  if (!cfg) return json({ error: "not_a_paid_plan" }, 409);
  if (ws.plan_status !== "active") return json({ error: "plan_not_active" }, 409);
  const preId = ws.mp_preapproval_id ? String(ws.mp_preapproval_id) : "";
  if (!preId) return json({ error: "no_subscription" }, 409);
  if (!env.MP_ACCESS_TOKEN) return json({ error: "billing_unavailable" }, 503);

  const baseUsd = cfg.usd + extra * EXTRA_SEAT_USD;
  const totalUsd = await applyWorkspaceDiscount(env, workspaceId, baseUsd, "plan", plan);
  let amountArs: number;
  try { amountArs = await usdToArs(totalUsd); } catch { return json({ error: "exchange_unavailable" }, 503); }

  const reason = extra > 0 ? `${cfg.label} + ${extra} empleado(s)` : cfg.label;
  let upd: { ok: boolean; status: number };
  try {
    upd = await updatePreapprovalAmount(env, preId, amountArs, reason);
  } catch (e) {
    console.error("[billing] update preapproval (seats) falló:", e);
    return json({ error: "billing_upstream" }, 502);
  }
  if (!upd.ok) {
    console.warn("[billing] MP rechazó el update de monto (seats):", upd.status);
    return json({ error: "needs_recheckout", status: upd.status }, 409);
  }

  const seats = cfg.baseSeats + extra;
  await tursoExec(
    env,
    `UPDATE cloud_workspaces SET extra_seats = ?, seats = ?, updated_at = datetime('now') WHERE id = ?`,
    [extra, seats, workspaceId],
  );
  return json({ ok: true, seats, extra_seats: extra });
}

/* ── POST /workspaces/:wid/catalog/checkout ──────────────────────────────
 * Pago ÚNICO (no suscripción) para desbloquear un catálogo premium. Crea una
 * preference de Checkout Pro (USD→ARS al blue) y devuelve init_point. El
 * desbloqueo lo confirma el webhook de pago (type 'payment'). */
export async function handleCatalogCheckout(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "billing.manage");
  if (denied) return denied;

  let body: { catalog?: unknown };
  try { body = (await req.json()) as { catalog?: unknown }; } catch { return json({ error: "invalid_body" }, 400); }
  const catalog = typeof body.catalog === "string" ? body.catalog : "";
  const pack = CATALOG_PACKS[catalog];
  if (!pack) return json({ error: "invalid_catalog", allowed: Object.keys(CATALOG_PACKS) }, 400);

  if (!env.MP_ACCESS_TOKEN) return json({ error: "billing_unavailable" }, 503);

  const totalUsd = await applyWorkspaceDiscount(env, workspaceId, pack.usd, "catalog", catalog);
  let amountArs: number;
  try { amountArs = await usdToArs(totalUsd); } catch { return json({ error: "exchange_unavailable" }, 503); }

  const preference = {
    items: [{ title: pack.label, quantity: 1, unit_price: amountArs, currency_id: "ARS" }],
    external_reference: `catalog:${workspaceId}:${catalog}`,
    payer: { email: auth.email },
    back_urls: {
      success: "https://clozr.online/app",
      pending: "https://clozr.online/app",
      failure: "https://clozr.online/app",
    },
    auto_return: "approved",
  };

  let mpRes: Response;
  try {
    mpRes = await fetch(`${MP_API}/checkout/preferences`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(preference),
    });
  } catch (e) {
    console.error("[catalog] fetch preference falló:", e);
    return json({ error: "billing_upstream" }, 502);
  }
  const data = (await mpRes.json().catch(() => null)) as { init_point?: string; id?: string } | null;
  if (!mpRes.ok || !data?.init_point) {
    console.error("[catalog] MP rechazó la preference:", mpRes.status);
    return json({ error: "billing_upstream", status: mpRes.status }, 502);
  }
  return json({ init_point: data.init_point });
}

/* ── POST /billing/webhook ───────────────────────────────────────────── */

export async function handleBillingWebhook(req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureBillingSchema(env);

  const url = new URL(req.url);

  // El body puede traer { type/topic, data: { id } } o { resource }. MP también
  // manda data.id como query param. Cubrimos ambos.
  let parsed: { type?: string; topic?: string; action?: string; data?: { id?: string }; resource?: string } = {};
  try { parsed = (await req.json()) as typeof parsed; } catch { /* puede venir vacío */ }

  const type = parsed.type ?? parsed.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "";

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
    console.error("[billing] webhook sin MP_ACCESS_TOKEN — no puedo consultar MP");
    return json({ ok: true, skipped: "no_token" });
  }

  // Pago ÚNICO (catálogo premium, F4): type 'payment'. Traemos el pago; si está
  // aprobado y su external_reference es "catalog:wid:key", desbloqueamos.
  if (/payment/i.test(type)) {
    let payRes: Response;
    try {
      payRes = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(dataId)}`, {
        headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
      });
    } catch (e) {
      console.error("[catalog] fetch payment (webhook) falló:", e);
      return json({ ok: true, retry_later: true });
    }
    const pay = (await payRes.json().catch(() => null)) as { status?: string; external_reference?: string } | null;
    if (!payRes.ok || !pay) return json({ ok: true, retry_later: true });
    if (pay.status !== "approved") return json({ ok: true, payment_status: pay.status ?? "unknown" });
    const parts = (pay.external_reference ?? "").split(":");
    if (parts[0] !== "catalog" || !parts[1] || !parts[2]) {
      return json({ ok: true, ignored: "bad_reference" });
    }
    await unlockCatalog(env, parts[1], parts[2]);
    return json({ ok: true, unlocked: parts[2], workspace: parts[1] });
  }

  // Suscripciones (preapproval). Otros tipos → ignorar.
  if (!/preapproval/i.test(type)) {
    return json({ ok: true, ignored: type });
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

  // external_reference = "wid:plan[:extraSeats]". El wid es un UUID (sin ':'),
  // así que split directo. Las suscripciones viejas no traen extraSeats → 0.
  const ref = pre.external_reference ?? "";
  const parts = ref.split(":");
  const wid = parts[0] ?? "";
  const plan = parts[1] ?? "";
  const extraSeats = parts[2] != null ? Math.max(0, parseInt(parts[2], 10) || 0) : 0;
  const cfg = PLAN_CONFIG[plan];
  if (!wid || !cfg) {
    console.warn("[billing] external_reference inesperado:", ref);
    return json({ ok: true, ignored: "bad_reference" });
  }

  const planStatus = mapMpStatus(pre.status);

  if (planStatus === "active") {
    // Alta/renovación OK (incluye el período de trial: MP deja el preapproval
    // en 'authorized'). Activamos el plan + asientos y limpiamos el reloj de
    // gracia (plan_status_changed_at = NULL ⇒ sin degradación pendiente).
    //
    // Empleados extra: en el PRIMER link usamos el del external_reference; en
    // re-autorizaciones (mismo preapproval ya guardado) PRESERVAMOS el de la DB
    // —que pudo cambiar por el endpoint de asientos— para no pisarlo.
    const existing = await tursoFirst(
      env,
      `SELECT mp_preapproval_id, extra_seats FROM cloud_workspaces WHERE id = ?`,
      [wid],
    );
    const firstLink = !existing?.mp_preapproval_id || existing.mp_preapproval_id !== dataId;
    const effectiveExtra = firstLink ? extraSeats : Number(existing?.extra_seats ?? 0);
    await tursoExec(
      env,
      `UPDATE cloud_workspaces
         SET plan = ?, seats = ?, extra_seats = ?, plan_status = 'active', mp_preapproval_id = ?,
             plan_status_changed_at = NULL, updated_at = datetime('now')
         WHERE id = ?`,
      [plan, cfg.baseSeats + effectiveExtra, effectiveExtra, dataId, wid],
    );
  } else if (planStatus === "cancelled" || planStatus === "past_due") {
    // Baja/pago atrasado: marcamos el estado + el momento del cambio, pero NO
    // bajamos plan/seats acá. El cron de degradación (cron/planDowngrade.ts)
    // baja a Free pasados los días de gracia, contados desde
    // plan_status_changed_at. Ese timestamp se setea SÓLO en la transición
    // (CASE) para no reiniciar el reloj ante webhooks repetidos. Idempotente.
    await tursoExec(
      env,
      `UPDATE cloud_workspaces
         SET plan_status = ?, mp_preapproval_id = ?,
             plan_status_changed_at = CASE WHEN plan_status != ? THEN datetime('now') ELSE plan_status_changed_at END,
             updated_at = datetime('now')
         WHERE id = ?`,
      [planStatus, dataId, planStatus, wid],
    );
  }
  // 'pending' u otros: no tocamos nada (esperamos el evento de autorización).

  return json({ ok: true, workspace: wid, plan_status: planStatus });
}

/**
 * Actualiza el monto (ARS) de un preapproval activo en MP. Lo usan el endpoint
 * de asientos y el cron de re-pricing. Devuelve ok + status HTTP (no lanza por
 * status != 2xx; sí lanza si la red falla). MP puede rechazar aumentos que
 * requieran re-autorización del pagador — el caller decide qué hacer.
 */
export async function updatePreapprovalAmount(
  env: Env,
  preapprovalId: string,
  amountArs: number,
  reason: string,
): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(`${MP_API}/preapproval/${encodeURIComponent(preapprovalId)}`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      reason,
      auto_recurring: { transaction_amount: amountArs, currency_id: "ARS" },
    }),
  });
  return { ok: res.ok, status: res.status };
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
