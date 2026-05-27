import { CSSProperties, forwardRef, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  ChevronRight,
  X as XIcon,
} from 'lucide-react';
import { WaQuickPicker } from '../../../components/WaQuickPicker';
import { Avatar } from '../../../components/Avatar';
import { confirmAsync } from '../../../lib/confirmAsync';
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
  // H/A: urgente = vencida > 3 días. Borde izquierdo rojo más fuerte
  // que el warning amarillo del isStuck. Hot tiene prioridad visual.
  const overdueDays = lead.nextActionAt
    ? Math.floor((Date.now() - new Date(lead.nextActionAt).getTime()) / 86_400_000)
    : 0;
  const isUrgent = !isHot && overdue && overdueDays >= 3;

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
        // Indicador izquierdo: prioridad cromática
        //  - URGENTE (vencida > 3d): borde rojo grueso (H/A)
        //  - STUCK (>7d sin moverse): borde warning amarillo
        //  - normal: borde estándar
        // Hot ya tiene su propio indicador (left bar) y borde primary; no
        // sobrecargamos.
        borderLeft:
          isUrgent && !selected
            ? `3px solid ${color.danger}`
            : isStuck && !isHot && !selected
            ? `3px solid ${color.warning}`
            : `1px solid ${selected ? color.primary : color.border}`,
        borderRadius: radius.md,
        padding: space[3],
        paddingLeft: (isUrgent || (isStuck && !isHot)) && !selected ? `calc(${space[3]} - 2px)` : space[3],
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
        if (!isHot && !isUrgent && !isDragging && !isOverlay && !selected) {
          e.currentTarget.style.borderColor = color.borderStrong;
        }
      }}
      onMouseLeave={(e) => {
        if (!isHot && !isUrgent && !isDragging && !isOverlay && !selected) {
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
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // H/B: abre el detalle del lead para que el user complete
                // el producto. Antes era texto pelado, ahora invita a acción.
                onClick?.(lead);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Click para agregar producto"
              style={{
                fontSize: text.xs,
                color: color.textDim,
                fontStyle: 'italic',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginTop: 1,
                background: 'transparent',
                border: 'none',
                padding: 0,
                textAlign: 'left',
                cursor: 'pointer',
                width: '100%',
                textDecoration: 'underline dotted',
                textUnderlineOffset: 2,
                textDecorationColor: color.borderStrong,
              }}
            >
              Sin producto definido
            </button>
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

      {/* Nota corta — H/C: diferenciada visualmente del resto del texto
          con fondo sutil + padding, así no se confunde con el nombre del
          cliente / monto / nextAction (todos texto pelado). */}
      {lead.shortNote && (
        <div
          style={{
            fontSize: text.xs,
            color: color.textMuted,
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${color.border}`,
            padding: '4px 8px',
            borderRadius: radius.sm,
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
          title={
            stuckDays === 0
              ? 'Lead movido a esta etapa hoy'
              : `Lleva ${stuckDays} ${stuckDays === 1 ? 'día' : 'días'} sin cambiar de etapa`
          }
          style={{
            fontSize: text.xs,
            color: isStuck ? color.warning : color.textDim,
            fontWeight: isStuck ? weight.semibold : weight.medium,
            cursor: 'help',
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

  async function moveTo(stage: LeadStage) {
    if (stage === 'perdido') {
      // Confirm para evitar perder un lead por accidente (cubre tanto drag
      // como acceso por menú — el drag-confirm va en Pipeline.tsx)
      const ok = await confirmAsync({
        title: "Marcar como perdido",
        message: `¿Marcar el lead de ${lead.clientName} como perdido?`,
        confirmText: "Marcar perdido",
        tone: "danger",
      });
      if (!ok) return;
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
              {onAddNote && (
                <MenuItem onClick={() => setNoteInput('')}>
                  <StickyNote size={12} />
                  Agregar nota
                </MenuItem>
              )}
              {onSnooze && (
                <MenuSub
                  label="Posponer"
                  icon={<Clock3 size={12} color={color.textDim} />}
                >
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
                </MenuSub>
              )}

              {/* Mover a — submenu */}
              {onChangeStage && moveOptions.length > 0 && (
                <MenuSub
                  label="Mover a"
                  icon={<ArrowRight size={12} color={color.textDim} />}
                >
                  {moveOptions.map((s) => (
                    <MenuItem key={s.id} onClick={() => moveTo(s.id)}>
                      <ArrowRight size={12} color={color.textDim} />
                      {s.label}
                    </MenuItem>
                  ))}
                </MenuSub>
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

/**
 * MenuSub — item con submenu que aparece a la derecha al hover (H).
 * Comportamiento similar al ContextMenuSub global, adaptado al estilo
 * de este popover (que es DOM relativo, no portal). El sub se renderea
 * `position: fixed` por encima de todo.
 */
function MenuSub({
  label,
  icon,
  children,
  tone,
}: {
  label: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  tone?: 'success' | 'danger';
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const c = tone === 'success' ? color.success : tone === 'danger' ? color.danger : color.text;

  function computePos() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const margin = 8;
    const SUB_W = 180;
    let left = rect.right - 2;
    if (left + SUB_W > window.innerWidth - margin) left = rect.left - SUB_W + 2;
    setPos({ top: rect.top, left });
  }

  function handleOpen() {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    computePos();
    setOpen(true);
  }
  function handleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  useEffect(() => {
    if (!open || !subRef.current || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const s = subRef.current.getBoundingClientRect();
    const margin = 8;
    let left = r.right - 2;
    if (left + s.width > window.innerWidth - margin) left = r.left - s.width + 2;
    let top = r.top;
    if (top + s.height > window.innerHeight - margin) top = window.innerHeight - s.height - margin;
    setPos({ top, left });
  }, [open]);

  return (
    <div ref={triggerRef} onMouseEnter={handleOpen} onMouseLeave={handleClose}>
      <div
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
          cursor: 'pointer',
          background: open ? color.surface2 : undefined,
        }}
      >
        {icon}
        <span style={{ flex: 1 }}>{label}</span>
        <ChevronRight size={12} color={color.textDim} />
      </div>
      {open && pos &&
        createPortal(
          <div
            ref={subRef}
            onMouseEnter={handleOpen}
            onMouseLeave={handleClose}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              zIndex: 1101,
              minWidth: 180,
              background: color.surface,
              border: `1px solid ${color.borderStrong}`,
              borderRadius: radius.md,
              boxShadow: 'var(--shadow-lg)',
              padding: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            {children}
          </div>,
          document.body,
        )
      }
    </div>
  );
}

// MenuLabel eliminado tras migrar "Posponer"/"Mover a" a MenuSub —
// los sub triggers reemplazan los headers UPPERCASE.

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
