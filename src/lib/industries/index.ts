/**
 * Industries (nichos) — fuente de configuración por rubro.
 *
 * Ver docs/ROADMAP.md §3 para el modelo completo. Resumen rápido:
 *   - Workspace tiene `industry` = slug de un rubro.
 *   - Cada rubro tiene su config (seeds, pipeline default, labels, ícono).
 *   - "generic" siempre existe y es lo que tiene un workspace free.
 *   - Otros rubros se agregan cuando aparece un cliente piloto real
 *     (ver checklist en ROADMAP.md §9).
 *
 * IMPORTANTE: este file NO contiene lógica de paywall. Solo expone los
 * configs. El paywall vive en src/lib/entitlements.ts y decide si el
 * user actual puede ASIGNAR un rubro a un workspace.
 */

import { genericIndustry } from "./generic";
import { electronicsIndustry } from "./electronics";
import { automotiveIndustry } from "./automotive";
import { fashionIndustry } from "./fashion";
import { foodIndustry } from "./food";
import { servicesIndustry } from "./services";

export interface IndustryConfig {
  /** Slug interno (en inglés). Lo que vive en `workspace.industry`. */
  slug: string;
  /** Label en español para UI. */
  label: string;
  /** Emoji representativo (topbar, dropdowns). */
  icon: string;
  /** Descripción corta — para pricing/onboarding. */
  description: string;
  /**
   * Si es un add-on pago. `false` solo para "generic" — el resto se
   * compran individualmente. Hoy ningún paywall está activo; este flag
   * solo documenta. Cuando Fase I lance Stripe, los hooks van a chequear
   * `isPaid` + `user.owned_industries[]`.
   */
  isPaid: boolean;
  /**
   * Precio tentativo en USD (one-time según ROADMAP). Solo se muestra
   * como referencia en el selector — no es real hasta que Stripe se
   * active. Null para rubros free (generic).
   */
  priceUsd: number | null;
  /**
   * Status del rubro hoy:
   *  - "ready": templates armados, listo para vender
   *  - "preview": rubro disponible para seleccionar pero seeds genéricos
   *    (el user puede configurar manual; cuando madure mueve a ready)
   *  - "coming-soon": no listo, solo signaling de interés
   */
  status: "ready" | "preview" | "coming-soon";
  /**
   * 3-4 bullets de qué incluye el nicho cuando se compra. Usado en el
   * selector como "preview de valor". Idioma rioplatense.
   */
  highlights: readonly string[];
  /**
   * Label override para el item "Inventario" del sidebar. Si null, se
   * usa "Inventario" default. Permite "Vehículos" para autos, etc.
   */
  inventoryLabel?: string;
}

/**
 * Registry central. Cuando agregues un rubro nuevo:
 *   1. Crear `src/lib/industries/<slug>.ts` con su `IndustryConfig`
 *   2. Importarlo arriba
 *   3. Agregarlo a este objeto con su slug como key
 *   4. Seguir el checklist de ROADMAP.md §9 (cliente piloto, etc).
 */
export const INDUSTRIES = {
  generic: genericIndustry,
  electronics: electronicsIndustry,
  automotive: automotiveIndustry,
  fashion: fashionIndustry,
  food: foodIndustry,
  services: servicesIndustry,
} as const satisfies Record<string, IndustryConfig>;

/** Lista en orden de presentación (selector). */
export const INDUSTRY_LIST: IndustryConfig[] = [
  genericIndustry,
  electronicsIndustry,
  automotiveIndustry,
  fashionIndustry,
  foodIndustry,
  servicesIndustry,
];

export type IndustrySlug = keyof typeof INDUSTRIES;

/** Lookup defensivo. Si el slug no existe, devuelve "generic". */
export function getIndustry(slug: string | null | undefined): IndustryConfig {
  if (!slug) return INDUSTRIES.generic;
  return (INDUSTRIES as Record<string, IndustryConfig>)[slug] ?? INDUSTRIES.generic;
}

export { genericIndustry };
