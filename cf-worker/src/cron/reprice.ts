/**
 * Re-pricing — mantiene las suscripciones pegadas al dólar (billing F2).
 *
 * Los planes son en USD pero MP cobra en ARS con monto fijo. Cuando el blue se
 * mueve, el monto ARS de cada suscripción queda viejo. Este cron, para cada
 * workspace pago activo, recalcula el monto objetivo (planUSD + extra*USD5) ×
 * blue y, si difiere del monto actual del preapproval más que DRIFT_THRESHOLD,
 * lo actualiza en MP. Así el cobro sigue al dólar sin intervención manual.
 *
 * Corre en el mismo trigger diario que los otros jobs (ver index.ts scheduled).
 * Idempotente y NO-fatal por workspace: un fallo de uno no frena el barrido.
 *
 * Caveat MP: actualizar el monto de un preapproval puede ser rechazado si el
 * aumento requiere re-autorización del pagador. En ese caso lo contamos como
 * `failed` y la suscripción sigue al monto viejo hasta una acción manual /
 * re-checkout — no rompemos nada.
 */

import type { Env } from "../index";
import { ensureSchema, ensureBillingSchema } from "../schema";
import { tursoQuery } from "../turso";
import { getBlueRate } from "../dolar";
import { applyWorkspaceDiscount } from "../discounts";
import { PLAN_CONFIG, EXTRA_SEAT_USD, updatePreapprovalAmount } from "../routes/billing";

/** Umbral de desvío para re-precificar (5%). Evita updates por cambios chicos. */
const DRIFT_THRESHOLD = 0.05;
const MP_API = "https://api.mercadopago.com";

export interface RepriceResult {
  checked: number;
  updated: number;
  failed: number;
  skipped: number;
}

export async function runRepricing(env: Env): Promise<RepriceResult> {
  await ensureSchema(env);
  await ensureBillingSchema(env);

  const result: RepriceResult = { checked: 0, updated: 0, failed: 0, skipped: 0 };
  if (!env.MP_ACCESS_TOKEN) {
    console.warn("[reprice] sin MP_ACCESS_TOKEN — skip");
    return result;
  }

  let rate: number;
  try {
    rate = await getBlueRate();
  } catch (e) {
    console.error("[reprice] no pude resolver el dólar:", e);
    return result;
  }

  const [rows] = await tursoQuery(env, {
    sql: `SELECT id, plan, seats, extra_seats, mp_preapproval_id
            FROM cloud_workspaces
           WHERE plan != 'free' AND plan_status = 'active' AND mp_preapproval_id IS NOT NULL`,
  });

  for (const w of rows ?? []) {
    result.checked++;
    const plan = String(w.plan ?? "");
    const cfg = PLAN_CONFIG[plan];
    const preId = w.mp_preapproval_id ? String(w.mp_preapproval_id) : "";
    if (!cfg || !preId) {
      result.skipped++;
      continue;
    }
    // extra_seats es la autoridad; si fuese NULL (legacy), lo derivamos de seats.
    const extra = w.extra_seats != null
      ? Number(w.extra_seats)
      : Math.max(0, Number(w.seats ?? cfg.baseSeats) - cfg.baseSeats);
    const baseUsd = cfg.usd + extra * EXTRA_SEAT_USD;
    // Re-aplicamos el descuento del workspace (si lo tiene) para no "perderlo"
    // al re-precificar.
    const effUsd = await applyWorkspaceDiscount(env, String(w.id), baseUsd, "plan", plan);
    const targetArs = Math.round(effUsd * rate);

    try {
      // Monto actual del preapproval (para medir el desvío).
      const res = await fetch(`${MP_API}/preapproval/${encodeURIComponent(preId)}`, {
        headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
      });
      if (!res.ok) {
        result.failed++;
        continue;
      }
      const pre = (await res.json().catch(() => null)) as
        | { auto_recurring?: { transaction_amount?: number } }
        | null;
      const currentArs = Number(pre?.auto_recurring?.transaction_amount ?? 0);
      if (!currentArs) {
        result.skipped++;
        continue;
      }
      const drift = Math.abs(targetArs - currentArs) / currentArs;
      if (drift < DRIFT_THRESHOLD) {
        result.skipped++;
        continue;
      }
      const reason = extra > 0 ? `${cfg.label} + ${extra} empleado(s)` : cfg.label;
      const upd = await updatePreapprovalAmount(env, preId, targetArs, reason);
      if (upd.ok) result.updated++;
      else result.failed++;
    } catch (e) {
      console.error(`[reprice] workspace ${String(w.id)} falló:`, e);
      result.failed++;
    }
  }

  console.log(`[reprice] listo:`, result);
  return result;
}
