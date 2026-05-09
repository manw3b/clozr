import { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, GripVertical } from 'lucide-react';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney } from '../../../lib/format';
import { colorCss, colorBg } from '../../../lib/colorPalette';
import type { StageConfig } from '../../../types/domain';

interface PipelineColumnProps {
  stage: StageConfig;
  count: number;
  totalAmount: number;
  /** El drop pasaría a una etapa terminal (cerrado/perdido) */
  isTerminal?: boolean;
  onAddLead?: () => void;
  /** Ancho de la columna en px. Si se pasa, override el default. */
  width?: number;
  /** Llamado cuando el usuario suelta el resize handle con el ancho final
   *  (ya dentro de los límites). Persistir en localStorage. */
  onResize?: (newWidth: number) => void;
  children: ReactNode;
}

const COL_MIN_WIDTH = 240;
const COL_MAX_WIDTH = 520;
const COL_DEFAULT_WIDTH = 300;
export const COLUMN_DEFAULT_WIDTH = COL_DEFAULT_WIDTH;
export const COLUMN_MIN_WIDTH = COL_MIN_WIDTH;
export const COLUMN_MAX_WIDTH = COL_MAX_WIDTH;

/**
 * Columna del kanban.
 *
 * - Header sticky con label, count y total monetario
 * - Body scroll vertical cuando tiene muchas cards
 * - Drop zone visual cuando el usuario arrastra una card encima
 */
export function PipelineColumn({
  stage,
  count,
  totalAmount,
  isTerminal,
  onAddLead,
  width = COL_DEFAULT_WIDTH,
  onResize,
  children,
}: PipelineColumnProps) {
  const accentBar = colorCss(stage.color);
  const accentBg = colorBg(stage.color, 0.08);

  // Sortable de la columna entera. id = "col:<stage.id>" para que el
  // dispatcher de Pipeline.handleDragEnd diferencie sin colisionar con los
  // ids de leads. data.type = 'column' identifica el drag para los handlers.
  // useSortable ya internamente provee setNodeRef + droppable, así que
  // usamos este mismo nodo como drop target de cards también — el hook
  // useDroppable que tenía antes era redundante.
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: `col:${stage.id}`,
    data: { type: 'column', stageId: stage.id },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: isOver && !isDragging ? accentBg : color.surface2,
        border: `1px solid ${isOver && !isDragging ? accentBar : color.border}`,
        borderTop: `3px solid ${accentBar}`,
        borderRadius: radius.lg,
        width,
        minWidth: COL_MIN_WIDTH,
        maxWidth: COL_MAX_WIDTH,
        flex: `0 0 ${width}px`,
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        transform: CSS.Transform.toString(transform),
        transition: transition ?? 'border-color 150ms, background 150ms',
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      {/* Header — todo en una línea cuando hay espacio */}
      <header
        style={{
          padding: `10px ${space[3]}`,
          borderBottom: `1px solid ${color.border}`,
          flexShrink: 0,
          background: color.surface2,
          display: 'flex',
          alignItems: 'center',
          gap: space[2],
        }}
      >
        {/* Drag handle — sólo este ícono activa el drag de la columna entera.
            Si los listeners se aplican al header completo, el usuario no
            puede hacer click en "+" o tocar el área sin que se inicie un
            drag fantasma. */}
        <button
          {...attributes}
          {...listeners}
          aria-label={`Reordenar etapa ${stage.label}`}
          title="Arrastrar para reordenar"
          style={{
            width: 18,
            height: 22,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            color: color.textDim,
            cursor: 'grab',
            touchAction: 'none',
            flexShrink: 0,
            marginLeft: -4,
          }}
        >
          <GripVertical size={13} />
        </button>
        {/* Color dot — refuerza el stripe del top */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: accentBar,
            flexShrink: 0,
          }}
        />
        <h3
          style={{
            margin: 0,
            fontSize: text.sm,
            fontWeight: weight.semibold,
            color: color.text,
            letterSpacing: '-0.1px',
            minWidth: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {stage.label}
        </h3>
        {/* Monto inline — sólo si > 0, en color muted, alineado al label */}
        {totalAmount > 0 && (
          <span
            style={{
              fontSize: text.xs,
              color: color.textDim,
              fontVariantNumeric: 'tabular-nums',
              fontWeight: weight.medium,
              whiteSpace: 'nowrap',
            }}
          >
            · {formatMoney(totalAmount)}
          </span>
        )}
        {/* Spacer empuja count + add a la derecha */}
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontSize: text.xs,
            fontWeight: weight.bold,
            padding: '2px 7px',
            borderRadius: radius.full,
            background: color.surface,
            color: color.textMuted,
            minWidth: 22,
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          {count}
        </span>
        {onAddLead && !isTerminal && (
          <button
            onClick={onAddLead}
            aria-label={`Agregar lead a ${stage.label}`}
            style={{
              width: 22,
              height: 22,
              borderRadius: radius.sm,
              background: 'transparent',
              color: color.textMuted,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 100ms',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = color.surfaceHover;
              e.currentTarget.style.color = color.text;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = color.textMuted;
            }}
          >
            <Plus size={14} strokeWidth={2.4} />
          </button>
        )}
      </header>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: space[3],
          display: 'flex',
          flexDirection: 'column',
          gap: space[2],
          minHeight: 100,
        }}
      >
        {children}
      </div>

      {/* Resize handle — barra invisible al borde derecho que se muestra
          en hover. El drag actualiza el ancho en vivo; al soltar avisamos
          al padre para persistir en localStorage. */}
      {onResize && (
        <ResizeHandle
          currentWidth={width}
          onResize={onResize}
          accentColor={accentBar}
        />
      )}
    </div>
  );
}

