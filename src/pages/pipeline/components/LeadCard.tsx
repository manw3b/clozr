import { CSSProperties, forwardRef } from 'react';
import {
  MessageCircle,
  Phone,
  Clock,
  AlertCircle,
  Flame,
} from 'lucide-react';
import { Avatar } from '../../../components/Avatar';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney, formatRelative } from '../../../lib/format';
import type { Lead } from '../../../types/domain';

interface LeadCardProps {
  lead: Lead;
  /** Se pasa al wrapper draggable */
  isDragging?: boolean;
  /** Se aplica al "ghost" overlay durante drag */
  isOverlay?: boolean;
  onClick?: (lead: Lead) => void;
  onWhatsApp?: (lead: Lead) => void;
  onCall?: (lead: Lead) => void;
  /** Listeners y attributes del DnD-kit (sortable) */
  dragHandleProps?: any;
  /** Style externo (transformación durante drag) */
  style?: CSSProperties;
}

/**
 * Card de un lead que va dentro de cada columna del Kanban.
 *
 * - Vista densa: 1 línea de info crítica + 1 de meta + acciones inline
 * - Drag por toda la card (no solo el handle) — más rápido para el vendedor
 * - El "isDragging" reduce opacidad para que el espacio "fantasma" sea claro
 * - El "isOverlay" se usa para el preview que sigue al cursor — se ve más sólido
 */
export const LeadCard = forwardRef<HTMLDivElement, LeadCardProps>(function LeadCard(
  { lead, isDragging, isOverlay, onClick, onWhatsApp, onCall, dragHandleProps, style },
  ref
) {
  const stuckDays = lead.stageChangedAt
    ? Math.floor((Date.now() - new Date(lead.stageChangedAt).getTime()) / 86_400_000)
    : 0;
  const isStuck = stuckDays >= 7 && lead.priority !== 'hot';
  const isHot = lead.priority === 'hot';
  const overdue =
    lead.nextActionAt && new Date(lead.nextActionAt).getTime() < Date.now();

  return (
    <div
      ref={ref}
      onClick={() => !isOverlay && onClick?.(lead)}
      style={{
        background: color.surface,
        border: `1px solid ${isHot ? color.primary : color.border}`,
        borderRadius: radius.md,
        padding: space[3],
        display: 'flex',
        flexDirection: 'column',
        gap: space[2],
        cursor: isOverlay ? 'grabbing' : 'grab',
        position: 'relative',
        transition: isDragging ? 'none' : 'border-color 100ms, box-shadow 100ms',
        boxShadow: isOverlay ? '0 12px 32px rgba(0, 0, 0, 0.5)' : 'none',
        opacity: isDragging ? 0.4 : 1,
        userSelect: 'none',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!isHot && !isDragging && !isOverlay) {
          e.currentTarget.style.borderColor = color.borderStrong;
        }
      }}
      onMouseLeave={(e) => {
        if (!isHot && !isDragging && !isOverlay) {
          e.currentTarget.style.borderColor = color.border;
        }
      }}
      {...dragHandleProps}
    >
      {/* Indicador izquierdo de prioridad */}
      {isHot && (
        <div
          style={{
            position: 'absolute',
            left: -1,
            top: 8,
            bottom: 8,
            width: 3,
            background: color.primary,
            borderRadius: radius.full,
          }}
        />
      )}

      {/* Línea 1: Cliente */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
        <Avatar name={lead.clientName} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: text.sm,
              fontWeight: weight.semibold,
              color: color.text,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.3,
            }}
          >
            {lead.clientName}
          </div>
          {lead.product && (
            <div
              style={{
                fontSize: text.xs,
                color: color.textMuted,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginTop: 1,
              }}
            >
              {lead.product}
            </div>
          )}
        </div>

        {/* Iconos de estado a la derecha */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          {isHot && <Flame size={14} color={color.primary} strokeWidth={2.4} />}
          {isStuck && (
            <span title={`Estancado hace ${stuckDays} días`}>
              <AlertCircle size={14} color={color.warning} strokeWidth={2.2} />
            </span>
          )}
        </div>
      </div>

      {/* Línea 2: Monto */}
      {lead.amount !== undefined && (
        <div
          style={{
            fontSize: text.lg,
            fontWeight: weight.bold,
            color: color.text,
            letterSpacing: '-0.3px',
            lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatMoney(lead.amount, lead.currency || 'ARS')}
        </div>
      )}

      {/* Línea 3: Próxima acción */}
      {lead.nextActionLabel && lead.nextActionAt && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: text.xs,
            color: overdue ? color.warning : color.textMuted,
            fontWeight: overdue ? weight.semibold : weight.medium,
          }}
        >
          <Clock size={11} strokeWidth={2.2} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.nextActionLabel} · {formatRelative(lead.nextActionAt, { kind: 'due' })}
          </span>
        </div>
      )}

      {/* Nota corta */}
      {lead.shortNote && (
        <div
          style={{
            fontSize: text.xs,
            color: color.textDim,
            fontStyle: 'italic',
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {lead.shortNote}
        </div>
      )}

      {/* Footer: meta + acciones */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 2,
          gap: space[2],
        }}
      >
        <span
          style={{
            fontSize: text.xs,
            color: color.textDim,
            fontWeight: weight.medium,
          }}
        >
          {stuckDays === 0 ? 'hoy' : `${stuckDays}d en etapa`}
        </span>

        <div style={{ display: 'flex', gap: 2 }}>
          <CardActionBtn
            tone="success"
            ariaLabel="WhatsApp"
            onClick={(e) => {
              e.stopPropagation();
              onWhatsApp?.(lead);
            }}
          >
            <MessageCircle size={13} strokeWidth={2.2} />
          </CardActionBtn>
          <CardActionBtn
            ariaLabel="Llamar"
            onClick={(e) => {
              e.stopPropagation();
              onCall?.(lead);
            }}
          >
            <Phone size={13} strokeWidth={2.2} />
          </CardActionBtn>
        </div>
      </div>
    </div>
  );
});

function CardActionBtn({
  children,
  ariaLabel,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  onClick: (e: React.MouseEvent) => void;
  tone?: 'success';
}) {
  return (
    <button
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()} // evita que dispare drag
      style={{
        width: 26,
        height: 26,
        borderRadius: radius.sm,
        background: 'transparent',
        color: tone === 'success' ? color.success : color.textMuted,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 100ms',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background =
          tone === 'success' ? color.successBg : color.surfaceHover;
        e.currentTarget.style.color = tone === 'success' ? color.success : color.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = tone === 'success' ? color.success : color.textMuted;
      }}
    >
      {children}
    </button>
  );
}
