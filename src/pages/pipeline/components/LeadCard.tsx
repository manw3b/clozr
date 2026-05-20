import { CSSProperties, forwardRef, useEffect, useRef, useState } from 'react';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import {
  Phone,
  Clock,
  AlertCircle,
  Flame,
  DollarSign,
  MoreVertical,
  ArrowRight,
  Trophy,
  XCircle,
  Clock3,
  StickyNote,
  Check,
  X as XIcon,
} from 'lucide-react';
import { WaQuickPicker } from '../../../components/WaQuickPicker';
import { Avatar } from '../../../components/Avatar';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney, formatRelative } from '../../../lib/format';
import type { Lead, LeadStage } from '../../../types/domain';
import { usePipelineStages } from '../usePipelineStages';

/** Combinación de attributes + listeners de @dnd-kit/sortable que se
 *  spreadea sobre el elemento que dispara el drag. No los podemos
 *  intersectar directo (DraggableAttributes tiene `role: string` y
 *  SyntheticListenerMap tiene index signature `Function` — chocan), así
 *  que las modelamos como un objeto plano que admite cualquiera de las
 *  dos shapes. Es estructuralmente correcto al hacer spread. */
export type DragHandleProps = Partial<DraggableAttributes> & {
  [key: string]: unknown;
};
// Tipo del @dnd-kit no usado directamente, lo importamos para mantener
// el contrato visible y que TypeScript verifique que existe.
export type _DnDListenerType = DraggableSyntheticListeners;

