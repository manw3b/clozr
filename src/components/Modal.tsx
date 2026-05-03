import { ReactNode, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { color, radius, space, text, weight } from '../tokens';

interface ModalProps {
  /** Use 'open'. 'isOpen' also accepted for legacy compatibility. */
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Ancho máx (px). Default 520 */
  maxWidth?: number;
  /** Acciones del footer */
  footer?: ReactNode;
  children: ReactNode;
  /**
   * Callback que devuelve true si el modal tiene cambios sin guardar.
   * Si está definido y devuelve true:
   *  - Click en overlay → solo hace shake (no cierra)
   *  - X / Esc / Cancel → muestra confirm dialog
   * Si no está definido, el modal cierra normal.
   */
  isDirty?: () => boolean;
  /** Texto del confirm dialog cuando isDirty=true (default genérico) */
  confirmCloseText?: string;
}

/**
 * Modal base centrado.
 *
 * Reglas:
 * - Cierra con Escape
 * - Click en overlay cierra
 * - Animación suave (fade + scale)
 * - El body scrollea internamente; el header y footer quedan pegados
 */
export function Modal({
  open,
  isOpen,
  onClose,
  title,
  subtitle,
  maxWidth = 520,
  footer,
  children,
  isDirty,
  confirmCloseText = "¿Cerrar y descartar los cambios?",
}: ModalProps) {
  const visible = open ?? isOpen ?? false;
  const [shaking, setShaking] = useState(false);
  const shakeTimer = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Refs para evitar stale closures en handlers globales (Escape).
  // Sin esto, el listener de Esc registrado en mount usa siempre el isDirty
  // del primer render → no detecta cambios cuando el form se ensucia.
  const isDirtyRef = useRef(isDirty);
  const onCloseRef = useRef(onClose);
  const confirmTextRef = useRef(confirmCloseText);
  isDirtyRef.current = isDirty;
  onCloseRef.current = onClose;
  confirmTextRef.current = confirmCloseText;

  function triggerShake() {
    // Reset sincrónico antes de re-encender, así la animación se re-dispara
    // aunque el flag ya estuviera en true por un click anterior.
    setShaking(false);
    if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
    requestAnimationFrame(() => {
      setShaking(true);
      shakeTimer.current = window.setTimeout(() => setShaking(false), 450);
    });
  }

  function attemptClose(intentional: boolean) {
    const dirty = isDirtyRef.current?.() ?? false;
    if (!dirty) {
      onCloseRef.current();
      return;
    }
    if (!intentional) {
      // overlay click: solo shake
      triggerShake();
      return;
    }
    // intentional close (X, Esc, Cancel): confirm
    if (window.confirm(confirmTextRef.current)) {
      onCloseRef.current();
    } else {
      triggerShake();
    }
  }

  useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        const dirty = isDirtyRef.current?.() ?? false;
        if (!dirty) {
          onCloseRef.current();
          return;
        }
        if (window.confirm(confirmTextRef.current)) {
          onCloseRef.current();
        } else {
          triggerShake();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      <div
        onClick={() => attemptClose(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(2px)',
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: space[4],
          animation: 'clozr-modal-fade 200ms ease-out',
        }}
      >
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: radius.xl,
            width: '100%',
            maxWidth,
            maxHeight: 'calc(100vh - 80px)',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
            animation: shaking
              ? 'clozr-modal-shake 420ms cubic-bezier(0.36, 0.07, 0.19, 0.97)'
              : 'clozr-modal-pop 220ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {/* Header */}
          <header
            style={{
              padding: `${space[4]} ${space[5]}`,
              borderBottom: title ? `1px solid ${color.border}` : 'none',
              display: 'flex',
              alignItems: 'flex-start',
              gap: space[3],
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {title && (
                <h2
                  style={{
                    margin: 0,
                    fontSize: text.lg,
                    fontWeight: weight.bold,
                    color: color.text,
                    letterSpacing: '-0.3px',
                  }}
                >
                  {title}
                </h2>
              )}
              {subtitle && (
                <div style={{ marginTop: 2, fontSize: text.sm, color: color.textMuted }}>
                  {subtitle}
                </div>
              )}
            </div>
            <button
              onClick={() => attemptClose(true)}
              aria-label="Cerrar"
              style={{
                width: 28,
                height: 28,
                borderRadius: radius.sm,
                color: color.textMuted,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 100ms',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = color.surfaceHover;
                e.currentTarget.style.color = color.text;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = color.textMuted;
              }}
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </header>

          {/* Body */}
          <div style={{ padding: space[5], overflowY: 'auto', flex: 1 }}>{children}</div>

          {/* Footer */}
          {footer && (
            <footer
              style={{
                padding: `${space[3]} ${space[5]}`,
                borderTop: `1px solid ${color.border}`,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: space[2],
                flexShrink: 0,
              }}
            >
              {footer}
            </footer>
          )}
        </div>
      </div>

      <style>{`
        @keyframes clozr-modal-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes clozr-modal-pop {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes clozr-modal-shake {
          10%, 90% { transform: translateX(-2px); }
          20%, 80% { transform: translateX(4px); }
          30%, 50%, 70% { transform: translateX(-8px); }
          40%, 60% { transform: translateX(8px); }
        }
      `}</style>
    </>
  );
}

/* ============================================================
 *  ModalField — campo con label que vamos a usar en NewSale, NewMovement
 * ============================================================ */

interface ModalFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}

export function ModalField({ label, required, hint, children }: ModalFieldProps) {
  return (
    <div style={{ marginBottom: space[4] }}>
      <label
        style={{
          display: 'block',
          fontSize: text.xs,
          fontWeight: weight.semibold,
          color: color.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          marginBottom: 6,
        }}
      >
        {label}
        {required && <span style={{ color: color.danger, marginLeft: 4 }}>*</span>}
      </label>
      {children}
      {hint && (
        <div style={{ marginTop: 4, fontSize: text.xs, color: color.textDim }}>{hint}</div>
      )}
    </div>
  );
}