function ResizeHandle({
  currentWidth,
  onResize,
  accentColor,
}: {
  currentWidth: number;
  onResize: (newWidth: number) => void;
  accentColor: string;
}) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = currentWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const next = Math.max(
        COL_MIN_WIDTH,
        Math.min(COL_MAX_WIDTH, startWidth + delta),
      );
      onResize(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        top: 0,
        right: -2,
        width: 6,
        height: '100%',
        cursor: 'col-resize',
        zIndex: 5,
        // Hover bar visual — sólo aparece al hover.
        background: 'transparent',
        transition: 'background 100ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = accentColor;
        e.currentTarget.style.opacity = '0.5';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.opacity = '1';
      }}
      aria-label="Redimensionar columna"
      role="separator"
    />
  );
}

/* ============================================================
 *  Empty state interno de la columna
 * ============================================================ */

export function ColumnEmpty({
  message,
  onAddLead,
  isTerminal,
}: {
  message?: string;
  onAddLead?: () => void;
  isTerminal?: boolean;
}) {
  // Si es etapa terminal (Cerrado/Perdido) sin onAddLead → empty mínimo.
  // Si es no-terminal con onAddLead → CTA "Agregar primer lead" más útil.
  if (isTerminal || !onAddLead) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: space[3],
          textAlign: 'center',
          color: color.textDim,
          fontSize: text.xs,
          opacity: 0.5,
          minHeight: 60,
        }}
      >
        {message || '—'}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onAddLead}
      style={{
        marginTop: 4,
        padding: `${space[3]} ${space[2]}`,
        border: `1px dashed ${color.border}`,
        borderRadius: radius.md,
        background: 'transparent',
        color: color.textDim,
        fontSize: text.xs,
        fontWeight: weight.medium,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[1],
        minHeight: 80,
        transition: 'all 120ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = color.borderStrong;
        e.currentTarget.style.color = color.textMuted;
        e.currentTarget.style.background = color.surfaceHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = color.border;
        e.currentTarget.style.color = color.textDim;
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <Plus size={14} strokeWidth={2.2} />
      Agregar lead
    </button>
  );
}
