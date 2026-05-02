import { useUIStore } from "../store/uiStore";

export default function Toaster() {
  const { toasts, dismissToast } = useUIStore();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 74,
        left: 12,
        right: 12,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => {
        const isError = toast.type === "error";
        const isSuccess = toast.type === "success";
        return (
          <div
            key={toast.id}
            onClick={() => dismissToast(toast.id)}
            className="fade-in"
            style={{
              padding: "11px 14px",
              borderRadius: 10,
              background: isError
                ? "var(--red-bg)"
                : isSuccess
                  ? "var(--green-bg)"
                  : "var(--surface-3)",
              border: `1px solid ${
                isError
                  ? "rgba(232,0,29,0.4)"
                  : isSuccess
                    ? "rgba(48,209,88,0.4)"
                    : "var(--border-strong)"
              }`,
              color: isError
                ? "var(--brand-light)"
                : isSuccess
                  ? "var(--green)"
                  : "var(--text-primary)",
              fontSize: 13,
              fontWeight: 500,
              pointerEvents: "auto",
              cursor: "pointer",
            }}
          >
            {toast.message}
          </div>
        );
      })}
    </div>
  );
}
