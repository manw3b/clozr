import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  style?: React.CSSProperties;
  placeholder?: string;
}

export default function Select({ value, onChange, options, disabled, style, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          padding: "8px 32px 8px 12px",
          background: "var(--surface-2)",
          border: `1px solid ${open ? "var(--border-strong)" : "var(--border)"}`,
          borderRadius: 8,
          color: selected ? "var(--text-primary)" : "var(--text-tertiary)",
          fontSize: 13,
          textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          transition: "border-color 0.12s",
          boxSizing: "border-box",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        onMouseEnter={(e) => {
          if (!disabled && !open)
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-strong)";
        }}
        onMouseLeave={(e) => {
          if (!open)
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
        }}
      >
        {selected?.label ?? placeholder ?? "Seleccionar..."}
      </button>
      <ChevronDown
        size={14}
        style={{
          position: "absolute",
          right: 10,
          top: "50%",
          transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
          color: "var(--text-tertiary)",
          pointerEvents: "none",
          transition: "transform 0.15s",
        }}
      />
      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 99 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: 8,
              zIndex: 100,
              overflow: "hidden",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {options.map((opt) => {
              const isActive = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 12px",
                    fontSize: 13,
                    color: isActive ? "var(--brand)" : "var(--text-primary)",
                    background: isActive ? "rgba(232,0,29,0.08)" : "transparent",
                    fontWeight: isActive ? 600 : 400,
                    borderBottom: "1px solid var(--border)",
                    transition: "background 0.1s",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = isActive
                      ? "rgba(232,0,29,0.08)"
                      : "transparent";
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
