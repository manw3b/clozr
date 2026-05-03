import { ReactNode } from 'react';
import { Button, ButtonVariant } from './Button';
import { color, space, text, weight } from '../tokens';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Acción principal (CTA) */
  action?: {
    label: string;
    onClick: () => void;
    variant?: ButtonVariant;
    iconLeft?: ReactNode;
  };
  /** Acción secundaria (opcional) */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Tamaño del bloque. compact = inline en cards, full = pantalla completa */
  size?: 'compact' | 'full';
}

/**
 * Empty states accionables.
 *
 * Antes (mal): "Sin clientes aún" — punto.
 * Ahora (bien): icono + título + descripción de qué se puede hacer + CTA claro.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  size = 'full',
}: EmptyStateProps) {
  const isFull = size === 'full';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: isFull ? `${space[16]} ${space[6]}` : `${space[10]} ${space[6]}`,
        gap: space[4],
      }}
    >
      {icon && (
        <div
          style={{
            width: isFull ? 56 : 44,
            height: isFull ? 56 : 44,
            borderRadius: 'var(--radius-xl)',
            background: color.surface2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: color.textMuted,
            marginBottom: space[1],
          }}
        >
          {icon}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: space[1], maxWidth: 360 }}>
        <h3
          style={{
            margin: 0,
            fontSize: isFull ? text.lg : text.md,
            fontWeight: weight.semibold,
            color: color.text,
          }}
        >
          {title}
        </h3>
        {description && (
          <p
            style={{
              margin: 0,
              fontSize: text.sm,
              color: color.textMuted,
              lineHeight: 1.5,
            }}
          >
            {description}
          </p>
        )}
      </div>

      {(action || secondaryAction) && (
        <div style={{ display: 'flex', gap: space[2], marginTop: space[2] }}>
          {action && (
            <Button
              variant={action.variant || 'primary'}
              size={isFull ? 'md' : 'sm'}
              iconLeft={action.iconLeft}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="ghost" size={isFull ? 'md' : 'sm'} onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
