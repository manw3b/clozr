/**
 * ConfirmHost — mounted ONCE en App.tsx. Renderiza el modal cuando
 * confirmAsync() pone un estado pending en useConfirmStore.
 *
 * Diseño: backdrop dimmer + card centrada. ESC = cancelar. Enter =
 * confirmar. Click fuera = cancelar. Focus inicial en el botón de
 * confirmar para que Enter funcione sin tab navigation.
 */

import { useEffect, useRef } from "react";
import { useConfirmStore } from "../lib/confirmAsync";
import { color, radius, space, text, weight } from "../tokens";

export function ConfirmHost() {
  const pending = useConfirmStore((s) => s.pending);
  const finish = useConfirmStore((s) => s.finish);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Auto-focus en el botón confirmar al abrir.
  useEffect(() => {
    if (pending && confirmBtnRef.current) {
      confirmBtnRef.current.focus();
    }
  }, [pending]);

  // ESC = cancelar, Enter ya lo maneja el button con focus.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, finish]);

  if (!pending) return null;

  const isDanger = pending.tone === "danger";
  const confirmBg = isDanger ? color.danger : color.primary;

  return (
    <div
      onClick={() => finish(false)}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: space[4],
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 420,
          background: color.surface,
          border: `1px solid ${color.border}`,
          borderRadius: radius.lg,
          padding: space[4],
          boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
        }}
      >
        {pending.title && (
          <h2 style={{ fontSize: text.lg, fontWeight: weight.semibold, color: color.text, marginBottom: space[3] }}>
            {pending.title}
          </h2>
        )}
        <p style={{ fontSize: text.sm, color: color.textMuted, marginBottom: space[4], lineHeight: 1.5, whiteSpace: "pre-line" }}>
          {pending.message}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: space[2] }}>
          <button
            onClick={() => finish(false)}
            style={{
              padding: "8px 18px",
              background: "transparent",
              border: `1px solid ${color.border}`,
              borderRadius: 8,
              color: color.textMuted,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {pending.cancelText ?? "Cancelar"}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={() => finish(true)}
            style={{
              padding: "8px 18px",
              background: confirmBg,
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {pending.confirmText ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
