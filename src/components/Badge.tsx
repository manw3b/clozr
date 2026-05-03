import { CSSProperties, ReactNode } from 'react';
import { color, radius, text, weight } from '../tokens';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeVariant = 'soft' | 'solid' | 'outline';

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
}

const tonePalette: Record<BadgeTone, { fg: string; bg: string; border: string }> = {
  neutral: { fg: color.textMuted, bg: color.surface2, border: color.border },
  primary: { fg: color.primary, bg: color.primaryBg, border: color.primary },
  success: { fg: color.success, bg: color.successBg, border: color.success },
  warning: { fg: color.warning, bg: color.warningBg, border: color.warning },
  danger: { fg: color.danger, bg: color.dangerBg, border: color.danger },
  info: { fg: color.info, bg: color.infoBg, border: color.info },
};

export function Badge({
  children,
  tone = 'neutral',
  variant = 'soft',
  size = 'md',
  dot,
}: BadgeProps) {
  const palette = tonePalette[tone];
  const isSolid = variant === 'solid';
  const isOutline = variant === 'outline';

  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: size === 'sm' ? '1px 7px' : '3px 9px',
    fontSize: size === 'sm' ? text.xs : text.sm,
    fontWeight: weight.semibold,
    borderRadius: radius.full,
    background: isSolid ? palette.fg : isOutline ? 'transparent' : palette.bg,
    color: isSolid ? '#FFFFFF' : palette.fg,
    border: isOutline ? `1px solid ${palette.fg}` : '1px solid transparent',
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
  };

  return (
    <span style={style}>
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isSolid ? '#FFFFFF' : palette.fg,
            display: 'inline-block',
          }}
        />
      )}
      {children}
    </span>
  );
}
