import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { color, space, text, weight } from '../tokens';

/**
 * ConfirmDeleteModal — confirmación estricta tipo GitHub para acciones
 * destructivas serias (borrar cliente, borrar workspace, etc).
 *
 * Por qué no usar window.confirm:
 *  - Es un dialog del sistema: rompe la UX y no se ve "Clozr".
 *  - Requiere un solo click ("Aceptar"). En clicks por error o muscle-memory
 *    se pierden datos irreversibles. Una cartera de clientes vale plata.
 *
 * Pattern: el usuario tiene que TIPEAR el `confirmText` exacto para
 * habilitar el botón de confirmar. Hace que sea imposible borrar por error.
 *
 * Para deletes single recomendado pasar el nombre del recurso (ej:
 * "Carlos García"). Para bulk usar "ELIMINAR 5 CLIENTES" o similar.
 */

interface ConfirmDeleteModalProps {
  open: boolean;
  onClose: () => void;
  /** Callback async — el modal muestra loading hasta que resuelva. */
  onConfirm: () => Promise<void> | void;
  title: string;
  /** Descripción de qué se va a borrar y por qué duele. Mostrá impacto real. */
  description: React.ReactNode;
  /** Texto que el usuario debe tipear EXACTO para habilitar el confirm. */
  confirmText: string;
  /** Label del botón principal cuando ya está habilitado. */
  confirmLabel?: string;
  /** Hint sobre lo que el usuario tiene que tipear. Default: "Escribí ...". */
  inputHint?: string;
}

export function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  confirmLabel = 'Eliminar',
  inputHint,
}: ConfirmDeleteModalProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const matches = input.trim() === confirmText.trim();

  // Reset al cerrar para que la próxima apertura empiece limpia.
  useEffect(() => {
    if (!open) {
      setInput('');
      setLoading(false);
    }
  }, [open]);

  async function handleConfirm() {
    if (!matches || loading) return;
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // El caller maneja los errores con toast. Acá solo dejamos de loading
      // para que el user pueda reintentar o cancelar.
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[2] }}>
          <AlertTriangle size={18} color={color.danger} strokeWidth={2.4} />
          {title}
        </span>
      }
      maxWidth={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={!matches || loading}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ fontSize: text.sm, color: color.textMuted, lineHeight: 1.5, marginBottom: space[4] }}>
        {description}
      </div>

      <div
        style={{
          padding: space[3],
          background: 'var(--danger-bg)',
          border: `1px solid var(--danger)`,
          borderRadius: 8,
          marginBottom: space[3],
          fontSize: text.xs,
          color: color.textMuted,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: color.danger, fontWeight: weight.semibold }}>
          Esta acción no se puede deshacer.
        </strong>{' '}
        Datos asociados (ventas, contactos, etiquetas, deudas) quedan huérfanos
        pero NO se borran — preservás historial. Si después querés recuperar
        al cliente, lo creás de nuevo y revinculás manualmente.
      </div>

      <label
        style={{
          display: 'block',
          fontSize: text.xs,
          fontWeight: weight.semibold,
          color: color.textDim,
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          marginBottom: space[2],
        }}
      >
        {inputHint ?? (
          <>
            Escribí{' '}
            <span style={{ fontFamily: 'monospace', color: color.text }}>{confirmText}</span>{' '}
            para confirmar
          </>
        )}
      </label>
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={confirmText}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches && !loading) {
            e.preventDefault();
            handleConfirm();
          }
        }}
      />
    </Modal>
  );
}
