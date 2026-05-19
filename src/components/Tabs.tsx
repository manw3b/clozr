import { ReactNode } from 'react';
import { color, space, text, weight } from '../tokens';

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

/* ===== UNDERLINE — para navegación principal de pantalla =====
 * Estilos de hover/active en globals.css (.tab-underline / .tab-underline.active).
 */
function UnderlineTabs({
  items,
  value,
  onChange,
  size,
}: Required<Pick<TabsProps, 'items' | 'value' | 'onChange' | 'size'>>) {
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
        return (
          <button
            key={item.value}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={`tab-underline${active ? ' active' : ''}`}
            style={{
              padding: `${padY} 0`,
              fontSize,
              fontWeight: active ? weight.semibold : weight.medium,
              marginBottom: -1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: space[2],
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

/* ===== PILLS — para filtros secundarios =====
 * Estilos de hover/active en globals.css (.tab-pill / .tab-pill.active).
 */
function PillTabs({
  items,
  value,
  onChange,
  size,
}: Required<Pick<TabsProps, 'items' | 'value' | 'onChange' | 'size'>>) {
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
        return (
          <button
            key={item.value}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={`tab-pill${active ? ' active' : ''}`}
            style={{
              height,
              padding: `0 ${space[3]}`,
              fontSize,
              fontWeight: active ? weight.semibold : weight.medium,
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