interface LeadCardProps {
  lead: Lead;
  /** Se dispara con click derecho sobre la card. El parent decide qué
   *  menu mostrar (típicamente un ContextMenu posicionado en el cursor). */
  onContextMenu?: (lead: Lead, e: React.MouseEvent) => void;
  /** Se pasa al wrapper draggable */
  isDragging?: boolean;
  /** Se aplica al "ghost" overlay durante drag */
  isOverlay?: boolean;
  onClick?: (lead: Lead) => void;
  /** body opcional: si viene, se manda como query `?text=` a wa.me. */
  onWhatsApp?: (lead: Lead, body?: string) => void;
  /** Nombre del negocio para reemplazar `{negocio}` en plantillas WA. */
  businessName?: string | null;
  onCall?: (lead: Lead) => void;
  onConvertToSale?: (lead: Lead) => void;
  /** Mover el lead a otra etapa sin drag (alternativa táctil/teclado). */
  onChangeStage?: (lead: Lead, newStage: LeadStage) => void;
  /** Pospone la próxima acción del lead `days` días desde ahora. */
  onSnooze?: (lead: Lead, days: number) => void;
  /** Agrega una nota libre al activity log del lead. */
  onAddNote?: (lead: Lead, text: string) => void;
  /** Selection (multi-select). Si pasás onToggleSelect, se renderiza un
   *  checkbox en la card y la card mueve el click body para que NO abra
   *  el drawer cuando hay selección activa. */
  selected?: boolean;
  /** Si true, hay otras cards seleccionadas — se fuerza a mostrar el
   *  checkbox aunque no haya hover sobre esta. */
  selectionActive?: boolean;
  onToggleSelect?: (lead: Lead) => void;
  /** Listeners y attributes del DnD-kit (sortable) */
  dragHandleProps?: DragHandleProps;
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
  { lead, isDragging, isOverlay, onClick, onContextMenu, onWhatsApp, businessName, onCall, onConvertToSale, onChangeStage, onSnooze, onAddNote, selected, selectionActive, onToggleSelect, dragHandleProps, style },
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
      onClick={(e) => {
        if (isOverlay) return;
        // Si hay selección activa o cmd/ctrl-click, click toggea selección
        // en lugar de abrir el drawer.
        if (onToggleSelect && (selectionActive || e.metaKey || e.ctrlKey)) {
          e.stopPropagation();
          onToggleSelect(lead);
          return;
        }
        onClick?.(lead);
      }}
      onContextMenu={onContextMenu ? (e) => onContextMenu(lead, e) : undefined}
      style={{
        background: selected ? color.primaryBg : color.surface,
        border: `1px solid ${selected ? color.primary : isHot ? color.primary : color.border}`,
        // Indicador stuck: borde izquierdo grueso warning para que llame
        // la atención sin romper la grid de la card
        borderLeft:
          isStuck && !isHot && !selected
            ? `3px solid ${color.warning}`
            : `1px solid ${selected ? color.primary : color.border}`,
        borderRadius: radius.md,
        padding: space[3],
        paddingLeft: isStuck && !isHot && !selected ? `calc(${space[3]} - 2px)` : space[3],
        display: 'flex',
        flexDirection: 'column',
        gap: space[2],
        cursor: isOverlay ? 'grabbing' : 'grab',
        position: 'relative',
        transition: isDragging ? 'none' : 'border-color 100ms, box-shadow 100ms, background 100ms',
        boxShadow: isOverlay ? '0 12px 32px rgba(0, 0, 0, 0.5)' : 'none',
        opacity: isDragging ? 0.4 : 1,
        userSelect: 'none',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!isHot && !isDragging && !isOverlay && !selected) {
          e.currentTarget.style.borderColor = color.borderStrong;
        }
      }}
      onMouseLeave={(e) => {
        if (!isHot && !isDragging && !isOverlay && !selected) {
          e.currentTarget.style.borderColor = color.border;
        }
      }}
      {...dragHandleProps}
    >
      {/* Checkbox de selección — visible cuando hay selección activa o
          en hover. Click NO propaga al body de la card. */}
      {onToggleSelect && (
        <button
          type="button"
          aria-label={selected ? 'Deseleccionar' : 'Seleccionar'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(lead);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 18,
            height: 18,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.sm,
            border: `1.5px solid ${selected ? color.primary : color.borderStrong}`,
            background: selected ? color.primary : color.surface,
            color: '#fff',
            cursor: 'pointer',
            opacity: selected || selectionActive ? 1 : 0,
            transition: 'opacity 120ms, background 120ms, border-color 120ms',
            zIndex: 2,
          }}
          // Mostrar checkbox al hacer hover sobre la card
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => {
            if (!selected && !selectionActive) e.currentTarget.style.opacity = '0';
          }}
        >
          {selected && <Check size={11} strokeWidth={3} />}
        </button>
      )}

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
          {lead.product ? (
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
          ) : (
            <div
              style={{
                fontSize: text.xs,
                color: color.textDim,
                fontStyle: 'italic',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginTop: 1,
              }}
            >
              Sin producto definido
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
            color: isStuck ? color.warning : color.textDim,
            fontWeight: isStuck ? weight.semibold : weight.medium,
          }}
        >
          {stuckDays === 0 ? 'hoy' : `${stuckDays}d en etapa`}
        </span>

        <div style={{ display: 'flex', gap: 2 }}>
          {/* Cerrar venta: solo etapas tardías (presupuestado, negociando)
              donde el lead está cerca del cierre. En etapas tempranas el botón
              es ruido — el vendedor todavía está calificando, no cobrando.
              Icono $ es más claro que el carrito (que se confunde con stock). */}
          {onConvertToSale &&
            (lead.stage === 'presupuestado' || lead.stage === 'negociando') && (
            <CardActionBtn
              tone="primary"
              ariaLabel="Cerrar venta"
              onClick={(e) => {
                e.stopPropagation();
                onConvertToSale(lead);
              }}
            >
              <DollarSign size={13} strokeWidth={2.4} />
            </CardActionBtn>
          )}
          {onWhatsApp && (
            <WaQuickPicker
              lead={lead}
              businessName={businessName}
              iconSize={13}
              variant="small"
              onSend={(l, body) => onWhatsApp(l, body)}
            />
          )}
          <CardActionBtn
            ariaLabel="Llamar"
            onClick={(e) => {
              e.stopPropagation();
              onCall?.(lead);
            }}
          >
            <Phone size={13} strokeWidth={2.2} />
          </CardActionBtn>
          {(onChangeStage || onSnooze || onAddNote) && (
            <QuickActionsMenu
              lead={lead}
              onChangeStage={onChangeStage}
              onSnooze={onSnooze}
              onAddNote={onAddNote}
            />
          )}
        </div>
      </div>
    </div>
  );
});

/* ============================================================
 *  QuickActionsMenu — dropdown con shortcuts: cambiar etapa,
 *  marcar como ganado/perdido sin tener que dragear
 * ============================================================ */

