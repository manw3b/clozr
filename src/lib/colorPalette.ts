/**
 * Paleta unificada de colores asignables (etapas del pipeline, tipos de
 * cliente, futuras categorías). 10 colores bien diferenciados, optimizados
 * para dark theme.
 *
 * Es el único lugar donde definir colores "de etiqueta". Tanto Settings
 * (color picker) como el kanban (stripe de columna, badge) leen de acá.
 *
 * Backward compat: los semantic ids viejos (info/warning/primary/etc.)
 * que vivían en STAGES default se mapean acá a la paleta nueva.
 */

export const COLOR_PALETTE = {
  gray:   { css: "#64748B", label: "Gris" },
  slate:  { css: "#94A3B8", label: "Pizarra" },
  blue:   { css: "#3B82F6", label: "Azul" },
  cyan:   { css: "#06B6D4", label: "Celeste" },
  teal:   { css: "#14B8A6", label: "Turquesa" },
  green:  { css: "#10B981", label: "Verde" },
  yellow: { css: "#EAB308", label: "Amarillo" },
  orange: { css: "#F97316", label: "Naranja" },
  red:    { css: "#EF4444", label: "Rojo" },
  pink:   { css: "#EC4899", label: "Rosa" },
  purple: { css: "#A855F7", label: "Violeta" },
  indigo: { css: "#6366F1", label: "Índigo" },
} as const;

export type PaletteColor = keyof typeof COLOR_PALETTE;

/** Lista ordenada para iterar en pickers. */
export const PALETTE_LIST: Array<{ id: PaletteColor; css: string; label: string }> =
  (Object.keys(COLOR_PALETTE) as PaletteColor[]).map((id) => ({
    id,
    css: COLOR_PALETTE[id].css,
    label: COLOR_PALETTE[id].label,
  }));

/** Aliases que vivían en código viejo (semantic) → ids nuevos de paleta.
 *  No los usamos para guardar nuevo, sólo para LEER datos viejos sin romper. */
const LEGACY_ALIAS: Record<string, PaletteColor> = {
  neutral: "gray",
  info: "blue",
  warning: "yellow",
  primary: "red",
  success: "green",
  danger: "red",
  amber: "yellow",
};

/** Devuelve el CSS color para un id de paleta. Acepta aliases legacy. */
export function colorCss(id: string | null | undefined): string {
  if (!id) return COLOR_PALETTE.gray.css;
  const real = (LEGACY_ALIAS[id] ?? id) as PaletteColor;
  return COLOR_PALETTE[real]?.css ?? COLOR_PALETTE.gray.css;
}

/** Background tinted del color para fondos sutiles (ej: drop hover). */
export function colorBg(id: string | null | undefined, alpha = 0.08): string {
  const css = colorCss(id);
  return hexToRgba(css, alpha);
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
