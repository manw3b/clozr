import { CSSProperties } from 'react';
import { weight } from '../tokens';

interface AvatarProps {
  name: string;
  size?: number;
  /** Color de fondo. Si no se especifica, se genera deterministicamente del nombre. */
  bg?: string;
  /** URL de imagen opcional */
  src?: string;
}

// Paleta ampliada (12 colores) y bien diferenciados — antes eran 7 y se
// repetían los azules con frecuencia. Ahora dos clientes distintos casi
// siempre obtienen colores claramente distintos.
const palette = [
  '#E11D48', // rose
  '#F43F5E', // pink
  '#F97316', // orange
  '#EAB308', // yellow
  '#10B981', // emerald
  '#14B8A6', // teal
  '#06B6D4', // cyan
  '#3B82F6', // blue
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#A855F7', // purple
  '#D946EF', // fuchsia
];

function hashColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length] ?? palette[0]!;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? '';
  if (parts.length === 1) return first.slice(0, 1).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}

export function Avatar({ name, size = 32, bg, src }: AvatarProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: bg || hashColor(name),
    color: '#FFFFFF',
    fontSize: Math.max(10, size * 0.4),
    fontWeight: weight.semibold,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    userSelect: 'none',
  };

  if (src) {
    return (
      <div style={style}>
        <img
          src={src}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }

  return <div style={style}>{initials(name)}</div>;
}
