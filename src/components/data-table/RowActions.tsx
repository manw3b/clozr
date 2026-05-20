import { ReactNode } from 'react';
import { color, radius } from '../../tokens';

interface RowAction {
  icon: ReactNode;
  label: string;
  /** El event se pasa para callers que quieren posicionar un popover/ContextMenu
   *  en el botón mismo (ej: el ⋯ que abre acciones contextuales). */
  onClick: (e?: React.MouseEvent) => void;
  /** Verde si es WhatsApp, rojo si es destructivo */
  tone?: 'success' | 'danger' | 'neutral';
}

interface RowActionsProps {
  actions: RowAction[];
  /** Si true, los botones siempre son visibles (no solo en hover) */
  alwaysVisible?: boolean;
}

/**
 * Grupo de botones de acción rápida para el final de una fila.
 * Patrón: WhatsApp + Llamar + ... (más opciones).
 */
export function RowActions({ actions, alwaysVisible }: RowActionsProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        opacity: alwaysVisible ? 1 : 0.7,
      }}
      // Para mostrar botones solo en hover de la row, el componente padre maneja la opacidad.
    >
      {actions.map((a, i) => (
        <ActionButton key={i} action={a} />
      ))}
    </div>
  );
}

function ActionButton({ action }: { action: RowAction }) {
  // Color base por tone (success=verde, danger=rojo, neutral=muted). El hover
  // (cambio de bg + color) lo maneja .btn-icon en globals.css con la variante
  // que corresponde.
  const baseColor =
    action.tone === 'success'
      ? color.success
      : action.tone === 'danger'
      ? color.danger
      : color.textMuted;

  const variantClass =
    action.tone === 'success'
      ? 'wa'
      : action.tone === 'danger'
      ? 'danger'
      : 'muted';

  return (
    <button
      aria-label={action.label}
      title={action.label}
      onClick={(e) => {
        e.stopPropagation();
        action.onClick(e);
      }}
      className={`btn-icon ${variantClass}`}
      style={{
        width: 30,
        height: 30,
        borderRadius: radius.md,
        color: baseColor,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {action.icon}
    </button>
  );
}
