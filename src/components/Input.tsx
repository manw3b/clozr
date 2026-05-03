import {
  CSSProperties,
  forwardRef,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  useState,
} from 'react';
import { color, radius, space, text, weight } from '../tokens';

/* ============================================================
 *  INPUT
 * ============================================================ */

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const inputHeight = { sm: 30, md: 36, lg: 44 };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, iconLeft, iconRight, size = 'md', style, disabled, ...rest },
  ref
) {
  const [focused, setFocused] = useState(false);

  const wrapperStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: space[2],
    height: inputHeight[size],
    padding: `0 ${space[3]}`,
    background: disabled ? color.bg : color.surface2,
    border: `1px solid ${
      error ? color.danger : focused ? color.primary : color.border
    }`,
    borderRadius: radius.md,
    boxShadow: focused ? 'var(--shadow-focus)' : 'none',
    transition: 'border-color 100ms, box-shadow 100ms, background 100ms',
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'text',
  };

  return (
    <Field label={label} hint={hint} error={error}>
      <div style={wrapperStyle}>
        {iconLeft && (
          <span style={{ display: 'inline-flex', color: color.textDim, flexShrink: 0 }}>{iconLeft}</span>
        )}
        <input
          ref={ref}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: color.text,
            fontSize: text.base,
            minWidth: 0,
            ...style,
          }}
          {...rest}
        />
        {iconRight && (
          <span style={{ display: 'inline-flex', color: color.textDim, flexShrink: 0 }}>{iconRight}</span>
        )}
      </div>
    </Field>
  );
});

/* ============================================================
 *  TEXTAREA
 * ============================================================ */

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, style, disabled, ...rest },
  ref
) {
  const [focused, setFocused] = useState(false);
  return (
    <Field label={label} hint={hint} error={error}>
      <textarea
        ref={ref}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          minHeight: 80,
          padding: `${space[2]} ${space[3]}`,
          background: disabled ? color.bg : color.surface2,
          color: color.text,
          fontSize: text.base,
          border: `1px solid ${error ? color.danger : focused ? color.primary : color.border}`,
          borderRadius: radius.md,
          outline: 'none',
          boxShadow: focused ? 'var(--shadow-focus)' : 'none',
          transition: 'border-color 100ms, box-shadow 100ms',
          resize: 'vertical',
          fontFamily: 'inherit',
          ...style,
        }}
        {...rest}
      />
    </Field>
  );
});

/* ============================================================
 *  SELECT
 * ============================================================ */

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, size = 'md', children, style, disabled, ...rest },
  ref
) {
  const [focused, setFocused] = useState(false);
  return (
    <Field label={label} hint={hint} error={error}>
      <select
        ref={ref}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          height: inputHeight[size],
          width: '100%',
          padding: `0 ${space[3]}`,
          background: color.surface2,
          color: color.text,
          fontSize: text.base,
          border: `1px solid ${error ? color.danger : focused ? color.primary : color.border}`,
          borderRadius: radius.md,
          outline: 'none',
          boxShadow: focused ? 'var(--shadow-focus)' : 'none',
          appearance: 'none',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: `right ${space[3]} center`,
          paddingRight: 32,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'border-color 100ms, box-shadow 100ms',
          ...style,
        }}
        {...rest}
      >
        {children}
      </select>
    </Field>
  );
});

/* ============================================================
 *  Helper para label / hint / error
 * ============================================================ */

function Field({
  label,
  hint,
  error,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  if (!label && !hint && !error) return <>{children}</>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label
          style={{
            fontSize: text.sm,
            fontWeight: weight.medium,
            color: color.textMuted,
          }}
        >
          {label}
        </label>
      )}
      {children}
      {(hint || error) && (
        <span
          style={{
            fontSize: text.xs,
            color: error ? color.danger : color.textDim,
          }}
        >
          {error || hint}
        </span>
      )}
    </div>
  );
}
