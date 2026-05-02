import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  width?: number;
  children: ReactNode;
}

export default function SidePanel({
  isOpen,
  onClose,
  title,
  width = 400,
  children,
}: SidePanelProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          zIndex: 40,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 0.2s ease",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width,
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          transform: isOpen ? "translateX(0)" : `translateX(${width}px)`,
          transition: "transform 0.25s cubic-bezier(0.32,0.72,0,1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 20px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          {title ? (
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
              {title}
            </span>
          ) : (
            <span />
          )}
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "var(--surface-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-tertiary)",
            }}
          >
            <X size={15} />
          </button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>{children}</div>
      </div>
    </>
  );
}
