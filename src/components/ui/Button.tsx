import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const SIZES: Record<Size, React.CSSProperties> = {
  sm: { height: 28, padding: "0 10px", fontSize: 12, gap: 6, borderRadius: 6 },
  md: { height: 34, padding: "0 14px", fontSize: 13, gap: 7, borderRadius: 8 },
  lg: { height: 42, padding: "0 18px", fontSize: 14, gap: 8, borderRadius: 10 },
};

function variantStyle(variant: Variant): React.CSSProperties {
  switch (variant) {
    case "primary":
      return { background: "var(--brand)", color: "#fff" };
    case "danger":
      return { background: "var(--brand-bg)", color: "var(--brand)" };
    case "success":
      return { background: "var(--green)", color: "#fff" };
    case "ghost":
      return { background: "transparent", color: "var(--text-secondary)" };
    case "secondary":
    default:
      return {
        background: "var(--surface-2)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
      };
  }
}

const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", size = "md", iconLeft, iconRight, loading, fullWidth, children, style, disabled, ...rest },
  ref,
) {
  const sizeStyle = SIZES[size];
  const vStyle = variantStyle(variant);

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        whiteSpace: "nowrap",
        transition: "background 0.12s ease, opacity 0.12s ease, transform 0.06s ease",
        opacity: disabled || loading ? 0.5 : 1,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        width: fullWidth ? "100%" : undefined,
        ...sizeStyle,
        ...vStyle,
        ...style,
      }}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
});

export default Button;
