import type { ReactNode } from "react";

type Tone = "neutral" | "brand" | "green" | "amber" | "blue";

interface Props {
  children: ReactNode;
  tone?: Tone;
  size?: "sm" | "md";
}

function toneStyle(tone: Tone): React.CSSProperties {
  switch (tone) {
    case "brand": return { background: "var(--brand-bg)", color: "var(--brand)" };
    case "green": return { background: "var(--green-bg)", color: "var(--green)" };
    case "amber": return { background: "var(--amber-bg)", color: "var(--amber)" };
    case "blue":  return { background: "var(--blue-bg)",  color: "var(--blue)"  };
    case "neutral":
    default:      return { background: "var(--surface-2)", color: "var(--text-secondary)" };
  }
}

export default function Badge({ children, tone = "neutral", size = "sm" }: Props) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: size === "md" ? "3px 10px" : "2px 8px",
        borderRadius: "var(--radius-full)",
        fontSize: size === "md" ? 12 : 11,
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        ...toneStyle(tone),
      }}
    >
      {children}
    </span>
  );
}
