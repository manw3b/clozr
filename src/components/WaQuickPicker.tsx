import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, Sparkles } from 'lucide-react';
import { WhatsAppIcon } from './icons/WhatsAppIcon';
import { color, radius, space, text, weight, duration, ease } from '../tokens';
import { applyTemplate, templatesForStage } from '../lib/waTemplates';
import type { Lead } from '../types/domain';

/**
 * WaQuickPicker — botón de WhatsApp con popover de plantillas.
 *
 * Click → popover con:
 *   - "Mensaje libre" → abre wa.me sin texto pre-cargado
 *   - Lista de plantillas filtradas por la etapa del lead, con preview
 *
 * El popover se renderiza por portal a document.body con smart placement
 * para escapar el overflow del contenedor (columna del kanban, modal, etc.)
 * y reposicionarse automáticamente si no entra abajo o a la derecha.
 */

const POPOVER_W = 320;
const POPOVER_H_MAX = 440;

interface Props {
  lead: Lead;
  /** Nombre del negocio para reemplazar `{negocio}` en las plantillas. */
  businessName?: string | null;
  /** Tamaño del icono del botón principal. */
  iconSize?: number;
  /** Variant del botón: 'small' = chip-style en LeadCard, 'full' = button completo en Drawer. */
  variant?: 'small' | 'full';
  /** Clase visual del botón cuando es 'full' (label texto). */
  fullLabel?: string;
  /** El container abre wa.me con el body opcional. */
  onSend: (lead: Lead, body?: string) => void;
  /** Tema disabled cuando el lead no tiene teléfono. */
  disabled?: boolean;
}

export function WaQuickPicker({
  lead,
  businessName,
  iconSize = 13,
  variant = 'small',
  fullLabel = 'WhatsApp',
  onSend,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Smart placement vs viewport
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function reposition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      // Vertical: prefer below if hay espacio, sino arriba.
      const popH = Math.min(POPOVER_H_MAX, window.innerHeight - 16);
      let top = rect.bottom + margin;
      if (spaceBelow < popH + margin && spaceAbove > spaceBelow) {
        top = rect.top - popH - margin;
      }
      top = Math.max(8, Math.min(top, window.innerHeight - popH - 8));

      // Horizontal: por defecto alineamos el borde DERECHO del popover al
      // borde derecho del trigger (el botón está al final de la fila de
      // acciones, así que abrir hacia la izquierda es lo más cómodo).
      let left = rect.right - POPOVER_W;
      // Si por hacer eso se sale por la izquierda, alineamos a la
      // izquierda del trigger.
      if (left < 8) left = rect.left;
      // Y si tampoco entra a la derecha, clamp al borde del viewport.
      left = Math.min(left, window.innerWidth - POPOVER_W - 8);
      left = Math.max(8, left);

      setPos({ top, left });
    }
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  // Click outside / Esc
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const inTrigger = wrapRef.current?.contains(target);
      const inPopover = popoverRef.current?.contains(target);
      if (!inTrigger && !inPopover) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const templates = templatesForStage(lead.stage);

  function send(body?: string) {
    if (body) {
      const filled = applyTemplate(body, {
        nombre: firstName(lead.clientName),
        producto: lead.product,
        monto: lead.amount,
        negocio: businessName,
      });
      onSend(lead, filled);
    } else {
      onSend(lead);
    }
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      {variant === 'small' ? (
        <SmallTrigger
          ref={triggerRef}
          ariaLabel="WhatsApp"
          active={open}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) setOpen((v) => !v);
          }}
          disabled={disabled}
        >
          <WhatsAppIcon size={iconSize} />
        </SmallTrigger>
      ) : (
        <FullTrigger
          ref={triggerRef}
          active={open}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) setOpen((v) => !v);
          }}
          disabled={disabled}
        >
          <WhatsAppIcon size={iconSize} color="var(--success)" />
          {fullLabel}
        </FullTrigger>
      )}

      {open && pos && createPortal(
        <div
          ref={popoverRef}
          role="menu"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 1000,
            width: POPOVER_W,
            maxHeight: POPOVER_H_MAX,
            overflowY: 'auto',
            background: color.surface,
            border: `1px solid ${color.borderStrong}`,
            borderRadius: radius.md,
            boxShadow: 'var(--shadow-lg)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {/* Header con avatar + cliente para contexto visual */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: space[2],
              padding: `8px ${space[3]} 10px`,
              borderBottom: `1px solid ${color.border}`,
              marginBottom: 4,
            }}
          >
            <WhatsAppIcon size={16} color="var(--success)" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: text.sm,
                  fontWeight: weight.semibold,
                  color: color.text,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Mensaje a {lead.clientName.split(/\s+/)[0]}
              </div>
              <div style={{ fontSize: text.xs, color: color.textDim, marginTop: 1 }}>
                Elegí qué mandar
              </div>
            </div>
          </div>

          {/* Mensaje libre */}
          <TemplateRow
            icon={<MessageSquare size={13} color={color.textDim} />}
            title="Mensaje libre"
            preview="Abrir WhatsApp sin texto pre-cargado"
            onClick={() => send()}
          />

          {templates.length > 0 && (
            <>
              <Label>Plantillas</Label>
              {templates.map((t) => {
                const preview = applyTemplate(t.body, {
                  nombre: firstName(lead.clientName),
                  producto: lead.product,
                  monto: lead.amount,
                  negocio: businessName,
                });
                return (
                  <TemplateRow
                    key={t.id}
                    icon={<Sparkles size={13} color={color.primary} />}
                    title={t.name}
                    preview={preview}
                    onClick={() => send(t.body)}
                  />
                );
              })}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ── Sub-componentes ─────────────────────────────────────── */

const SmallTrigger = ({
  children,
  ariaLabel,
  active,
  onClick,
  disabled,
  ref,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  active?: boolean;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}) => {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 26,
        height: 26,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
        color: color.success,
        background: active ? color.successBg : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: `background ${duration.fast} ${ease}`,
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !active) e.currentTarget.style.background = color.successBg;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
};

const FullTrigger = ({
  children,
  active,
  onClick,
  disabled,
  ref,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}) => {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 36,
        padding: `0 ${space[3]}`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: space[2],
        borderRadius: radius.md,
        background: active ? color.surfaceHover : color.surface2,
        border: `1px solid ${active ? color.borderStrong : color.border}`,
        color: color.text,
        fontSize: text.sm,
        fontWeight: weight.semibold,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: `background ${duration.fast} ${ease}, border-color ${duration.fast} ${ease}`,
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = color.surfaceHover;
          e.currentTarget.style.borderColor = color.borderStrong;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = color.surface2;
          e.currentTarget.style.borderColor = color.border;
        }
      }}
    >
      {children}
    </button>
  );
};

function TemplateRow({
  icon,
  title,
  preview,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  preview: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: space[2],
        padding: `8px ${space[3]}`,
        background: 'transparent',
        textAlign: 'left',
        borderRadius: radius.sm,
        cursor: 'pointer',
        transition: `background ${duration.fast} ${ease}`,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = color.surfaceHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        style={{
          marginTop: 2,
          flexShrink: 0,
          width: 18,
          display: 'inline-flex',
          justifyContent: 'center',
        }}
      >
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: text.sm,
            fontWeight: weight.semibold,
            color: color.text,
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: text.xs,
            color: color.textMuted,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.4,
          }}
        >
          {preview}
        </div>
      </div>
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: weight.semibold,
        color: color.textDim,
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
        padding: `${space[3]} ${space[3]} 4px`,
      }}
    >
      {children}
    </div>
  );
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? '';
}
