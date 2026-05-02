import { useEffect, type ReactNode } from "react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  maxHeight?: string;
  children: ReactNode;
}

export default function BottomSheet({
  isOpen,
  onClose,
  title,
  maxHeight = "92vh",
  children,
}: BottomSheetProps) {
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
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 40,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 0.25s ease",
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--surface-elevated)",
          borderRadius: "18px 18px 0 0",
          borderTop: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
          zIndex: 50,
          maxHeight,
          display: "flex",
          flexDirection: "column",
          transform: isOpen ? "translateY(0)" : "translateY(105%)",
          transition: "transform 0.3s cubic-bezier(0.32,0.72,0,1)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "12px 0 4px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              background: "var(--border-strong)",
              borderRadius: 2,
            }}
          />
        </div>

        {title && (
          <div
            style={{
              padding: "4px 20px 14px",
              borderBottom: "1px solid var(--border)",
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text-primary)",
              flexShrink: 0,
            }}
          >
            {title}
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto", overscrollBehavior: "contain" }}>
          {children}
        </div>
      </div>
    </>
  );
}
