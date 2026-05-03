import { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { color, radius, space, text, weight } from '../../../tokens';

interface SectionCardProps {
  title: string;
  /** Cantidad de items (badge en el título) */
  count?: number;
  /** Resaltar el count (ej: cuando hay tareas atrasadas) */
  countTone?: 'neutral' | 'warning' | 'danger' | 'primary';
  /** Texto debajo del título */
  subtitle?: string;
  /** Icono a la izquierda del título */
  icon?: ReactNode;
  /** Color del icono */
  iconTone?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  /** Acción "Ver todos" en la esquina */
  onViewAll?: () => void;
  viewAllLabel?: string;
  children: ReactNode;
}

const iconBgTones = {
  primary: { bg: color.primaryBg, fg: color.primary },
  success: { bg: color.successBg, fg: color.success },
  warning: { bg: color.warningBg, fg: color.warning },
  danger: { bg: color.dangerBg, fg: color.danger },
  info: { bg: color.infoBg, fg: color.info },
};

const countTones = {
  neutral: { bg: color.surface2, fg: color.textMuted },
  warning: { bg: color.warningBg, fg: color.warning },
  danger: { bg: color.dangerBg, fg: color.danger },
  primary: { bg: color.primaryBg, fg: color.primary },
};

/**
 * Bloque/card para cada sección de Mi Día.
 * Header consistente con icon + título + count + viewAll.
 */
export function SectionCard({
  title,
  count,
  countTone = 'neutral',
  subtitle,
  icon,
  iconTone = 'primary',
  onViewAll,
  viewAllLabel = 'Ver todos',
  children,
}: SectionCardProps) {
  const iconStyle = iconBgTones[iconTone];
  const countStyle = countTones[countTone];

  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.xl,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          padding: `${space[4]} ${space[5]}`,
          borderBottom: `1px solid ${color.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space[3],
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], minWidth: 0 }}>
          {icon && (
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: radius.md,
                background: iconStyle.bg,
                color: iconStyle.fg,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {icon}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: text.md,
                  fontWeight: weight.semibold,
                  color: color.text,
                }}
              >
                {title}
              </h2>
              {typeof count === 'number' && (
                <span
                  style={{
                    fontSize: text.xs,
                    fontWeight: weight.bold,
                    background: countStyle.bg,
                    color: countStyle.fg,
                    padding: '2px 8px',
                    borderRadius: radius.full,
                    minWidth: 20,
                    textAlign: 'center',
                  }}
                >
                  {count}
                </span>
              )}
            </div>
            {subtitle && (
              <div
                style={{
                  marginTop: 2,
                  fontSize: text.xs,
                  color: color.textMuted,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
        </div>

        {onViewAll && (
          <button
            onClick={onViewAll}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: space[1],
              padding: `${space[1]} ${space[2]}`,
              fontSize: text.sm,
              color: color.textMuted,
              fontWeight: weight.medium,
              borderRadius: radius.md,
              transition: 'color 100ms, background 100ms',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = color.text;
              e.currentTarget.style.background = color.surfaceHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = color.textMuted;
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {viewAllLabel}
            <ArrowRight size={13} strokeWidth={2.2} />
          </button>
        )}
      </header>

      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

/* ============================================================
 *  Row — fila reutilizable dentro de SectionCard
 * ============================================================ */

interface SectionRowProps {
  children: ReactNode;
  onClick?: () => void;
  /** Última fila no necesita borde inferior */
  isLast?: boolean;
}

export function SectionRow({ children, onClick, isLast }: SectionRowProps) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: `${space[3]} ${space[5]}`,
        borderBottom: isLast ? 'none' : `1px solid ${color.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: space[3],
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 100ms',
      }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.background = color.surfaceHover;
      }}
      onMouseLeave={(e) => {
        if (onClick) e.currentTarget.style.background = 'transparent';
      }}
    >
      {children}
    </div>
  );
}
