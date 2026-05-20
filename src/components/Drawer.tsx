import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { color, layout, radius, space, text, weight } from '../tokens';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Header completo custom (si se pasa, ignora title/subtitle) */
  header?: ReactNode;
  title?: string;
  subtitle?: string;
  /** Acciones del header (a la derecha del título) */
  headerActions?: ReactNode;
  /** Footer pegado abajo (acciones primarias) */
  footer?: ReactNode;
  children: ReactNode;
  /** Ancho custom — default usa la variable --drawer-w */
  width?: string;
}

/**
 * Right Drawer.
 *
 * Patrón:
 *   <AppShell drawer={selectedClient && <ClientDrawer ... />}>
 *
 * O usado standalone con overlay:
 *   <Drawer open={open} onClose={...}>...</Drawer>
 *
 * En este sprint lo usamos integrado al shell (sin overlay) — el AppShell ya
 * tiene un slot para el drawer al lado del main.
 *
 * Esta versión es la "standalone con overlay" para casos donde necesites
 * abrirlo sobre cualquier pantalla sin pasar por el shell.
 */
export function Drawer({
  open,
  onClose,
  header,
  title,
  subtitle,
  headerActions,
  footer,
  children,
  width = layout.drawerW,
}: DrawerProps) {
  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(2px)',
          zIndex: 30,
          animation: 'clozr-drawer-fade 200ms ease-out',
        }}
      />

      {/* Panel */}
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width,
          maxWidth: '100vw',
          background: color.surface,
          borderLeft: `1px solid ${color.border}`,
          zIndex: 31,
          display: 'flex',
          flexDirection: 'column',
          animation: 'clozr-drawer-slide 250ms cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '-12px 0 32px rgba(0, 0, 0, 0.5)',
        }}
      >
        <DrawerInner
          onClose={onClose}
          header={header}
          title={title}
          subtitle={subtitle}
          headerActions={headerActions}
          footer={footer}
        >
          {children}
        </DrawerInner>
      </aside>

      <style>{`
        @keyframes clozr-drawer-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes clozr-drawer-slide {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}

/* ============================================================
 *  DrawerPanel — versión "embedded" sin overlay para usar dentro
 *  del AppShell (cuando el slot drawer del shell está activo).
 * ============================================================ */

interface DrawerPanelProps extends Omit<DrawerProps, 'open' | 'width'> {}

export function DrawerPanel({
  onClose,
  header,
  title,
  subtitle,
  headerActions,
  footer,
  children,
}: DrawerPanelProps) {
  return (
    <DrawerInner
      onClose={onClose}
      header={header}
      title={title}
      subtitle={subtitle}
      headerActions={headerActions}
      footer={footer}
    >
      {children}
    </DrawerInner>
  );
}

function DrawerInner({
  onClose,
  header,
  title,
  subtitle,
  headerActions,
  footer,
  children,
}: Omit<DrawerProps, 'open' | 'width'>) {
  return (
    <>
      {/* Header */}
      {header || (
        <header
          style={{
            padding: `${space[4]} ${space[5]}`,
            borderBottom: `1px solid ${color.border}`,
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
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <div
                style={{
                  marginTop: 2,
                  fontSize: text.sm,
                  color: color.textMuted,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          {headerActions}
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="modal-close"
            style={{
              width: 28,
              height: 28,
              borderRadius: radius.sm,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </header>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>{children}</div>

      {/* Footer */}
      {footer && (
        <footer
          style={{
            padding: `${space[3]} ${space[5]}`,
            borderTop: `1px solid ${color.border}`,
            background: color.surface,
            flexShrink: 0,
          }}
        >
          {footer}
        </footer>
      )}
    </>
  );
}
