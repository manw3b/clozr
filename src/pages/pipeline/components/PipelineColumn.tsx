import { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
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
  isTerminal,
  onAddLead,
  children,
}: PipelineColumnProps) {
  const accentBar = colorCss(stage.color);
  const accentBg = colorBg(stage.color, 0.08);

  // Droppable de toda la columna — useDroppable con id = stage.id permite
  // soltar cards en columnas vacías y en el espacio libre debajo de las
  // cards. El handleDragOver de Pipeline lee `over.id` y, si no es id de
  // un lead, lo trata como id de stage.
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: isOver ? accentBg : color.surface2,
        border: `1px solid ${isOver ? accentBar : color.border}`,
        borderTop: `3px solid ${accentBar}`,
        borderRadius: radius.lg,
        minWidth: 240,
        maxWidth: 280,
        flex: '0 0 256px',
        height: '100%',
        overflow: 'hidden',
        transition: 'border-color 150ms, background 150ms',
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
    </div>
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
