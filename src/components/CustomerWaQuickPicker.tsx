import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Sparkles } from 'lucide-react';
import { WhatsAppIcon } from './icons/WhatsAppIcon';
import { color, radius, space, text, weight, duration, ease } from '../tokens';
import {
  VISIT_TEMPLATE_KEYS,
  DEFAULT_VISIT_TEMPLATES,
  applyVisitTemplate,
} from '../lib/visitTemplates';
import { workspaceSettings } from '../lib/db/workspaceSettings';
import { useWorkspaceStore } from '../store/workspaceStore';

/**
 * CustomerWaQuickPicker — botón de WhatsApp con popover de 2 opciones para
 * la tabla de Clientes y el ClientDrawer.
 *
 * Click → popover con:
 *   - "Mensaje libre" → abre wa.me sin texto pre-cargado
 *   - "Mensaje rápido" → wa.me con el template configurado en Settings
 *     (placeholders `{nombre}` y `{negocio}` resueltos)
 *
 * Si la plantilla está vacía (o el vendedor la limpió), saltamos el picker
 * y abrimos directo wa.me sin body — cero fricción para quien no usa
 * templates. Esa decisión se toma a partir del valor cacheado, no en click.
 *
 * Similar a WaQuickPicker (del pipeline) pero deliberadamente más simple:
 * - 2 opciones fijas, no lista filtrada por etapa
 * - Sin lead context (ni stage, ni producto, ni monto) — solo cliente
 * - 50% del código se duplica con WaQuickPicker. Deuda anotada para
 *   consolidar en un solo módulo con discriminated union.
 */

const POPOVER_W = 320;
const POPOVER_H_MAX = 320;

interface CustomerLite {
  id: string;
  name: string;
  phone: string | null;
}

interface Props {
  client: CustomerLite;
  /** Tamaño del icono del botón principal. */
  iconSize?: number;
  /** 'small' = chip de fila (26×26), 'full' = botón con label para drawer. */
  variant?: 'small' | 'full';
  /** Label del botón cuando es 'full'. */
  fullLabel?: string;
  /**
   * Callback ejecutado cuando el vendedor elige mandar el mensaje.
   * `body` es undefined si eligió "mensaje libre" o si la plantilla estaba
   * vacía (en cuyo caso ni siquiera se abrió el picker).
   */
  onSend: (body: string | undefined) => void;
}

export function CustomerWaQuickPicker({
  client,
  iconSize = 13,
  variant = 'small',
  fullLabel = 'WhatsApp',
  onSend,
}: Props) {
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? '';
  const businessName = activeWorkspace?.name ?? '';
  const disabled = !client.phone;

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Cachea el valor del template para todo el workspace. Misma queryKey
  // que usa WhatsAppTemplatesSection — si el vendedor lo edita allá,
  // este picker se entera por invalidación automática.
  const tplQ = useQuery({
    queryKey: ['workspace-settings', wid, 'wa-templates'],
    queryFn: () =>
      workspaceSettings.getMany(wid, [VISIT_TEMPLATE_KEYS.quickOutreach]),
    enabled: !!wid,
  });
  const rawTpl = tplQ.data?.[VISIT_TEMPLATE_KEYS.quickOutreach] ?? '';
  // Si el vendedor borró la plantilla, caemos al default. Pero si el
  // default tampoco está (caso raro), bypass al picker.
  const tpl = rawTpl.trim() || DEFAULT_VISIT_TEMPLATES.quickOutreach.trim();
  const hasTemplate = tpl.length > 0;

  const rendered = applyVisitTemplate(tpl, {
    nombre: firstName(client.name),
    negocio: businessName,
  });

  // Smart placement vs viewport (copiado de WaQuickPicker, mismo
  // comportamiento para sentirse parejo en filas y drawers).
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function reposition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      const popH = Math.min(POPOVER_H_MAX, window.innerHeight - 16);
      let top = rect.bottom + margin;
      if (spaceBelow < popH + margin && spaceAbove > spaceBelow) {
        top = rect.top - popH - margin;
      }
      top = Math.max(8, Math.min(top, window.innerHeight - popH - 8));

      let left = rect.right - POPOVER_W;
      if (left < 8) left = rect.left;
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

  function handleTriggerClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (disabled) return;
    if (!hasTemplate) {
      // Bypass: sin plantilla, no tiene sentido mostrar un picker con una
      // sola opción ("libre"). Abrimos WhatsApp directo.
      onSend(undefined);
      return;
    }
    setOpen((v) => !v);
  }

  function send(body: string | undefined) {
    onSend(body);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      {variant === 'small' ? (
        <SmallTrigger
          ref={triggerRef}
          ariaLabel="WhatsApp"
          active={open}
          onClick={handleTriggerClick}
          disabled={disabled}
        >
          <WhatsAppIcon size={iconSize} />
        </SmallTrigger>
      ) : (
        <FullTrigger
          ref={triggerRef}
          active={open}
          onClick={handleTriggerClick}
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
                Mensaje a {firstName(client.name)}
              </div>
              <div style={{ fontSize: text.xs, color: color.textDim, marginTop: 1 }}>
                Elegí qué mandar
              </div>
            </div>
          </div>

          <TemplateRow
            icon={<MessageSquare size={13} color={color.textDim} />}
            title="Mensaje libre"
            preview="Abrir WhatsApp sin texto pre-cargado"
            onClick={() => send(undefined)}
          />

          <TemplateRow
            icon={<Sparkles size={13} color={color.primary} />}
            title="Mensaje rápido"
            preview={rendered}
            onClick={() => send(rendered)}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ── Sub-componentes ─────────────────────────────────────── */

interface SmallTriggerProps {
  children: React.ReactNode;
  ariaLabel: string;
  active?: boolean;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
}
const SmallTrigger = forwardRef<HTMLButtonElement, SmallTriggerProps>(
  function SmallTrigger({ children, ariaLabel, active, onClick, disabled }, ref) {
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
  },
);

interface FullTriggerProps {
  children: React.ReactNode;
  active?: boolean;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
}
const FullTrigger = forwardRef<HTMLButtonElement, FullTriggerProps>(
  function FullTrigger({ children, active, onClick, disabled }, ref) {
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
  },
);

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

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? '';
}
