/**
 * IA de Clozr — billetera de mensajes (microtransacciones).
 *
 * Cada workspace tiene AI_FREE_LIMIT mensajes gratis (para probar) y, a partir
 * de ahí, consume `ai_credits` comprados en packs (1 crédito = 1 mensaje). El
 * entitlement vive en cloud_workspaces (ai_credits, ai_msgs_used), igual que
 * unlocked_catalogs. Módulo neutral (lo importan billing y la ruta de chat sin
 * ciclo).
 */

import type { Env } from "./index";
import { ensureWorkspaceColumns } from "./schema";
import { tursoFirst, tursoExec } from "./turso";

/** Acciones de IA gratis por workspace (trial) antes de tener que pagar. */
export const AI_FREE_LIMIT = 3;

/** Costo en créditos por tipo de acción (1 crédito ≈ 1 acción simple). */
export const AI_ACTION_COSTS: Record<string, number> = {
  chat: 1,
  generate: 1,
  rewrite: 1,
  email: 2,
  summary: 2,
  insights: 3,
  report: 5,
  prediction: 10,
};

/**
 * Packs de mensajes (pago único). Precio en USD (se cobra en ARS al blue en el
 * checkout). Pensado para "superar x3" el costo real por mensaje del modelo.
 */
export const AI_PACKS: Record<string, { credits: number; usd: number; label: string }> = {
  starter: { credits: 25, usd: 2.99, label: "IA Starter — 25 mensajes" },
  plus: { credits: 100, usd: 10.99, label: "IA Plus — 100 mensajes" },
  pro: { credits: 300, usd: 29.99, label: "IA Pro — 300 mensajes" },
  power: { credits: 1000, usd: 94.99, label: "IA Power — 1000 mensajes" },
};

export interface AiWallet {
  credits: number;
  freeUsed: number;
  freeLimit: number;
}

export async function getWallet(env: Env, workspaceId: string): Promise<AiWallet> {
  await ensureWorkspaceColumns(env);
  const row = await tursoFirst(
    env,
    `SELECT ai_credits, ai_msgs_used FROM cloud_workspaces WHERE id = ?`,
    [workspaceId],
  );
  return {
    credits: Math.max(0, Number(row?.ai_credits ?? 0) || 0),
    freeUsed: Math.max(0, Number(row?.ai_msgs_used ?? 0) || 0),
    freeLimit: AI_FREE_LIMIT,
  };
}

/** ¿Puede pagar una acción de `cost` créditos? (le queda trial o saldo). */
export function canAfford(w: AiWallet, cost = 1): boolean {
  return w.freeUsed < w.freeLimit || w.credits >= cost;
}

/**
 * Descuenta una acción: durante el trial gasta 1 del cupo gratis (sin importar
 * el costo, para que prueben cualquier cosa); agotado el trial, descuenta
 * `cost` créditos. Devuelve la billetera actualizada, o null si no alcanza.
 */
export async function consume(env: Env, workspaceId: string, cost = 1): Promise<AiWallet | null> {
  const w = await getWallet(env, workspaceId);
  if (w.freeUsed < w.freeLimit) {
    await tursoExec(
      env,
      `UPDATE cloud_workspaces SET ai_msgs_used = COALESCE(ai_msgs_used, 0) + 1, updated_at = datetime('now') WHERE id = ?`,
      [workspaceId],
    );
    return { ...w, freeUsed: w.freeUsed + 1 };
  }
  if (w.credits >= cost) {
    await tursoExec(
      env,
      `UPDATE cloud_workspaces SET ai_credits = MAX(0, COALESCE(ai_credits, 0) - ?), updated_at = datetime('now') WHERE id = ?`,
      [cost, workspaceId],
    );
    return { ...w, credits: w.credits - cost };
  }
  return null;
}

/** Suma los créditos de un pack al workspace (idempotencia la maneja el webhook). */
export async function addAiCredits(env: Env, workspaceId: string, packKey: string): Promise<void> {
  const pack = AI_PACKS[packKey];
  if (!pack) return;
  await ensureWorkspaceColumns(env);
  await tursoExec(
    env,
    `UPDATE cloud_workspaces SET ai_credits = COALESCE(ai_credits, 0) + ?, updated_at = datetime('now') WHERE id = ?`,
    [pack.credits, workspaceId],
  );
}
