/**
 * Estilos compartidos entre las 3 secciones de Ajustes → Cuenta/Equipo/
 * Datos en la nube. Antes vivían duplicados (literalmente copy-paste)
 * en cada archivo. Centralizados acá para que cualquier rebrand cambie
 * 1 lugar.
 */
import { color, radius, space, weight } from "../../tokens";

export const cloudStyles = {
  title: {
    fontSize: 16, fontWeight: 700, color: color.text,
    letterSpacing: -0.2, marginBottom: 4,
  } satisfies React.CSSProperties,

  desc: {
    fontSize: 13, color: color.textDim, marginBottom: 20, lineHeight: 1.5,
  } satisfies React.CSSProperties,

  card: {
    padding: space[4], background: color.surface,
    border: `1px solid ${color.border}`, borderRadius: radius.lg,
    maxWidth: 640,
  } satisfies React.CSSProperties,

  label: {
    fontSize: 12, fontWeight: 500, color: color.textMuted,
    marginBottom: 6, display: "block",
  } satisfies React.CSSProperties,

  input: {
    width: "100%", padding: "9px 12px",
    background: color.surface2, border: `1px solid ${color.borderStrong}`,
    borderRadius: 8, color: color.text, fontSize: 13, outline: "none",
    boxSizing: "border-box", marginBottom: 14,
  } satisfies React.CSSProperties,

  btnPrimary: {
    padding: "8px 18px", background: color.primary,
    borderRadius: 8, fontSize: 13, fontWeight: 600,
    color: "#fff", border: "none", cursor: "pointer",
  } satisfies React.CSSProperties,

  btnGhost: {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "6px 12px", background: "transparent",
    border: `1px solid ${color.border}`, borderRadius: 8,
    color: color.textMuted, fontSize: 12, fontWeight: weight.medium,
    cursor: "pointer",
  } satisfies React.CSSProperties,

  btnPrimarySm: {
    padding: "4px 10px", background: color.primary, borderRadius: 6,
    fontSize: 11, fontWeight: 600, color: "#fff", border: "none",
    cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 4,
  } satisfies React.CSSProperties,

  btnGhostSm: {
    padding: "4px 10px", background: "transparent",
    border: `1px solid ${color.border}`, borderRadius: 6,
    color: color.textMuted, fontSize: 11, fontWeight: weight.medium,
    cursor: "pointer",
  } satisfies React.CSSProperties,
} as const;
