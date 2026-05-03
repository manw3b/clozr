import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { color, radius, space, text, weight } from "../tokens";

interface StepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Saltos cuando se mantiene shift (default 5) */
  shiftStep?: number;
  /** ancho total del control */
  width?: number;
  disabled?: boolean;
}

/**
 * Input numérico con botones [−][N][+] grandes. Reemplaza el input number nativo
 * cuyas flechas son chiquitas y no funcionan bien con teclado al borrar.
 *
 * Estado interno como string mientras el usuario edita (permite borrar todo y
 * reescribir). Normaliza a número entero (clamped a min/max) on blur.
 */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 9999,
  step = 1,
  shiftStep = 5,
  width = 120,
  disabled = false,
}: StepperProps) {
  const [text_, setText] = useState(String(value));

  // Si value cambia desde fuera, sincronizamos
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = () => {
    const n = parseInt(text_, 10);
    if (Number.isNaN(n)) {
      setText(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, n));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  const dec = (e: React.MouseEvent) => {
    if (disabled) return;
    const inc = e.shiftKey ? shiftStep : step;
    const n = Math.max(min, value - inc);
    onChange(n);
    setText(String(n));
  };

  const incBtn = (e: React.MouseEvent) => {
    if (disabled) return;
    const inc = e.shiftKey ? shiftStep : step;
    const n = Math.min(max, value + inc);
    onChange(n);
    setText(String(n));
  };

  const btnStyle: React.CSSProperties = {
    width: 32,
    height: 32,
    background: color.surface2,
    border: `1px solid ${color.border}`,
    borderRadius: radius.sm,
    color: color.text,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "all 100ms",
    opacity: disabled ? 0.5 : 1,
  };

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: space[2],
        width,
      }}
    >
      <button
        type="button"
        aria-label="Decrementar"
        title="Click. Shift+click = -5"
        onClick={dec}
        disabled={disabled || value <= min}
        style={{ ...btnStyle, opacity: value <= min ? 0.4 : 1 }}
      >
        <Minus size={14} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={text_}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
        disabled={disabled}
        style={{
          flex: 1,
          height: 32,
          background: color.surface,
          border: `1px solid ${color.border}`,
          borderRadius: radius.sm,
          color: color.text,
          fontSize: text.sm,
          fontWeight: weight.semibold,
          textAlign: "center",
          fontVariantNumeric: "tabular-nums",
          minWidth: 40,
        }}
      />
      <button
        type="button"
        aria-label="Incrementar"
        title="Click. Shift+click = +5"
        onClick={incBtn}
        disabled={disabled || value >= max}
        style={{ ...btnStyle, opacity: value >= max ? 0.4 : 1 }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
