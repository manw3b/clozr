import { ReactNode } from 'react';
import { color, space, text, weight } from '../tokens';

interface PageHeaderProps {
  title: string;
  /** Texto secundario debajo del título (ej: "0 resultados", "iPhone Club · sábado 2 de mayo") */
  subtitle?: ReactNode;
  /** Iconito opcional al lado del título */
  icon?: ReactNode;
  /** Acciones a la derecha (botones, etc) */
  actions?: ReactNode;
}

/**
 * Encabezado de pantalla unificado.
 * Reemplaza los 5 estilos distintos que tenés hoy (Mi Día, Caja, Clientes, Pipeline, Inventario).
 */
export function PageHeader({ title, subtitle, icon, actions }: PageHeaderProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: space[4],
        marginBottom: space[6],
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], minWidth: 0 }}>
        {icon && (
          <span
            style={{
              color: color.primary,
              display: 'inline-flex',
              flexShrink: 0,
            }}
          >
            {icon}
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: text['2xl'],
              fontWeight: weight.bold,
              color: color.text,
              letterSpacing: '-0.5px',
              lineHeight: 1.2,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <div
              style={{
                marginTop: 4,
                fontSize: text.sm,
                color: color.textMuted,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </header>
  );
}
