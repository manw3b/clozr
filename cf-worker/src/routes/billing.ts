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
import { AI_PACKS, addAiCredits, hasAiAccess } from "../aiWallet";
import { applyWorkspaceDiscount } from "../discounts";
import { getRoleInWorkspace, json } from "./_generic";
import { requirePermWs } from "../permissionsWs";

const MP_API = "https://api.mercadopago.com";

/** plan → precio USD/mes + asientos base. Fuente de verdad del pricing.
 *  Se cobra en ARS al dólar blue del momento (ver dolar.ts). */
export const PLAN_CONFIG: Record<string, { usd: number; baseSeats: number; label: string }> = {
  pro: { usd: 20, baseSeats: 2, label: "Clozr Pro" },
  team: { usd: 45, baseSeats: 5, label: "Clozr Team" },
};

/** Cada empleado extra (más allá de los incluidos en el plan) cuesta esto/mes. */
export const EXTRA_SEAT_USD = 5;

/** Cada espacio/sucursal adicional cubierto por el plan cuesta esto/mes. */
export const ESPACIO_USD = 10;

/** Anual = 10× el mensual → 2 meses gratis. */
export const ANNUAL_MULTIPLIER = 10;

/** Normaliza el intervalo de cobro. */
export function normInterval(v: unknown): "monthly" | "annual" {
  return v === "annual" ? "annual" : "monthly";
}

/** USD a cobrar por período (mensual o anual) para un plan + empleados extra. */
export function periodUsd(planUsd: number, extraSeats: number, interval: "monthly" | "annual"): number {
  const monthly = planUsd + extraSeats * EXTRA_SEAT_USD;
  return interval === "annual" ? monthly * ANNUAL_MULTIPLIER : monthly;
}

/** USD a cobrar por período por los espacios adicionales cubiertos por el plan. */
export function espaciosPeriodUsd(coveredCount: number, interval: "monthly" | "annual"): number {
  const monthly = coveredCount * ESPACIO_USD;
  return interval === "annual" ? monthly * ANNUAL_MULTIPLIER : monthly;
}

/** Cuántos espacios/sucursales cubre (paga) este workspace. */
export async function countCoveredSpaces(env: Env, payerWorkspaceId: string): Promise<number> {
  const row = await tursoFirst(
    env,
    `SELECT COUNT(*) AS n FROM cloud_workspaces WHERE covered_by_workspace_id = ?`,
    [payerWorkspaceId],
  );
  return Number(row?.n ?? 0);
}

/** Texto descriptivo de la suscripción (reason de MP): plan + empleados + espacios. */
export function billingReason(
  cfg: { label: string },
  extraSeats: number,
  coveredSpaces: number,
  interval: "monthly" | "annual",
): string {
  const parts = [cfg.label];
  if (extraSeats > 0) parts.push(`${extraSeats} empleado(s)`);
  if (coveredSpaces > 0) parts.push(`${coveredSpaces} espacio(s)`);
  return `${parts.join(" + ")} (${interval === "annual" ? "anual" : "mensual"})`;
}

const TRIAL_DAYS = 14;

/* ── POST /workspaces/:wid/billing/checkout ──────────────────────────── */

