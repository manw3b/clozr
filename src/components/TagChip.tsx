import { color, radius, weight } from '../tokens';
import { colorCss, colorBg } from '../lib/colorPalette';
import type { ClientTag } from '../types/domain';

/**
 * Chip visual de una etiqueta. Color del fondo + texto vienen de la
 * paleta unificada (lib/colorPalette.ts).
 *
 * Uso:
 *   <TagChip tag={t} />              // pill normal
 *   <TagChip tag={t} size="xs" />    // versión chica para listas densas
 */
export function TagChip({
  tag,
  size = 'sm',
  onRemove,
}: {
  tag: ClientTag;
  size?: 'xs' | 'sm';
  onRemove?: () => void;
}) {
  const css = colorCss(tag.color);
  const bg = colorBg(tag.color, 0.15);
  const padY = size === 'xs' ? 1 : 2;
  const padX = size === 'xs' ? 5 : 6;
  const fontSize = size === 'xs' ? 10 : 11;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: `${padY}px ${padX}px`,
        background: bg,
        color: css,
        borderRadius: radius.sm,
        fontSize,
        fontWeight: weight.semibold,
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
      }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Quitar ${tag.name}`}
          className="tag-chip-close"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 12,
            height: 12,
            padding: 0,
            color: css,
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}

// Exportación de un dot solo (sin label) para listas muy compactas.
export function TagDot({ tag, title }: { tag: ClientTag; title?: string }) {
  return (
    <span
      title={title ?? tag.name}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: colorCss(tag.color),
        flexShrink: 0,
      }}
    />
  );
}

// Re-export para que el caller no tenga que doble-importar
export { color };
