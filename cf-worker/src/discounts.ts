/**
 * Descuentos apuntados (F5).
 *
 * Un descuento se otorga a un workspace al canjear un código de la Consola
 * (kind 'discount') y queda guardado en cloud_workspaces (discount_type,
 * discount_value, discount_target). Se aplica en CADA checkout cuyo target
 * matchee — plan, empleados, catálogo — y también en el re-pricing, así el
 * beneficio es consistente y permanente (hasta que el admin lo cambie).
 *
 * Targets:
 *   "all"               → cualquier cosa
 *   "plan:any"          → cualquier plan (Pro/Team) + empleados extra
 *   "plan:pro"|"team"   → ese plan puntual
 *   "catalog:any"       → cualquier catálogo premium
 *   "catalog:apple"     → ese catálogo puntual
 *
 * Módulo neutral (sin deps de billing/console) para que todos lo importen.
 */

import type { Env } from "./index";
import { ensureWorkspaceColumns } from "./schema";
import { tursoFirst } from "./turso";

export type DiscountCategory = "plan" | "catalog";

/** ¿El target del descuento aplica a esta compra (category + key)? */
export function discountTargetMatches(
  target: string | null | undefined,
  category: DiscountCategory,
  key: string,
): boolean {
  if (!target) return false;
  if (target === "all") return true;
  const [cat, sub] = target.split(":");
  if (cat !== category) return false;
  return sub === "any" || sub === key;
}

/** Aplica un descuento (percent o amount en USD) a un monto USD. Nunca negativo. */
export function applyDiscountUsd(baseUsd: number, type: string, value: number): number {
  if (type === "percent") return Math.max(0, baseUsd * (1 - value / 100));
  if (type === "amount") return Math.max(0, baseUsd - value);
  return baseUsd;
}

/**
 * Devuelve el monto USD ya con el descuento del workspace aplicado (si tiene
 * uno cuyo target matchee la compra). Si no, devuelve baseUsd intacto.
 */
export async function applyWorkspaceDiscount(
  env: Env,
  workspaceId: string,
  baseUsd: number,
  category: DiscountCategory,
  key: string,
): Promise<number> {
  await ensureWorkspaceColumns(env);
  const row = await tursoFirst(
    env,
    `SELECT discount_type, discount_value, discount_target FROM cloud_workspaces WHERE id = ?`,
    [workspaceId],
  );
  const type = row?.discount_type ? String(row.discount_type) : "";
  if (!type) return baseUsd;
  if (!discountTargetMatches(row?.discount_target as string | null, category, key)) return baseUsd;
  return applyDiscountUsd(baseUsd, type, Number(row?.discount_value ?? 0));
}
