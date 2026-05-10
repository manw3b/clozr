import { ReactNode, useState } from 'react';
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
  const [hover, setHover] = useState(false);

  const baseColor =
    action.tone === 'success'
      ? color.success
      : action.tone === 'danger'
      ? color.danger
      : color.textMuted;

  const hoverBg =
    action.tone === 'success'
      ? color.successBg
      : action.tone === 'danger'
      ? color.dangerBg
      : color.surfaceHover;

  const hoverColor =
    action.tone === 'success'
      ? color.success
      : action.tone === 'danger'
      ? color.danger
      : color.text;

  return (
    <button
      aria-label={action.label}
      title={action.label}
      onClick={(e) => {
        e.stopPropagation();
        action.onClick(e);
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 30,
        height: 30,
        borderRadius: radius.md,
        background: hover ? hoverBg : 'transparent',
        color: hover ? hoverColor : baseColor,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 100ms',
      }}
    >
      {action.icon}
    </button>
  );
}
