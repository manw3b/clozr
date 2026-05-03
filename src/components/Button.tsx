import { ButtonHTMLAttributes, forwardRef, ReactNode, useState, CSSProperties } from 'react';
import { color, radius, text, weight, duration, ease, shadow } from '../tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  loading?: boolean;
}

const sizeStyles: Record<ButtonSize, CSSProperties> = {
  sm: { height: 28, padding: '0 10px', fontSize: text.sm, gap: 6 },
  md: { height: 36, padding: '0 14px', fontSize: text.base, gap: 8 },
  lg: { height: 44, padding: '0 18px', fontSize: text.md, gap: 10 },
};

function getVariantStyle(
  variant: ButtonVariant,
  state: 'idle' | 'hover' | 'press',
  disabled: boolean
): CSSProperties {
  if (disabled) {
    return {
      background: variant === 'ghost' ? 'transparent' : color.surface2,
      color: color.textDim,
      cursor: 'not-allowed',
    };
  }
  switch (variant) {
    case 'primary':
      return {
        background:
          state === 'press' ? color.primaryPress : state === 'hover' ? color.primaryHover : color.primary,
        color: '#FFFFFF',
      };
    case 'danger':
      return {
        background: state === 'hover' ? '#DC2626' : 'var(--danger)',
        color: '#FFFFFF',
      };
    case 'secondary':
      return {
        background: state === 'hover' ? color.surfaceHover : color.surface,
        color: color.text,
        border: `1px solid ${state === 'hover' ? 'var(--border-strong)' : color.border}`,
      };
    case 'ghost':
      return {
        background: state === 'hover' ? color.surfaceHover : 'transparent',
        color: color.text,
      };
  }
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    iconLeft,
    iconRight,
    fullWidth,
    loading,
    disabled,
    children,
    style,
    ...rest
  },
  ref
) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const state = press ? 'press' : hover ? 'hover' : 'idle';

  const baseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: weight.semibold,
    borderRadius: radius.md,
    transition: `background ${duration.fast} ${ease}, color ${duration.fast} ${ease}, border-color ${duration.fast} ${ease}, transform ${duration.fast} ${ease}, box-shadow ${duration.fast} ${ease}`,
    whiteSpace: 'nowrap',
    userSelect: 'none',
    width: fullWidth ? '100%' : undefined,
    transform: press && !disabled ? 'translateY(1px)' : 'translateY(0)',
    outline: 'none',
    ...sizeStyles[size],
    ...getVariantStyle(variant, state, !!(disabled || loading)),
    ...style,
  };

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPress(false);
      }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = shadow.focus;
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = '';
      }}
      style={baseStyle}
      {...rest}
    >
      {loading ? (
        <Spinner size={size} />
      ) : (
        <>
          {iconLeft && <span style={{ display: 'inline-flex' }}>{iconLeft}</span>}
          {children}
          {iconRight && <span style={{ display: 'inline-flex' }}>{iconRight}</span>}
        </>
      )}
    </button>
  );
});

function Spinner({ size }: { size: ButtonSize }) {
  const s = size === 'sm' ? 12 : size === 'md' ? 14 : 16;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: 'clozr-spin 0.7s linear infinite' }}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <style>{`@keyframes clozr-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}
