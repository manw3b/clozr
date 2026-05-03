import { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney } from '../../../lib/format';
import type { LeadStage, StageConfig } from '../../../types/domain';

interface PipelineColumnProps {
  stage: StageConfig;
  count: number;
  totalAmount: number;
  /** Si el draggable está hovering encima — feedback visual */
  isDropTarget?: boolean;
  /** El drop pasaría a una etapa terminal (cerrado/perdido) */
  isTerminal?: boolean;
  onAddLead?: () => void;
  /** ref para el SortableContext / droppable */
  setNodeRef?: (el: HTMLElement | null) => void;
  children: ReactNode;
}

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
  isDropTarget,
  isTerminal,
  onAddLead,
  setNodeRef,
  children,
}: PipelineColumnProps) {
  const accent = stageAccent(stage.color);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: isDropTarget ? `${accent.bg}` : color.surface2,
        border: `1px solid ${isDropTarget ? accent.bar : color.border}`,
        borderRadius: radius.lg,
        minWidth: 280,
        maxWidth: 320,
        flex: '0 0 300px',
        height: '100%',
        overflow: 'hidden',
        transition: 'border-color 150ms, background 150ms',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: `${space[3]} ${space[3]}`,
          borderBottom: `1px solid ${color.border}`,
          flexShrink: 0,
          background: color.surface2,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: space[2],
            marginBottom: space[1],
          }}
        >
          {/* Color dot */}
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: accent.bar,
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
              flex: 1,
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {stage.label}
          </h3>
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
        </div>

        {totalAmount > 0 && (
          <div
            style={{
              fontSize: text.xs,
              color: color.textMuted,
              fontVariantNumeric: 'tabular-nums',
              fontWeight: weight.medium,
            }}
          >
            {formatMoney(totalAmount)}
          </div>
        )}
      </header>

      {/* Body */}
      <div
        ref={setNodeRef}
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
    </div>
  );
}

/* ============================================================
 *  Mapeo de colores por stage
 * ============================================================ */

function stageAccent(c: StageConfig['color']) {
  switch (c) {
    case 'info':
      return { bar: color.info, bg: 'rgba(59, 130, 246, 0.05)' };
    case 'warning':
      return { bar: color.warning, bg: 'rgba(245, 158, 11, 0.05)' };
    case 'primary':
      return { bar: color.primary, bg: 'rgba(225, 29, 72, 0.05)' };
    case 'success':
      return { bar: color.success, bg: 'rgba(16, 185, 129, 0.05)' };
    case 'danger':
      return { bar: color.danger, bg: 'rgba(239, 68, 68, 0.05)' };
    default:
      return { bar: color.textDim, bg: 'rgba(100, 116, 139, 0.05)' };
  }
}

/* ============================================================
 *  Empty state interno de la columna
 * ============================================================ */

export function ColumnEmpty({ message }: { message?: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: space[6],
        textAlign: 'center',
        color: color.textDim,
        fontSize: text.xs,
        border: `1px dashed ${color.border}`,
        borderRadius: radius.md,
        minHeight: 80,
      }}
    >
      {message || 'Soltá una card acá'}
    </div>
  );
}
