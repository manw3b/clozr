import type { CSSProperties, ReactNode } from "react";

type Padding = "none" | "sm" | "md" | "lg";

interface Props {
  children: ReactNode;
  padding?: Padding;
  elevated?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
}

const PAD: Record<Padding, string> = {
  none: "0",
  sm: "12px",
  md: "16px",
  lg: "24px",
};

export default function Card({ children, padding = "md", elevated, style, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      style={{
        background: elevated ? "var(--surface-elevated)" : "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: PAD[padding],
        boxShadow: elevated ? "var(--shadow-sm)" : undefined,
        cursor: onClick ? "pointer" : undefined,
        transition: "background 0.12s ease, border-color 0.12s ease",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
