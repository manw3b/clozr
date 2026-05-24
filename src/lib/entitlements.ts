/**
 * Entitlements — gating de features pagas y de nichos.
 *
 * Ver docs/ROADMAP.md §3 + §6 principio 8 para el modelo.
 *
 * Dos checks distintos:
 *   - hasFeature(user, feature)      → la suscripción Pro/Enterprise habilita
 *   - canUseIndustry(user, industry) → user.owned_industries[] habilita
 *
 * HOY: ambos devuelven `true` siempre. Es schema-ready pero permisivo.
 * Cuando Fase I lance Stripe, solo este file cambia — los callsites ya
 * consumen del helper.
 *
 * Reglas de naming:
 *   - features = strings tipo "cloud-sync", "team-management"
 *     (cosas que la suscripción Pro desbloquea)
 *   - industries = slugs como "electronics", "automotive" (add-ons)
 *
 * Ejemplo de uso (cuando se active):
 *   if (!hasFeature(user, "cloud-sync")) showUpgradeModal();
 *   if (!canUseIndustry(user, "automotive")) showBuyIndustryModal();
 */

import type { IndustrySlug } from "./industries";

/**
 * El user tiene la suscripción Pro activa? Cuando se active el paywall,
 * leerá `user.plan` de cloud o local store.
 */
export type Plan = "free" | "pro" | "enterprise";

/**
 * Features cross-cutting que desbloquea la suscripción. Lista expandible:
 *   - cloud-sync: ya hoy funciona, en F.I se vuelve Pro-only
 *   - team-management: invitar miembros, gestionar roles
 *   - cloud-backup: backup automático a R2/S3
 *   - advanced-reports: cohortes, LTV, performance vendedores
 *   - industry-updates: recibir nuevos templates/seeds de nichos que ya compraste
 *   - multi-workspace: tener 2+ workspaces simultáneos
 */
export type Feature =
  | "cloud-sync"
  | "team-management"
  | "cloud-backup"
  | "advanced-reports"
  | "industry-updates"
  | "multi-workspace";

interface UserEntitlements {
  plan: Plan;
  /** Slugs de nichos que el user compró individualmente. */
  ownedIndustries: string[];
}

/**
 * Stub: hoy devuelve siempre true. Cuando lancemos paywall, leerá del
 * user store (cloud users.plan + cloud users.owned_industries).
 */
export function hasFeature(_user: UserEntitlements | null, _feature: Feature): boolean {
  // TODO Fase I — implementar real:
  //   if (!user || user.plan === "free") return PRO_FEATURES.includes(feature) ? false : true;
  //   return true;
  return true;
}

/**
 * Puede el user asignar `industry` a un workspace? `"generic"` siempre sí
 * (es el default). El resto requiere haber comprado el add-on.
 */
export function canUseIndustry(
  _user: UserEntitlements | null,
  industry: IndustrySlug | string,
): boolean {
  // Generic siempre disponible — es lo que reciben los free.
  if (industry === "generic") return true;
  // Stub: hoy todos los demás también. Cuando lancemos paywall:
  //   return user.ownedIndustries.includes(industry);
  return true;
}

/**
 * Helper para tener el "user actual" en forma estandarizada. Hoy es un
 * stub porque ni plan ni owned_industries existen en el schema todavía;
 * cuando los agreguemos, leerá del store correcto.
 */
export function getCurrentEntitlements(): UserEntitlements {
  return {
    plan: "free",
    ownedIndustries: [],
  };
}
