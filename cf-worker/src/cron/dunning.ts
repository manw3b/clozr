/**
 * Dunning + win-back — ciclo de cobranza por mail (crecimiento).
 *
 * Cuando una suscripción de Mercado Pago falla o se cancela, el webhook
 * (routes/billing.ts) marca el workspace como 'past_due'/'cancelled' y registra
 * `plan_status_changed_at`. El cron de degradación (cron/planDowngrade.ts) lo
 * baja a Free pasados GRACE_DAYS y lo deja con `dunning_stage = 3` (degradado,
 * win-back pendiente).
 *
 * Este cron cierra el loop por mail, idempotente vía `dunning_stage`:
 *   stage 0 → aviso inicial ("tu pago falló")            → stage 1
 *   stage 1 + gracia por vencer → último aviso           → stage 2
 *   plan Free + stage 3 → win-back con código de descuento → stage 4
 *
 * El webhook resetea `dunning_stage = 0` al reactivarse, así un futuro fallo
 * arranca el ciclo de cero. NO-fatal por workspace: un fallo no frena el barrido.
 * Si falta RESEND_API_KEY, hace skip (no rompe).
 */

import type { Env } from "../index";
import { ensureSchema, ensureBillingSchema, ensureConsoleSchema } from "../schema";
import { tursoQuery, tursoExec } from "../turso";
import { sendDunningEmail, sendWinbackEmail } from "../email";
import { generateCode } from "../codes";
import { PLAN_CONFIG } from "../routes/billing";

/** Debe coincidir con GRACE_DAYS de cron/planDowngrade.ts. */
const GRACE_DAYS = 7;
/** Días antes del downgrade para el "último aviso". */
const FINAL_NOTICE_BEFORE = 2;
/** Descuento del código de recuperación (win-back). */
const WINBACK_PCT = 25;
/** Validez del código de recuperación. */
const WINBACK_TTL_DAYS = 30;

export interface DunningResult {
  checked: number;
  firstSent: number;
  finalSent: number;
  winbackSent: number;
  skipped: number;
  failed: number;
}

export async function runDunning(env: Env): Promise<DunningResult> {
  await ensureSchema(env);
  await ensureBillingSchema(env);
  await ensureConsoleSchema(env);

  const result: DunningResult = { checked: 0, firstSent: 0, finalSent: 0, winbackSent: 0, skipped: 0, failed: 0 };
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    console.warn("[dunning] sin RESEND_API_KEY/RESEND_FROM — skip");
    return result;
  }

  // ── 1. Recordatorios durante la gracia (suscripción MP fallada/cancelada) ──
  const [graceRows] = await tursoQuery(env, {
    sql: `SELECT w.id, w.name, w.plan, w.dunning_stage,
                 (julianday('now') - julianday(w.plan_status_changed_at)) AS days_elapsed,
                 u.email AS owner_email
            FROM cloud_workspaces w
            LEFT JOIN users u ON u.id = w.owner_user_id
           WHERE w.plan != 'free'
             AND w.plan_status IN ('cancelled', 'past_due')
             AND w.plan_status_changed_at IS NOT NULL
             AND w.mp_preapproval_id IS NOT NULL`,
  });

  for (const w of graceRows ?? []) {
    result.checked++;
    const wid = String(w.id);
    const email = w.owner_email ? String(w.owner_email) : "";
    const stage = Number(w.dunning_stage ?? 0);
    const elapsed = Number(w.days_elapsed ?? 0);
    const daysLeft = Math.max(0, GRACE_DAYS - elapsed);
    const planLabel = PLAN_CONFIG[String(w.plan ?? "")]?.label ?? "Clozr";
    if (!email) { result.skipped++; continue; }

    try {
      if (stage <= 0) {
        await sendDunningEmail({
          to: email, workspaceName: String(w.name ?? "tu espacio"), planLabel,
          stage: "first", daysLeft, apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM,
        });
        await tursoExec(env, `UPDATE cloud_workspaces SET dunning_stage = 1 WHERE id = ?`, [wid]);
        result.firstSent++;
      } else if (stage === 1 && elapsed >= GRACE_DAYS - FINAL_NOTICE_BEFORE) {
        await sendDunningEmail({
          to: email, workspaceName: String(w.name ?? "tu espacio"), planLabel,
          stage: "final", daysLeft, apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM,
        });
        await tursoExec(env, `UPDATE cloud_workspaces SET dunning_stage = 2 WHERE id = ?`, [wid]);
        result.finalSent++;
      } else {
        result.skipped++;
      }
    } catch (e) {
      console.error(`[dunning] workspace ${wid} (grace) falló:`, e);
      result.failed++;
    }
  }

  // ── 2. Win-back: ya bajados a Free, con código de recuperación ─────────────
  const [winbackRows] = await tursoQuery(env, {
    sql: `SELECT w.id, w.name, u.email AS owner_email
            FROM cloud_workspaces w
            LEFT JOIN users u ON u.id = w.owner_user_id
           WHERE w.plan = 'free' AND w.dunning_stage = 3`,
  });

  for (const w of winbackRows ?? []) {
    result.checked++;
    const wid = String(w.id);
    const email = w.owner_email ? String(w.owner_email) : "";
    if (!email) {
      // Sin email no podemos recuperar; marcamos como enviado para no reintentar.
      await tursoExec(env, `UPDATE cloud_workspaces SET dunning_stage = 4 WHERE id = ?`, [wid]).catch(() => {});
      result.skipped++;
      continue;
    }
    try {
      const code = generateCode();
      // Código de descuento de recuperación: % sobre cualquier plan, un solo uso,
      // con vencimiento. Reusa la infra de la Consola (console_codes).
      await tursoExec(
        env,
        `INSERT INTO console_codes
           (id, code, kind, discount_type, discount_value, target, max_uses, uses, expires_at, note, created_by, created_at)
         VALUES (?, ?, 'discount', 'percent', ?, 'plan:any', 1, 0, datetime('now', ?), ?, 'system:winback', datetime('now'))`,
        [crypto.randomUUID(), code, WINBACK_PCT, `+${WINBACK_TTL_DAYS} days`, `win-back ${wid}`],
      );
      await sendWinbackEmail({
        to: email, workspaceName: String(w.name ?? "tu espacio"),
        code, pct: WINBACK_PCT, validDays: WINBACK_TTL_DAYS,
        apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM,
      });
      await tursoExec(env, `UPDATE cloud_workspaces SET dunning_stage = 4 WHERE id = ?`, [wid]);
      result.winbackSent++;
    } catch (e) {
      console.error(`[dunning] workspace ${wid} (win-back) falló:`, e);
      result.failed++;
    }
  }

  console.log(`[dunning] listo:`, result);
  return result;
}
