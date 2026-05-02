import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, hint, error, iconLeft, iconRight, style, ...rest },
  ref,
) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
      {label && (
        <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>
          {label}
        </label>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 38,
          padding: "0 12px",
          background: "var(--surface)",
          border: `1px solid ${error ? "var(--brand)" : "var(--border-strong)"}`,
          borderRadius: 8,
          transition: "border-color 0.12s ease, background 0.12s ease",
        }}
      >
        {iconLeft && <span style={{ color: "var(--text-tertiary)", display: "flex" }}>{iconLeft}</span>}
        <input
          ref={ref}
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text-primary)",
            fontSize: 14,
            ...style,
          }}
          {...rest}
        />
        {iconRight && <span style={{ color: "var(--text-tertiary)", display: "flex" }}>{iconRight}</span>}
      </div>
      {(hint || error) && (
        <span style={{ fontSize: 11, color: error ? "var(--brand)" : "var(--text-tertiary)" }}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
});

export default Input;
