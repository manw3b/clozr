import { forwardRef, type ReactNode } from 'react';
import { WhatsAppIcon } from '../icons/WhatsAppIcon';
import { color, radius, space, text, weight, duration, ease } from '../../tokens';

/**
 * Sub-componentes compartidos entre WaQuickPicker (pipeline) y
 * CustomerWaQuickPicker (clientes). Antes vivían duplicados ~250 líneas
 * en cada archivo.
 *
 * Cuatro piezas:
 *   - <SmallTrigger>     botón chip 26×26 verde (filas de tabla / cards)
 *   - <FullTrigger>      botón full-width con label (drawers, footers)
 *   - <PickerHeader>     avatar + "Mensaje a {firstName}" en el tope del popover
 *   - <PickerRow>        un option row con ícono + título + preview
 *
 * Pequeño helper exportado: firstName() — extrae la primera palabra de un
 * nombre completo para usar en los headers.
 */

interface SmallTriggerProps {
  children: ReactNode;
  ariaLabel: string;
  active?: boolean;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
}
export const SmallTrigger = forwardRef<HTMLButtonElement, SmallTriggerProps>(
  function SmallTrigger({ children, ariaLabel, active, onClick, disabled }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={ariaLabel}
        onClick={onClick}
        disabled={disabled}
        style={{
          width: 26,
          height: 26,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.sm,
          color: color.success,
          background: active ? color.successBg : 'transparent',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: `background ${duration.fast} ${ease}`,
          opacity: disabled ? 0.4 : 1,
        }}
        onMouseEnter={(e) => {
          if (!disabled && !active) e.currentTarget.style.background = color.successBg;
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.background = 'transparent';
        }}
      >
        {children}
      </button>
    );
  },
);

interface FullTriggerProps {
  children: ReactNode;
  active?: boolean;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
}
export const FullTrigger = forwardRef<HTMLButtonElement, FullTriggerProps>(
  function FullTrigger({ children, active, onClick, disabled }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={disabled}
        style={{
          height: 36,
          padding: `0 ${space[3]}`,
          display: 'inline-flex',
          alignItems: 'center',
          gap: space[2],
          borderRadius: radius.md,
          background: active ? color.surfaceHover : color.surface2,
          border: `1px solid ${active ? color.borderStrong : color.border}`,
          color: color.text,
          fontSize: text.sm,
          fontWeight: weight.semibold,
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: `background ${duration.fast} ${ease}, border-color ${duration.fast} ${ease}`,
          opacity: disabled ? 0.4 : 1,
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.background = color.surfaceHover;
            e.currentTarget.style.borderColor = color.borderStrong;
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.background = color.surface2;
            e.currentTarget.style.borderColor = color.border;
          }
        }}
      >
        {children}
      </button>
    );
  },
);

/** Header del popover — avatar WhatsApp + "Mensaje a {nombre}" + subtítulo. */
export function PickerHeader({
  clientName,
  subtitle = 'Elegí qué mandar',
}: {
  clientName: string;
  subtitle?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[2],
        padding: `8px ${space[3]} 10px`,
        borderBottom: `1px solid ${color.border}`,
        marginBottom: 4,
      }}
    >
      <WhatsAppIcon size={16} color="var(--success)" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: text.sm,
            fontWeight: weight.semibold,
            color: color.text,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          Mensaje a {firstName(clientName)}
        </div>
        <div style={{ fontSize: text.xs, color: color.textDim, marginTop: 1 }}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}

/** Una opción del popover — ícono + título + preview en 2 líneas. */
export function PickerRow({
  icon,
  title,
  preview,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  preview: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: space[2],
        padding: `8px ${space[3]}`,
        background: 'transparent',
        textAlign: 'left',
        borderRadius: radius.sm,
        cursor: 'pointer',
        transition: `background ${duration.fast} ${ease}`,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = color.surfaceHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        style={{
          marginTop: 2,
          flexShrink: 0,
          width: 18,
          display: 'inline-flex',
          justifyContent: 'center',
        }}
      >
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: text.sm,
            fontWeight: weight.semibold,
            color: color.text,
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: text.xs,
            color: color.textMuted,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.4,
          }}
        >
          {preview}
        </div>
      </div>
    </button>
  );
}

/** Label de sección dentro del popover (ej: "Plantillas" antes de la lista). */
export function PickerSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: weight.semibold,
        color: color.textDim,
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
        padding: `${space[3]} ${space[3]} 4px`,
      }}
    >
      {children}
    </div>
  );
}

/** Primera palabra de un nombre completo. "Carlos García" → "Carlos". */
export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? '';
}
