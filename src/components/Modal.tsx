import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  maxWidth?: number;
  children: ReactNode;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  maxWidth = 640,
  children,
}: ModalProps) {
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
          background: "rgba(0,0,0,0.55)",
          zIndex: 40,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 0.2s ease",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: isOpen
            ? "translate(-50%,-50%) scale(1)"
            : "translate(-50%,-50%) scale(0.97)",
          background: "var(--surface)",
          borderRadius: 14,
          border: "1px solid var(--border)",
          zIndex: 50,
          width: `min(${maxWidth}px, calc(100vw - 48px))`,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "transform 0.2s ease, opacity 0.2s ease",
        }}
      >
        {title && (
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
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
              {title}
            </span>
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
        )}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>{children}</div>
      </div>
    </>
  );
}
