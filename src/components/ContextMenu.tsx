import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import { color, radius, space, text, weight } from "../tokens";

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
  return (
    <button
      role="menuitem"
      onClick={() => {
        if (!disabled) onClick();
      }}
      disabled={disabled}
      className={`ctx-item${tone === "danger" ? " danger" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: space[2],
        padding: `7px ${space[3]}`,
        color: c,
        fontSize: text.sm,
        fontWeight: weight.medium,
        textAlign: "left",
        borderRadius: radius.sm,
        opacity: disabled ? 0.5 : 1,
        width: "100%",
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

/* ── Submenu (estilo Windows "Enviar a...") ─────────────── */

/**
 * Item con submenu que se abre al hover hacia la derecha del item padre.
 * Útil para colapsar grupos largos como "Mover a..." o "Posponer...".
 *
 *   <ContextMenuSub label="Mover a" icon={<ArrowRight />}>
 *     <ContextMenuItem onClick={...}>Etapa A</ContextMenuItem>
 *     <ContextMenuItem onClick={...}>Etapa B</ContextMenuItem>
 *   </ContextMenuSub>
 *
 * Abre al hover con un delay corto (150ms) para que el cursor pueda
 * moverse en diagonal sin cerrarlo. Se posiciona a la derecha; si no
 * cabe, se flippea a la izquierda automáticamente.
 */
export function ContextMenuSub({
  label,
  icon,
  children,
  tone,
}: {
  label: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  const itemRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [subPos, setSubPos] = useState<{ top: number; left: number; flipped: boolean } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const c = tone === "danger" ? color.danger : color.text;

  function computePosition() {
    if (!itemRef.current) return;
    const rect = itemRef.current.getBoundingClientRect();
    // Tentativa: a la derecha del item con un overlap de 2px (visual seam).
    const SUB_WIDTH_ESTIMATE = 200; // refinado después del primer render con subRef
    const margin = 8;
    let left = rect.right - 2;
    let flipped = false;
    if (left + SUB_WIDTH_ESTIMATE > window.innerWidth - margin) {
      left = rect.left - SUB_WIDTH_ESTIMATE + 2;
      flipped = true;
    }
    setSubPos({ top: rect.top, left, flipped });
  }

  function handleOpen() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    computePosition();
    setOpen(true);
  }

  function handleScheduleClose() {
    // Pequeño delay para que cursor en diagonal pase al submenu sin cerrar.
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  // Re-medir el sub real (refina la posición tras primer paint).
  useEffect(() => {
    if (!open || !subRef.current || !itemRef.current) return;
    const itemRect = itemRef.current.getBoundingClientRect();
    const subRect = subRef.current.getBoundingClientRect();
    const margin = 8;
    let left = itemRect.right - 2;
    let flipped = false;
    if (left + subRect.width > window.innerWidth - margin) {
      left = itemRect.left - subRect.width + 2;
      flipped = true;
    }
    let top = itemRect.top;
    if (top + subRect.height > window.innerHeight - margin) {
      top = window.innerHeight - subRect.height - margin;
    }
    setSubPos({ top, left, flipped });
  }, [open]);

  return (
    <div
      ref={itemRef}
      onMouseEnter={handleOpen}
      onMouseLeave={handleScheduleClose}
      style={{ position: "relative" }}
    >
      <div
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`ctx-item${tone === "danger" ? " danger" : ""}${open ? " active" : ""}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: space[2],
          padding: `7px ${space[3]}`,
          color: c,
          fontSize: text.sm,
          fontWeight: weight.medium,
          textAlign: "left",
          borderRadius: radius.sm,
          width: "100%",
          background: open ? color.surface2 : "transparent",
          cursor: "pointer",
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
        <span style={{ flex: 1, whiteSpace: "nowrap" }}>{label}</span>
        <ChevronRight size={12} color={color.textDim} />
      </div>

      {open && subPos &&
        createPortal(
          <div
            ref={subRef}
            role="menu"
            onMouseEnter={handleOpen}
            onMouseLeave={handleScheduleClose}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              position: "fixed",
              top: subPos.top,
              left: subPos.left,
              zIndex: 1101, // un nivel arriba del menu padre
              minWidth: 180,
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
        )}
    </div>
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