export async function handleBillingCheckout(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureBillingSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = await requirePermWs(env, workspaceId, role, "billing.manage");
  if (denied) return denied;

  if (!env.MP_ACCESS_TOKEN) {
    console.error("[billing] MP_ACCESS_TOKEN no configurado");
    return json({ error: "billing_unavailable" }, 503);
  }

  let body: { plan?: unknown; extra_seats?: unknown; interval?: unknown };
  try { body = (await req.json()) as { plan?: unknown; extra_seats?: unknown; interval?: unknown }; } catch { return json({ error: "invalid_body" }, 400); }
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
  const interval = normInterval(body.interval);

  // Confirmar que el workspace existe (y de paso traer su nombre no hace falta).
  const ws = await tursoFirst(env, `SELECT id FROM cloud_workspaces WHERE id = ?`, [workspaceId]);
  if (!ws) return json({ error: "not_found" }, 404);

  // Precio en USD (fuente de verdad), por período (mensual/anual), con descuento
  // del workspace si aplica, → ARS al blue del momento. Incluye los espacios
  // adicionales que este workspace ya cubra (normalmente 0 en un alta nueva).
  const covered = await countCoveredSpaces(env, workspaceId);
  const baseUsd = periodUsd(cfg.usd, extraSeats, interval) + espaciosPeriodUsd(covered, interval);
  const totalUsd = await applyWorkspaceDiscount(env, workspaceId, baseUsd, "plan", plan);
  let amountArs: number;
  try {
    amountArs = await usdToArs(totalUsd);
  } catch (e) {
    console.error("[billing] no pude resolver la cotización del dólar:", e);
    return json({ error: "exchange_unavailable" }, 503);
  }

  const preapproval = {
    reason: billingReason(cfg, extraSeats, covered, interval),
    external_reference: `${workspaceId}:${plan}:${extraSeats}:${interval}`,
    payer_email: auth.email,
    back_url: "https://clozr.online/app",
    auto_recurring: {
      frequency: interval === "annual" ? 12 : 1,
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
  const denied = await requirePermWs(env, workspaceId, role, "billing.manage");
  if (denied) return denied;

  let body: { extra_seats?: unknown };
  try { body = (await req.json()) as { extra_seats?: unknown }; } catch { return json({ error: "invalid_body" }, 400); }
  const extra = Number(body.extra_seats);
  if (!Number.isInteger(extra) || extra < 0 || extra > 100) return json({ error: "invalid_extra_seats" }, 400);

  const ws = await tursoFirst(
    env,
    `SELECT plan, plan_status, mp_preapproval_id, billing_interval FROM cloud_workspaces WHERE id = ?`,
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

  const interval = normInterval(ws.billing_interval);
  // El monto sigue cubriendo los espacios adicionales que ya tenga el plan.
  const covered = await countCoveredSpaces(env, workspaceId);
  const baseUsd = periodUsd(cfg.usd, extra, interval) + espaciosPeriodUsd(covered, interval);
  const totalUsd = await applyWorkspaceDiscount(env, workspaceId, baseUsd, "plan", plan);
  let amountArs: number;
  try { amountArs = await usdToArs(totalUsd); } catch { return json({ error: "exchange_unavailable" }, 503); }

  const reason = billingReason(cfg, extra, covered, interval);
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

/* ── POST /workspaces/:wid/cover ──────────────────────────────────────────
 * Suma un espacio/sucursal adicional (del MISMO dueño) al plan de :wid, que es
 * el "principal" que paga. El espacio cubierto copia el plan del principal y NO
 * paga aparte: el monto de la suscripción del principal sube ESPACIO_USD/mes.
 * Mismo patrón que /billing/seats: actualiza el monto del preapproval en MP y,
 * si MP lo acepta, persiste la cobertura. Si MP rechaza el cambio de monto,
 * devuelve needs_recheckout (el front ofrece re-suscribir). Body: { target_workspace_id }. */
export async function handleCoverSpace(payerWorkspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureBillingSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, payerWorkspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = await requirePermWs(env, payerWorkspaceId, role, "billing.manage");
  if (denied) return denied;

  let body: { target_workspace_id?: unknown };
  try { body = (await req.json()) as { target_workspace_id?: unknown }; } catch { return json({ error: "invalid_body" }, 400); }
  const targetId = typeof body.target_workspace_id === "string" ? body.target_workspace_id : "";
  if (!targetId) return json({ error: "missing_target" }, 400);
  if (targetId === payerWorkspaceId) return json({ error: "cannot_cover_self" }, 400);

  // El principal: plan pago, activo, con suscripción MP propia, y NO cubierto él
  // mismo (un espacio cubierto no puede cubrir a otros).
  const payer = await tursoFirst(
    env,
    `SELECT plan, plan_status, mp_preapproval_id, billing_interval, extra_seats, owner_user_id, covered_by_workspace_id
       FROM cloud_workspaces WHERE id = ?`,
    [payerWorkspaceId],
  );
  if (!payer) return json({ error: "not_found" }, 404);
  if (String(payer.owner_user_id ?? "") !== auth.userId) return json({ error: "forbidden" }, 403);
  const plan = String(payer.plan ?? "free");
  const cfg = PLAN_CONFIG[plan];
  if (!cfg) return json({ error: "not_a_paid_plan" }, 409);
  if (payer.plan_status !== "active") return json({ error: "plan_not_active" }, 409);
  if (payer.covered_by_workspace_id) return json({ error: "payer_is_covered" }, 409);
  const preId = payer.mp_preapproval_id ? String(payer.mp_preapproval_id) : "";
  if (!preId) return json({ error: "no_subscription" }, 409);
  if (!env.MP_ACCESS_TOKEN) return json({ error: "billing_unavailable" }, 503);

  // El espacio a cubrir: del MISMO dueño, Free, y no cubierto ya por nadie.
  const target = await tursoFirst(
    env,
    `SELECT plan, owner_user_id, covered_by_workspace_id FROM cloud_workspaces WHERE id = ?`,
    [targetId],
  );
  if (!target) return json({ error: "target_not_found" }, 404);
  if (String(target.owner_user_id ?? "") !== auth.userId) return json({ error: "target_not_owned" }, 403);
  if (target.covered_by_workspace_id) return json({ error: "target_already_covered" }, 409);
  if (PLAN_CONFIG[String(target.plan ?? "free")]) return json({ error: "target_is_paid" }, 409);

  const interval = normInterval(payer.billing_interval);
  const extra = Number(payer.extra_seats ?? 0);
  const newCovered = (await countCoveredSpaces(env, payerWorkspaceId)) + 1;
  const baseUsd = periodUsd(cfg.usd, extra, interval) + espaciosPeriodUsd(newCovered, interval);
  const totalUsd = await applyWorkspaceDiscount(env, payerWorkspaceId, baseUsd, "plan", plan);
  let amountArs: number;
  try { amountArs = await usdToArs(totalUsd); } catch { return json({ error: "exchange_unavailable" }, 503); }

  let upd: { ok: boolean; status: number };
  try {
    upd = await updatePreapprovalAmount(env, preId, amountArs, billingReason(cfg, extra, newCovered, interval));
  } catch (e) {
    console.error("[billing] update preapproval (cover) falló:", e);
    return json({ error: "billing_upstream" }, 502);
  }
  if (!upd.ok) {
    console.warn("[billing] MP rechazó el update de monto (cover):", upd.status);
    return json({ error: "needs_recheckout", status: upd.status }, 409);
  }

  // Cubrir: el espacio copia el plan del principal (asientos base, sin extras ni
  // suscripción propia) y queda apuntando al pagador. Limpia cualquier
  // licencia/gracia previa.
  await tursoExec(
    env,
    `UPDATE cloud_workspaces
        SET plan = ?, seats = ?, extra_seats = 0, plan_status = 'active',
            billing_interval = ?, covered_by_workspace_id = ?,
            mp_preapproval_id = NULL, license_expires_at = NULL,
            plan_status_changed_at = NULL, updated_at = datetime('now')
      WHERE id = ?`,
    [plan, cfg.baseSeats, interval, payerWorkspaceId, targetId],
  );
  return json({ ok: true, covered: newCovered, plan });
}

/* ── POST /workspaces/:wid/uncover ────────────────────────────────────────
 * Quita un espacio cubierto del plan del principal :wid. El espacio vuelve a
 * Free y el monto del principal baja ESPACIO_USD/mes. La baja del monto en MP es
 * best-effort: aunque MP la rechace, liberamos el espacio igual (bajar el monto
 * nunca requiere re-autorización, y el re-pricing diario corrige cualquier
 * desfasaje). Body: { target_workspace_id }. */
export async function handleUncoverSpace(payerWorkspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureBillingSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, payerWorkspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = await requirePermWs(env, payerWorkspaceId, role, "billing.manage");
  if (denied) return denied;

  let body: { target_workspace_id?: unknown };
  try { body = (await req.json()) as { target_workspace_id?: unknown }; } catch { return json({ error: "invalid_body" }, 400); }
  const targetId = typeof body.target_workspace_id === "string" ? body.target_workspace_id : "";
  if (!targetId) return json({ error: "missing_target" }, 400);

  const target = await tursoFirst(
    env,
    `SELECT covered_by_workspace_id FROM cloud_workspaces WHERE id = ?`,
    [targetId],
  );
  if (!target) return json({ error: "target_not_found" }, 404);
  if (String(target.covered_by_workspace_id ?? "") !== payerWorkspaceId) {
    return json({ error: "not_covered_by_this_workspace" }, 409);
  }

  // Liberar el espacio → Free. Lo hacemos SIEMPRE (aunque el ajuste de monto en
  // MP falle): deja de estar cubierto y el monto del principal lo corrige el
  // re-pricing si hiciera falta.
  await tursoExec(
    env,
    `UPDATE cloud_workspaces
        SET plan = 'free', seats = 1, extra_seats = 0, plan_status = 'active',
            covered_by_workspace_id = NULL, mp_preapproval_id = NULL,
            updated_at = datetime('now')
      WHERE id = ?`,
    [targetId],
  );

  // Bajar el monto del principal (best-effort).
  const payer = await tursoFirst(
    env,
    `SELECT plan, plan_status, mp_preapproval_id, billing_interval, extra_seats FROM cloud_workspaces WHERE id = ?`,
    [payerWorkspaceId],
  );
  const plan = String(payer?.plan ?? "free");
  const cfg = PLAN_CONFIG[plan];
  const preId = payer?.mp_preapproval_id ? String(payer.mp_preapproval_id) : "";
  if (cfg && preId && payer?.plan_status === "active" && env.MP_ACCESS_TOKEN) {
    const interval = normInterval(payer.billing_interval);
    const extra = Number(payer.extra_seats ?? 0);
    const covered = await countCoveredSpaces(env, payerWorkspaceId);
    const baseUsd = periodUsd(cfg.usd, extra, interval) + espaciosPeriodUsd(covered, interval);
    try {
      const totalUsd = await applyWorkspaceDiscount(env, payerWorkspaceId, baseUsd, "plan", plan);
      const amountArs = await usdToArs(totalUsd);
      await updatePreapprovalAmount(env, preId, amountArs, billingReason(cfg, extra, covered, interval));
    } catch (e) {
      console.warn("[billing] no pude bajar el monto al descubrir un espacio (no-fatal):", e);
    }
  }
  return json({ ok: true });
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
  const denied = await requirePermWs(env, workspaceId, role, "billing.manage");
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

/* ── POST /workspaces/:wid/ai/checkout ───────────────────────────────────
 * Pago único de un pack de mensajes de IA. Mismo flujo que el catálogo: arma
 * la preference (USD→ARS al blue), y los créditos los acredita el webhook. */
export async function handleAiCheckout(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = await requirePermWs(env, workspaceId, role, "billing.manage");
  if (denied) return denied;
  if (!(await hasAiAccess(env, workspaceId))) return json({ error: "ai_requires_plan" }, 403);

  let body: { pack?: unknown };
  try { body = (await req.json()) as { pack?: unknown }; } catch { return json({ error: "invalid_body" }, 400); }
  const packKey = typeof body.pack === "string" ? body.pack : "";
  const pack = AI_PACKS[packKey];
  if (!pack) return json({ error: "invalid_pack", allowed: Object.keys(AI_PACKS) }, 400);

  if (!env.MP_ACCESS_TOKEN) return json({ error: "billing_unavailable" }, 503);

  let amountArs: number;
  try { amountArs = await usdToArs(pack.usd); } catch { return json({ error: "exchange_unavailable" }, 503); }

  const preference = {
    items: [{ title: pack.label, quantity: 1, unit_price: amountArs, currency_id: "ARS" }],
    external_reference: `ai:${workspaceId}:${packKey}`,
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
    console.error("[ai] fetch preference falló:", e);
    return json({ error: "billing_upstream" }, 502);
  }
  const data = (await mpRes.json().catch(() => null)) as { init_point?: string } | null;
  if (!mpRes.ok || !data?.init_point) {
    console.error("[ai] MP rechazó la preference:", mpRes.status);
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
    if (parts[0] === "catalog" && parts[1] && parts[2]) {
      await unlockCatalog(env, parts[1], parts[2]);
      return json({ ok: true, unlocked: parts[2], workspace: parts[1] });
    }
    if (parts[0] === "ai" && parts[1] && parts[2]) {
      await addAiCredits(env, parts[1], parts[2]);
      return json({ ok: true, ai_pack: parts[2], workspace: parts[1] });
    }
    return json({ ok: true, ignored: "bad_reference" });
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

  // external_reference = "wid:plan[:extraSeats[:interval]]". El wid es un UUID
  // (sin ':'), split directo. Las suscripciones viejas traen menos partes →
  // defaults (extraSeats 0, interval monthly).
  const ref = pre.external_reference ?? "";
  const parts = ref.split(":");
  const wid = parts[0] ?? "";
  const plan = parts[1] ?? "";
  const extraSeats = parts[2] != null ? Math.max(0, parseInt(parts[2], 10) || 0) : 0;
  const interval = normInterval(parts[3]);
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
         SET plan = ?, seats = ?, extra_seats = ?, billing_interval = ?, plan_status = 'active',
             mp_preapproval_id = ?, plan_status_changed_at = NULL, dunning_stage = 0,
             updated_at = datetime('now')
         WHERE id = ?`,
      [plan, cfg.baseSeats + effectiveExtra, effectiveExtra, interval, dataId, wid],
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
