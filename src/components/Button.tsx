import { ButtonHTMLAttributes, forwardRef, ReactNode, CSSProperties } from 'react';
import { text } from '../tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  loading?: boolean;
}

/**
 * Botón base. Variantes (primary/secondary/ghost/danger/success) y estados
 * (hover/active/focus/disabled) se manejan 100% en CSS — ver `.btn.<variant>`
 * en globals.css. Antes esto vivía como useState(hover) + useState(press) +
 * onFocus/onBlur con box-shadow inline.
 */

const sizeStyles: Record<ButtonSize, CSSProperties> = {
  sm: { height: 28, padding: '0 10px', fontSize: text.sm, gap: 6 },
  md: { height: 36, padding: '0 14px', fontSize: text.base, gap: 8 },
  lg: { height: 44, padding: '0 18px', fontSize: text.md, gap: 10 },
};

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
    className,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`btn ${variant}${className ? ` ${className}` : ''}`}
      style={{
        width: fullWidth ? '100%' : undefined,
        ...sizeStyles[size],
        ...style,
      }}
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
