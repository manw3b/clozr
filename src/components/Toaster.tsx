import { useUIStore } from "../store/uiStore";

export default function Toaster() {
  const { toasts, dismissToast } = useUIStore();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        pointerEvents: "none",
        maxWidth: 380,
      }}
    >
      {toasts.map((toast) => {
        const isError = toast.type === "error";
        const isSuccess = toast.type === "success";
        const accent = isError ? "var(--brand)" : isSuccess ? "var(--green)" : "var(--text-secondary)";
        return (
          <div
            key={toast.id}
            onClick={() => dismissToast(toast.id)}
            className="fade-in"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 16px",
              borderRadius: 12,
              background: "var(--surface-elevated)",
              border: "1px solid var(--border-strong)",
              boxShadow: "var(--shadow-md)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 500,
              pointerEvents: "auto",
              cursor: "pointer",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent, flexShrink: 0 }} />
            {toast.message}
          </div>
        );
      })}
    </div>
  );
}
