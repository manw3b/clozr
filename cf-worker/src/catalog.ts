/**
 * Catálogos premium (add-on de pago único, F4).
 *
 * Un catálogo premium (ej: "apple") se desbloquea una sola vez por workspace,
 * por pago único en MP (USD, cobrado en ARS al blue) o por un código de la
 * Consola (kind 'unlock'). El entitlement vive en cloud_workspaces.unlocked_catalogs
 * (JSON array de keys). Diseñado para múltiples catálogos a futuro.
 *
 * Módulo neutral (ni billing ni console) para que ambos lo importen sin ciclo.
 */

import type { Env } from "./index";
import { ensureWorkspaceColumns } from "./schema";
import { tursoFirst, tursoExec } from "./turso";

/** Catálogos disponibles → precio USD (pago único) + label. */
export const CATALOG_PACKS: Record<string, { usd: number; label: string }> = {
  apple: { usd: 100, label: "Catálogo Apple" },
};

/**
 * Agrega un catálogo a `unlocked_catalogs` del workspace (idempotente). Lo usan
 * el canje (kind 'unlock') y el webhook del pago único de catálogo.
 */
export async function unlockCatalog(env: Env, workspaceId: string, key: string): Promise<void> {
  await ensureWorkspaceColumns(env);
  const row = await tursoFirst(env, `SELECT unlocked_catalogs FROM cloud_workspaces WHERE id = ?`, [workspaceId]);
  let list: string[] = [];
  try {
    const parsed = JSON.parse(String(row?.unlocked_catalogs ?? "[]"));
    if (Array.isArray(parsed)) list = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    // malformado → lista vacía
  }
  if (!list.includes(key)) list.push(key);
  await tursoExec(
    env,
    `UPDATE cloud_workspaces SET unlocked_catalogs = ?, updated_at = datetime('now') WHERE id = ?`,
    [JSON.stringify(list), workspaceId],
  );
}
