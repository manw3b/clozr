/**
 * Plan downgrade — degradación a Free tras el período de gracia (billing T3).
 *
 * El webhook de Mercado Pago (routes/billing.ts) sólo MARCA el estado cuando
 * una suscripción se cancela o entra en mora (plan_status = 'cancelled' |
 * 'past_due') y registra el momento en `plan_status_changed_at`. Este cron
 * cierra el loop: pasados GRACE_DAYS desde ese cambio, baja el workspace a
 * Free (1 asiento) — así el cliente tiene una semana para resubscribirse o
 * regularizar antes de perder los asientos de equipo.
 *
 * Corre en el mismo trigger diario que el AI Triage (ver wrangler.toml
 * [triggers] + el handler `scheduled` en index.ts). Idempotente: el filtro
 * `plan != 'free'` y el WHERE de la UPDATE evitan re-degradar o pisar una
 * reactivación que haya entrado entre el SELECT y la UPDATE.
 *
 * Multi-tenant: es un barrido de mantenimiento sobre cloud_workspaces (la
 * tabla de inquilinos) — no hay datos de un workspace cruzándose con otro;
 * cada UPDATE apunta a un id puntual.
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { tursoQuery, tursoExec } from "../turso";

/** Días de gracia tras cancelado/past_due antes de bajar a Free. */
const GRACE_DAYS = 7;

export interface DowngradeResult {
  /** Workspaces elegibles encontrados (gracia vencida). */
  eligible: number;
  /** Workspaces efectivamente bajados a Free. */
  downgraded: number;
  /** Workspaces bajados a Free por vencimiento de licencia gratuita (Consola). */
  licensesExpired: number;
}

/** Punto de entrada — lo llaman el handler `scheduled` y el trigger manual. */
export async function runPlanDowngrade(env: Env): Promise<DowngradeResult> {
  await ensureSchema(env);

  // Workspaces pagos cuya suscripción está cancelada/en mora y cuyo período de
  // gracia ya venció. plan_status_changed_at NULL ⇒ sin reloj corriendo (no se
  // toca: legacy o ya reactivado).
  const [rows] = await tursoQuery(env, {
    sql: `SELECT id FROM cloud_workspaces
            WHERE plan != 'free'
              AND plan_status IN ('cancelled', 'past_due')
              AND plan_status_changed_at IS NOT NULL
              AND plan_status_changed_at <= datetime('now', ?)`,
    args: [`-${GRACE_DAYS} days`],
  });

  let downgraded = 0;
  for (const w of rows ?? []) {
    const wid = String(w.id);
    try {
      // Re-chequeamos el estado en el WHERE: si un webhook reactivó el plan
      // entre el SELECT y este UPDATE, no lo bajamos. Limpia el reloj de gracia
      // y suelta el preapproval (la suscripción ya no existe).
      await tursoExec(
        env,
        `UPDATE cloud_workspaces
            SET plan = 'free', seats = 1, plan_status = 'active',
                mp_preapproval_id = NULL, plan_status_changed_at = NULL,
                updated_at = datetime('now')
          WHERE id = ?
            AND plan != 'free'
            AND plan_status IN ('cancelled', 'past_due')`,
        [wid],
      );
      downgraded++;
    } catch (err) {
      // Un workspace que falla no debe tumbar al resto del barrido.
      console.error(`[plan-downgrade] workspace ${wid} falló:`, err);
    }
  }

  // ── Vencimiento de licencias gratuitas (Consola Clozr) ─────────────────
  // Un código de licencia activa un plan pago gratis hasta license_expires_at.
  // Al vencer, lo bajamos a Free. NO tocamos suscripciones MP reales
  // (mp_preapproval_id != NULL). Todo el bloque es NO-FATAL: si la columna no
  // existe (migración 014 salteada) o falla la query, logueamos y seguimos —
  // la degradación por billing MP de arriba ya corrió.
  let licensesExpired = 0;
  try {
    // datetime(license_expires_at): normaliza el formato (puede venir en ISO con
    // T/Z desde toISOString() o como fecha del admin) para comparar contra
    // datetime('now'). Si el valor es inválido, datetime() da NULL y la fila
    // queda excluida (no se degrada por error).
    const [licRows] = await tursoQuery(env, {
      sql: `SELECT id FROM cloud_workspaces
              WHERE plan != 'free'
                AND mp_preapproval_id IS NULL
                AND license_expires_at IS NOT NULL
                AND datetime(license_expires_at) <= datetime('now')`,
    });
    for (const w of licRows ?? []) {
      const wid = String(w.id);
      try {
        await tursoExec(
          env,
          `UPDATE cloud_workspaces
              SET plan = 'free', seats = 1, plan_status = 'active',
                  license_expires_at = NULL, updated_at = datetime('now')
            WHERE id = ?
              AND plan != 'free'
              AND mp_preapproval_id IS NULL
              AND license_expires_at IS NOT NULL
              AND datetime(license_expires_at) <= datetime('now')`,
          [wid],
        );
        licensesExpired++;
      } catch (err) {
        console.error(`[plan-downgrade] licencia ${wid} falló:`, err);
      }
    }
  } catch (err) {
    console.error("[plan-downgrade] barrido de licencias falló (no-fatal):", err);
  }

  const eligible = (rows ?? []).length;
  console.log(`[plan-downgrade] listo: ${eligible} elegibles, ${downgraded} degradados a Free, ${licensesExpired} licencias vencidas`);
  return { eligible, downgraded, licensesExpired };
}
