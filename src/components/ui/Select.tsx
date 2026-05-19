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
        className={`select-trigger${open ? " open" : ""}`}
        style={{
          width: "100%",
          padding: "8px 32px 8px 12px",
          borderRadius: 8,
          color: selected ? "var(--text-primary)" : "var(--text-tertiary)",
          fontSize: 13,
          textAlign: "left",
          boxSizing: "border-box",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
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
                  className={`select-option${isActive ? " active" : ""}`}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 12px",
                    fontSize: 13,
                    color: isActive ? "var(--brand)" : "var(--text-primary)",
                    fontWeight: isActive ? 600 : 400,
                    borderBottom: "1px solid var(--border)",
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
