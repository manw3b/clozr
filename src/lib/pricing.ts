/**
 * Helpers puros para calcular precios de venta.
 *
 * Toda la lógica vive en USD (source of truth) y se convierte a la moneda
 * elegida con la cotización del workspace + el modificador del método de pago.
 */

export interface PriceContext {
  /** Precio base en USD para el tipo de cliente (lookup ya hecho). */
  basePriceUsd: number;
  /** Cotización USD→ARS vigente. */
  usdToArs: number;
  /** Modificador % del método de pago (positivo o negativo). */
  modifierPct: number;
  /** Moneda en la que se va a cobrar. */
  currency: "ARS" | "USD";
}

export interface PriceBreakdown {
  /** Precio sugerido final, ya con modificador aplicado, en la moneda elegida. */
  suggested: number;
  /** Precio base (USD del catálogo). */
  baseUsd: number;
  /** Diferencia que aporta el modificador, en moneda final. */
  modifierAmount: number;
  /** El modificador como string ya formateado: "+5%" / "-3%" / "—" */
  modifierLabel: string;
  currency: "ARS" | "USD";
}

export function computeSuggestedPrice(ctx: PriceContext): PriceBreakdown {
  const { basePriceUsd, usdToArs, modifierPct, currency } = ctx;
  const modifierFactor = 1 + modifierPct / 100;
  const adjustedUsd = basePriceUsd * modifierFactor;

  const suggested =
    currency === "USD" ? adjustedUsd : adjustedUsd * (usdToArs || 1);

  const baseInCurrency =
    currency === "USD" ? basePriceUsd : basePriceUsd * (usdToArs || 1);
  const modifierAmount = suggested - baseInCurrency;

  return {
    suggested,
    baseUsd: basePriceUsd,
    modifierAmount,
    modifierLabel:
      modifierPct === 0
        ? "—"
        : `${modifierPct > 0 ? "+" : ""}${modifierPct}%`,
    currency,
  };
}

/**
 * Compara el monto que el vendedor está cobrando vs el sugerido.
 * Devuelve el delta y un label positivo/neutral/negativo.
 */
export interface MarkupDelta {
  delta: number;
  /** Porcentaje sobre el sugerido. */
  pct: number;
  /** "above" = cobra más | "below" = cobra menos | "match" = cobra exacto. */
  direction: "above" | "below" | "match";
  /** Texto pre-formateado, ya con + o − y %. */
  label: string;
}

export function compareToSuggested(
  charged: number,
  suggested: number,
): MarkupDelta {
  if (suggested <= 0) {
    return { delta: 0, pct: 0, direction: "match", label: "Sin sugerido" };
  }
  const delta = charged - suggested;
  const pct = (delta / suggested) * 100;
  if (Math.abs(delta) < 0.01) {
    return { delta: 0, pct: 0, direction: "match", label: "Precio sugerido" };
  }
  const direction: MarkupDelta["direction"] = delta > 0 ? "above" : "below";
  const sign = delta > 0 ? "+" : "−";
  const label = `${sign}${Math.abs(delta).toFixed(0)} (${sign}${Math.abs(pct).toFixed(1)}%)`;
  return { delta, pct, direction, label };
}
