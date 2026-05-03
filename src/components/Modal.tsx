import { ReactNode, useEffect } from 'react';
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
}: ModalProps) {
  const visible = open ?? isOpen ?? false;
  useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <>
      <div
        onClick={onClose}
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
            animation: 'clozr-modal-pop 220ms cubic-bezier(0.4, 0, 0.2, 1)',
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
              onClick={onClose}
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
