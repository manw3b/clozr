import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { color, radius, space, text, weight, duration, ease } from "../tokens";

/**
 * ContextMenu reusable — reemplaza el menu nativo del WebView con uno
 * propio, consistente con el tema de la app.
 *
 * Patrón de uso:
 *
 *   const ctx = useContextMenu();
 *   ...
 *   <div onContextMenu={ctx.openAt}>
 *     ...row content...
 *   </div>
 *
 *   {ctx.open && (
 *     <ContextMenu position={ctx.position} onClose={ctx.close}>
 *       <ContextMenuItem icon={<X />} onClick={() => doX()}>Hacer X</ContextMenuItem>
 *       <ContextMenuItem icon={<Y />} onClick={() => doY()}>Hacer Y</ContextMenuItem>
 *       <ContextMenuDivider />
 *       <ContextMenuItem tone="danger" onClick={...}>Borrar</ContextMenuItem>
 *     </ContextMenu>
 *   )}
 *
 * Renderiza por portal a document.body con position:fixed, ajusta
 * automáticamente si se sale del viewport.
 */

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuProps {
  position: ContextMenuPosition;
  onClose: () => void;
  children: ReactNode;
  /** Ancho mínimo del menu (default 200) */
  minWidth?: number;
}

export function ContextMenu({
  position,
  onClose,
  children,
  minWidth = 200,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState<ContextMenuPosition>(position);

  // Ajustar posición si se sale del viewport (después de medir el menu real)
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    let x = position.x;
    let y = position.y;
    const margin = 8;
    if (x + rect.width > window.innerWidth - margin) {
      x = window.innerWidth - rect.width - margin;
    }
    if (y + rect.height > window.innerHeight - margin) {
      y = window.innerHeight - rect.height - margin;
    }
    if (x < margin) x = margin;
    if (y < margin) y = margin;
    setAdjustedPos({ x, y });
  }, [position]);

  // Click outside / Esc / scroll cierran
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onScroll() {
      onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      onContextMenu={(e) => e.preventDefault()} // que el right-click sobre el propio menu no abra otro
      style={{
        position: "fixed",
        top: adjustedPos.y,
        left: adjustedPos.x,
        zIndex: 1100,
        minWidth,
        background: color.surface,
        border: `1px solid ${color.borderStrong}`,
        borderRadius: radius.md,
        boxShadow: "var(--shadow-lg)",
        padding: 4,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/* ── Items ──────────────────────────────────────────────── */

export function ContextMenuItem({
  icon,
  children,
  onClick,
  shortcut,
  tone,
  disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  shortcut?: string;
  tone?: "default" | "danger";
  disabled?: boolean;
}) {
  const c = tone === "danger" ? color.danger : color.text;
  const hoverBg = tone === "danger" ? color.dangerBg : color.surfaceHover;
  return (
    <button
      role="menuitem"
      onClick={() => {
        if (!disabled) onClick();
      }}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: space[2],
        padding: `7px ${space[3]}`,
        background: "transparent",
        color: c,
        fontSize: text.sm,
        fontWeight: weight.medium,
        textAlign: "left",
        borderRadius: radius.sm,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: `background ${duration.fast} ${ease}`,
        width: "100%",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {icon && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 16,
            color: tone === "danger" ? color.danger : color.textMuted,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      )}
      <span style={{ flex: 1, whiteSpace: "nowrap" }}>{children}</span>
      {shortcut && (
        <span
          style={{
            fontSize: text.xs,
            color: color.textDim,
            fontWeight: weight.regular,
          }}
        >
          {shortcut}
        </span>
      )}
    </button>
  );
}

export function ContextMenuDivider() {
  return (
    <div
      role="separator"
      style={{
        height: 1,
        background: color.border,
        margin: "4px 0",
      }}
    />
  );
}

export function ContextMenuLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: weight.semibold,
        color: color.textDim,
        textTransform: "uppercase",
        letterSpacing: "0.6px",
        padding: `${space[2]} ${space[3]} 4px`,
      }}
    >
      {children}
    </div>
  );
}

/* ── Hook conveniente ──────────────────────────────────── */

/**
 * Hook que maneja el state del menu (posición + open) y devuelve un
 * handler `openAt` listo para spread en `onContextMenu`.
 *
 *   const ctx = useContextMenu();
 *   <div onContextMenu={ctx.openAt}>...</div>
 *   {ctx.open && <ContextMenu position={ctx.position} onClose={ctx.close}>...</ContextMenu>}
 */
export function useContextMenu() {
  const [position, setPosition] = useState<ContextMenuPosition | null>(null);
  return {
    open: !!position,
    position: position ?? { x: 0, y: 0 },
    openAt: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setPosition({ x: e.clientX, y: e.clientY });
    },
    close: () => setPosition(null),
  };
}