function QuickActionsMenu({
  lead,
  onChangeStage,
  onSnooze,
  onAddNote,
}: {
  lead: Lead;
  onChangeStage?: (lead: Lead, stage: LeadStage) => void;
  onSnooze?: (lead: Lead, days: number) => void;
  onAddNote?: (lead: Lead, text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [noteInput, setNoteInput] = useState<string | null>(null); // null = no abierto
  const wrapRef = useRef<HTMLDivElement>(null);
  const { stages: STAGES } = usePipelineStages();

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setNoteInput(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setNoteInput(null);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function moveTo(stage: LeadStage) {
    if (stage === 'perdido') {
      // Confirm para evitar perder un lead por accidente (cubre tanto drag
      // como acceso por menú — el drag-confirm va en Pipeline.tsx)
      if (!window.confirm(`¿Marcar el lead de ${lead.clientName} como perdido?`)) return;
    }
    if (onChangeStage && stage !== lead.stage) onChangeStage(lead, stage);
    setOpen(false);
  }

  function snooze(days: number) {
    onSnooze?.(lead, days);
    setOpen(false);
  }

  function commitNote() {
    const t = (noteInput ?? '').trim();
    if (t.length > 0) onAddNote?.(lead, t);
    setNoteInput(null);
    setOpen(false);
  }

  // Stages disponibles para mover (excluye la actual)
  const moveOptions = STAGES.filter((s) => !s.terminal && s.id !== lead.stage);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <CardActionBtn
        ariaLabel="Más acciones"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
          setNoteInput(null);
        }}
      >
        <MoreVertical size={13} strokeWidth={2.2} />
      </CardActionBtn>
      {open && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 30,
            minWidth: 220,
            background: color.surface,
            border: `1px solid ${color.borderStrong}`,
            borderRadius: radius.md,
            boxShadow: 'var(--shadow-lg)',
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Add note inline (cuando se abre, reemplaza el menú normal) */}
          {noteInput !== null ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 6 }}>
              <textarea
                autoFocus
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commitNote();
                }}
                placeholder="Agregar nota… (Cmd+Enter para guardar)"
                style={{
                  width: '100%',
                  minHeight: 64,
                  padding: space[2],
                  background: color.surface2,
                  border: `1px solid ${color.border}`,
                  borderRadius: radius.sm,
                  color: color.text,
                  fontSize: text.sm,
                  fontFamily: 'inherit',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                <button
                  onClick={() => setNoteInput(null)}
                  style={{
                    padding: `4px 8px`,
                    fontSize: text.xs,
                    color: color.textMuted,
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <XIcon size={12} />
                </button>
                <button
                  onClick={commitNote}
                  disabled={(noteInput ?? '').trim().length === 0}
                  style={{
                    padding: `4px 10px`,
                    fontSize: text.xs,
                    fontWeight: weight.semibold,
                    color: '#fff',
                    background: color.primary,
                    borderRadius: radius.sm,
                    cursor: 'pointer',
                    opacity: (noteInput ?? '').trim().length === 0 ? 0.5 : 1,
                  }}
                >
                  <Check size={12} />
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Quick actions */}
              {(onAddNote || onSnooze) && (
                <>
                  {onAddNote && (
                    <MenuItem onClick={() => setNoteInput('')}>
                      <StickyNote size={12} />
                      Agregar nota
                    </MenuItem>
                  )}
                  {onSnooze && (
                    <>
                      <MenuLabel>Posponer</MenuLabel>
                      <MenuItem onClick={() => snooze(1)}>
                        <Clock3 size={12} color={color.textDim} />
                        +1 día
                      </MenuItem>
                      <MenuItem onClick={() => snooze(3)}>
                        <Clock3 size={12} color={color.textDim} />
                        +3 días
                      </MenuItem>
                      <MenuItem onClick={() => snooze(7)}>
                        <Clock3 size={12} color={color.textDim} />
                        +1 semana
                      </MenuItem>
                    </>
                  )}
                </>
              )}

              {/* Mover a */}
              {onChangeStage && moveOptions.length > 0 && (
                <>
                  <Divider />
                  <MenuLabel>Mover a</MenuLabel>
                  {moveOptions.map((s) => (
                    <MenuItem key={s.id} onClick={() => moveTo(s.id)}>
                      <ArrowRight size={12} color={color.textDim} />
                      {s.label}
                    </MenuItem>
                  ))}
                </>
              )}

              {/* Marcar como ganado/perdido */}
              {onChangeStage && (
                <>
                  <Divider />
                  {lead.stage !== 'cerrado' && (
                    <MenuItem tone="success" onClick={() => moveTo('cerrado')}>
                      <Trophy size={12} />
                      Marcar como ganado
                    </MenuItem>
                  )}
                  {lead.stage !== 'perdido' && (
                    <MenuItem tone="danger" onClick={() => moveTo('perdido')}>
                      <XCircle size={12} />
                      Marcar como perdido
                    </MenuItem>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: weight.semibold,
        color: color.textDim,
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
        padding: `${space[2]} ${space[3]} 4px`,
      }}
    >
      {children}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'success' | 'danger';
}) {
  const c =
    tone === 'success' ? color.success : tone === 'danger' ? color.danger : color.text;
  return (
    <button
      onClick={onClick}
      className="row-hover"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[2],
        padding: `7px ${space[3]}`,
        color: c,
        fontSize: text.sm,
        fontWeight: weight.medium,
        textAlign: 'left',
        borderRadius: radius.sm,
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: color.border, margin: '4px 0' }} />;
}

function CardActionBtn({
  children,
  ariaLabel,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  onClick: (e: React.MouseEvent) => void;
  tone?: 'success' | 'primary';
}) {
  // Mapeo de tone a la variante .btn-icon que define el hover bg + color.
  const variantClass =
    tone === 'success' ? 'wa' : tone === 'primary' ? 'primary' : 'muted';
  return (
    <button
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()} // evita que dispare drag
      className={`btn-icon ${variantClass}`}
      style={{
        width: 26,
        height: 26,
        borderRadius: radius.sm,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}
