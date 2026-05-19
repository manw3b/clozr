import { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { color, radius, space, text, weight } from '../tokens';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: keyof typeof space | 0;
  interactive?: boolean;
}

/** Contenedor base de superficie. Úsalo cuando necesites un bloque visual con borde/fondo. */
export function Card({
  padding = 6,
  interactive,
  style,
  children,
  ...rest
}: CardProps) {
  const baseStyle: CSSProperties = {
    background: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: radius.lg,
    padding: padding === 0 ? 0 : space[padding as keyof typeof space],
    transition: 'border-color 150ms, background 150ms, transform 150ms',
    cursor: interactive ? 'pointer' : 'default',
    ...style,
  };

  return (
    <div
      style={baseStyle}
      className={interactive ? 'card-hoverable' : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ============================================================
 *  MetricCard — UN solo componente para todas las métricas.
 *  Reemplaza las 4 variantes inconsistentes que tenés hoy.
 * ============================================================ */

export type MetricTone = 'neutral' | 'success' | 'warning' | 'danger' | 'primary';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  /** Sufijo pequeño junto al valor (ej: "ventas", "ARS") */
  unit?: string;
  /** Variación porcentual o delta (ej: "+12%", "-3"). Color automático según signo si es número. */
  delta?: { value: string; tone: 'success' | 'danger' | 'neutral' };
  /** Tono del valor. Por default neutral (blanco). Usá colores con MUCHA moderación. */
  tone?: MetricTone;
  icon?: ReactNode;
  onClick?: () => void;
}

const toneColor: Record<MetricTone, string> = {
  neutral: color.text,
  success: color.success,
  warning: color.warning,
  danger: color.danger,
  primary: color.primary,
};

export function MetricCard({
  label,
  value,
  unit,
  delta,
  tone = 'neutral',
  icon,
  onClick,
}: MetricCardProps) {
  return (
    <Card padding={5} interactive={!!onClick} onClick={onClick}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: space[2],
        }}
      >
        <span
          style={{
            fontSize: text.sm,
            color: color.textMuted,
            fontWeight: weight.medium,
          }}
        >
          {label}
        </span>
        {icon && <span style={{ color: color.textDim, display: 'inline-flex' }}>{icon}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2] }}>
        <span
          style={{
            fontSize: text['2xl'],
            fontWeight: weight.bold,
            color: toneColor[tone],
            letterSpacing: '-0.5px',
            lineHeight: 1.1,
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: text.sm, color: color.textMuted, fontWeight: weight.medium }}>
            {unit}
          </span>
        )}
      </div>

      {delta && (
        <div
          style={{
            marginTop: space[2],
            fontSize: text.xs,
            fontWeight: weight.semibold,
            color:
              delta.tone === 'success'
                ? color.success
                : delta.tone === 'danger'
                ? color.danger
                : color.textMuted,
          }}
        >
          {delta.value}
        </div>
      )}
    </Card>
  );
}
