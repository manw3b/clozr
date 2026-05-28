/**
 * TipsModal — modal minimalista "¿Sabías que…?" (J1).
 *
 * Aparece máximo 1 vez por semana + solo en la primera llegada del día.
 * El user puede:
 *   - "Probar" (si el tip tiene CTA): navega a la pantalla relacionada.
 *   - "Entendido": cierra.
 *   - "No mostrar más": silencia permanente (localStorage).
 *
 * Diseño: card centrada, fondo difuso, emoji grande, título corto,
 * body 1-2 líneas, dos botones inline + link sutil para silenciar.
 */

import { X } from "lucide-react";
import { useShouldShowTip } from "../lib/useShouldShowTip";
import { useUIStore, type ScreenId } from "../store/uiStore";
import { color, radius, weight } from "../tokens";

export function TipsModal({ enabled }: { enabled: boolean }) {
  const { tip, dismiss, silence } = useShouldShowTip(enabled);
  const setActiveScreen = useUIStore((s) => s.setActiveScreen);

  if (!tip) return null;

  function handleCta() {
    if (tip?.cta) {
      setActiveScreen(tip.cta.screen as ScreenId);
    }
    dismiss();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tips-modal-title"
      onClick={dismiss}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9998,
        padding: 24,
        animation: "fadeIn 0.18s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 420,
          width: "100%",
          background: color.surface,
          borderRadius: radius.lg,
          padding: "28px 28px 22px",
          border: `1px solid ${color.border}`,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          position: "relative",
          animation: "slideUp 0.22s ease",
        }}
      >
        {/* Close ✕ */}
        <button
          onClick={dismiss}
          aria-label="Cerrar"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 28,
            height: 28,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            color: color.textDim,
            cursor: "pointer",
            border: "none",
          }}
        >
          <X size={16} />
        </button>

        {/* Eyebrow */}
        <div style={{
          fontSize: 10,
          fontWeight: weight.bold,
          color: color.primary,
          letterSpacing: "1px",
          textTransform: "uppercase",
          marginBottom: 4,
        }}>
          ¿Sabías que…?
        </div>

        {/* Emoji + título */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 10 }}>
          <span style={{ fontSize: 34, lineHeight: 1, flexShrink: 0 }}>{tip.emoji}</span>
          <h3
            id="tips-modal-title"
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: weight.bold,
              color: color.text,
              letterSpacing: "-0.2px",
              lineHeight: 1.3,
              paddingTop: 2,
            }}
          >
            {tip.title}
          </h3>
        </div>

        {/* Body */}
        <p style={{
          margin: "0 0 22px",
          fontSize: 13,
          color: color.textMuted,
          lineHeight: 1.55,
        }}>
          {tip.body}
        </p>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <button
            onClick={silence}
            style={{
              padding: "4px 0",
              background: "transparent",
              border: "none",
              fontSize: 11,
              color: color.textDim,
              cursor: "pointer",
              textDecoration: "underline",
              textDecorationColor: "transparent",
              transition: "text-decoration-color 120ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.textDecorationColor = color.textDim; }}
            onMouseLeave={(e) => { e.currentTarget.style.textDecorationColor = "transparent"; }}
          >
            No mostrar más
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={dismiss}
              style={{
                padding: "7px 14px",
                background: "transparent",
                border: `1px solid ${color.border}`,
                borderRadius: 8,
                color: color.textMuted,
                fontSize: 12.5,
                fontWeight: weight.medium,
                cursor: "pointer",
              }}
            >
              Entendido
            </button>
            {tip.cta && (
              <button
                onClick={handleCta}
                style={{
                  padding: "7px 14px",
                  background: color.primary,
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: 12.5,
                  fontWeight: weight.semibold,
                  cursor: "pointer",
                }}
              >
                {tip.cta.label}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
