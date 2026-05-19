import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { color, radius } from '../tokens';

/**
 * Popover — primitive controlado para popovers con smart placement.
 *
 * Maneja todo lo molesto:
 * - Portal a document.body (escapa overflow de columnas, modales, drawers)
 * - Posicionamiento vs viewport (flip arriba si no entra abajo, alinea a la
 *   derecha por default y clamp a los bordes)
 * - Click outside cierra
 * - Escape cierra
 * - Reposiciona en resize / scroll
 *
 * Pattern de uso: el caller controla `open` y pasa un `triggerRef` (un
 * `useRef<HTMLElement>` apuntando al botón). El popover se ancla a ese
 * elemento. Esto evita pelearse con render-props o slots — el caller
 * tiene control total del trigger y su styling.
 *
 * @example
 *   const triggerRef = useRef<HTMLButtonElement>(null);
 *   const [open, setOpen] = useState(false);
 *
 *   return (
 *     <>
 *       <button ref={triggerRef} onClick={() => setOpen(v => !v)}>...</button>
 *       <Popover open={open} onClose={() => setOpen(false)} triggerRef={triggerRef}>
 *         <div>contenido</div>
 *       </Popover>
 *     </>
 *   );
 */

const DEFAULT_WIDTH = 320;
const DEFAULT_MAX_HEIGHT = 440;

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** Ref al elemento trigger — se usa para anclar y para detectar click-outside. */
  triggerRef: React.RefObject<HTMLElement>;
  /** Ancho del popover en px. Default 320. */
  width?: number;
  /** Alto máximo en px. Default 440. */
  maxHeight?: number;
  /**
   * Alineación horizontal: 'end' alinea el borde derecho del popover con
   * el borde derecho del trigger (default — los pickers viven al final de
   * filas de acciones, abrir hacia la izquierda es cómodo). 'start' alinea
   * el borde izquierdo del popover con el izquierdo del trigger.
   */
  align?: 'start' | 'end';
  children: ReactNode;
}

export interface PopoverHandle {
  /** Forzar reposicionamiento (útil si cambió el contenido tras abrir). */
  reposition: () => void;
}

export const Popover = forwardRef<PopoverHandle, PopoverProps>(function Popover(
  {
    open,
    onClose,
    triggerRef,
    width = DEFAULT_WIDTH,
    maxHeight = DEFAULT_MAX_HEIGHT,
    align = 'end',
    children,
  },
  ref,
) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Smart placement vs viewport. Idéntico al algoritmo que tenían los dos
  // pickers — ahora vive en un único lugar.
  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      // Vertical: prefer abajo. Flip arriba si no entra abajo y hay más
      // espacio arriba. Si todavía no entra, clamp al viewport.
      const popH = Math.min(maxHeight, window.innerHeight - 16);
      let top = rect.bottom + margin;
      if (spaceBelow < popH + margin && spaceAbove > spaceBelow) {
        top = rect.top - popH - margin;
      }
      top = Math.max(8, Math.min(top, window.innerHeight - popH - 8));

      // Horizontal: según align. Clamp final a los bordes del viewport.
      let left = align === 'end' ? rect.right - width : rect.left;
      if (left < 8) left = rect.left;
      left = Math.min(left, window.innerWidth - width - 8);
      left = Math.max(8, left);

      setPos({ top, left });
    }
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, triggerRef, width, maxHeight, align]);

  useImperativeHandle(
    ref,
    () => ({
      reposition: () => {
        const trigger = triggerRef.current;
        if (!trigger || !open) return;
        // Triggerea el efecto: el useLayoutEffect se re-ejecuta al cambiar
        // open o cualquier dep, así que simulamos un resize-style trigger
        // disparando el event handler manual.
        window.dispatchEvent(new Event('resize'));
      },
    }),
    [triggerRef, open],
  );

  // Click outside + Escape.
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const inTrigger = triggerRef.current?.contains(target) ?? false;
      const inPopover = popoverRef.current?.contains(target) ?? false;
      if (!inTrigger && !inPopover) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, triggerRef]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={popoverRef}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 1000,
        width,
        maxHeight,
        overflowY: 'auto',
        background: color.surface,
        border: `1px solid ${color.borderStrong}`,
        borderRadius: radius.md,
        boxShadow: 'var(--shadow-lg)',
        padding: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {children}
    </div>,
    document.body,
  );
});
