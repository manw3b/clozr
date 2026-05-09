import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Zap } from 'lucide-react';
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
 * Cada plantilla aplica los placeholders ({nombre}, {producto}, {monto},
 * {negocio}) usando los datos del lead. Cuando el usuario elige una,
 * llama a onSend(lead, body?) — el container es responsable de abrir
 * wa.me/<phone>?text=<body>.
 */

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

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
          ariaLabel="WhatsApp"
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
            width: 280,
            maxHeight: 360,
            overflowY: 'auto',
            background: color.surface,
            border: `1px solid ${color.borderStrong}`,
            borderRadius: radius.md,
            boxShadow: 'var(--shadow-lg)',
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Mensaje libre */}
          <TemplateRow
            icon={<MessageSquare size={12} color={color.textDim} />}
            title="Mensaje libre"
            preview="Abrir WhatsApp sin texto pre-cargado"
            onClick={() => send()}
          />

          {templates.length > 0 && (
            <>
              <Divider />
              <Label>Plantillas para esta etapa</Label>
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
                    icon={<Zap size={12} color={color.primary} />}
                    title={t.name}
                    preview={preview}
                    onClick={() => send(t.body)}
                  />
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Sub-componentes ─────────────────────────────────────── */

function SmallTrigger({
  children,
  ariaLabel,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
}) {
  return (
    <button
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
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: `background ${duration.fast} ${ease}`,
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = color.successBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}

function FullTrigger({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
}) {
  return (
    <button
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
        background: color.surface2,
        border: `1px solid ${color.border}`,
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
        e.currentTarget.style.background = color.surface2;
        e.currentTarget.style.borderColor = color.border;
      }}
    >
      {children}
    </button>
  );
}

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
        padding: `7px ${space[3]}`,
        background: 'transparent',
        textAlign: 'left',
        borderRadius: radius.sm,
        cursor: 'pointer',
        transition: `background ${duration.fast} ${ease}`,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = color.surfaceHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ marginTop: 2, flexShrink: 0 }}>{icon}</span>
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
            lineHeight: 1.3,
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
        padding: `${space[2]} ${space[3]} 4px`,
      }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: color.border, margin: '4px 0' }} />;
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? '';
}
