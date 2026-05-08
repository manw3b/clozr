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

const palette = ['#E11D48', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6'];

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
