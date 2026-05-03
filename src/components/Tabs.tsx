import { CSSProperties, ReactNode, useState } from 'react';
import { color, duration, ease, space, text, weight } from '../tokens';

export interface TabItem {
  value: string;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  /**
   * underline = navegación principal de pantalla (Clientes, Ventas, Tareas).
   * pills = filtros secundarios (Todos / Con stock / Sin stock).
   */
  variant?: 'underline' | 'pills';
  size?: 'sm' | 'md';
}

export function Tabs({
  items,
  value,
  onChange,
  variant = 'underline',
  size = 'md',
}: TabsProps) {
  if (variant === 'pills') return <PillTabs items={items} value={value} onChange={onChange} size={size} />;
  return <UnderlineTabs items={items} value={value} onChange={onChange} size={size} />;
}

/* ===== UNDERLINE — para navegación principal de pantalla ===== */
function UnderlineTabs({
  items,
  value,
  onChange,
  size,
}: Required<Pick<TabsProps, 'items' | 'value' | 'onChange' | 'size'>>) {
  const [hover, setHover] = useState<string | null>(null);
  const fontSize = size === 'sm' ? text.sm : text.base;
  const padY = size === 'sm' ? space[2] : space[3];

  return (
    <div
      style={{
        display: 'flex',
        gap: space[6],
        borderBottom: `1px solid ${color.border}`,
      }}
    >
      {items.map((item) => {
        const active = item.value === value;
        const isHover = hover === item.value && !active;
        return (
          <button
            key={item.value}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            onMouseEnter={() => setHover(item.value)}
            onMouseLeave={() => setHover(null)}
            style={{
              padding: `${padY} 0`,
              fontSize,
              fontWeight: active ? weight.semibold : weight.medium,
              color: active ? color.primary : isHover ? color.text : color.textMuted,
              borderBottom: `2px solid ${active ? color.primary : 'transparent'}`,
              marginBottom: -1,
              transition: `color ${duration.fast} ${ease}, border-color ${duration.fast} ${ease}`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: space[2],
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              opacity: item.disabled ? 0.4 : 1,
            }}
          >
            {item.label}
            {typeof item.count === 'number' && (
              <span
                style={{
                  fontSize: text.xs,
                  fontWeight: weight.semibold,
                  background: active ? color.primaryBgStrong : color.surface2,
                  color: active ? color.primary : color.textMuted,
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-full)',
                  minWidth: 18,
                  textAlign: 'center',
                }}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ===== PILLS — para filtros secundarios ===== */
function PillTabs({
  items,
  value,
  onChange,
  size,
}: Required<Pick<TabsProps, 'items' | 'value' | 'onChange' | 'size'>>) {
  const [hover, setHover] = useState<string | null>(null);
  const fontSize = size === 'sm' ? text.sm : text.base;
  const height = size === 'sm' ? 28 : 32;

  return (
    <div
      style={{
        display: 'inline-flex',
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: 'var(--radius-md)',
        padding: 3,
        gap: 2,
      }}
    >
      {items.map((item) => {
        const active = item.value === value;
        const isHover = hover === item.value && !active;
        const buttonStyle: CSSProperties = {
          height,
          padding: `0 ${space[3]}`,
          fontSize,
          fontWeight: active ? weight.semibold : weight.medium,
          color: active ? '#FFFFFF' : isHover ? color.text : color.textMuted,
          background: active ? color.primary : isHover ? color.surfaceHover : 'transparent',
          borderRadius: 'var(--radius-sm)',
          transition: `all ${duration.fast} ${ease}`,
          cursor: item.disabled ? 'not-allowed' : 'pointer',
          opacity: item.disabled ? 0.4 : 1,
        };
        return (
          <button
            key={item.value}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            onMouseEnter={() => setHover(item.value)}
            onMouseLeave={() => setHover(null)}
            style={buttonStyle}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
