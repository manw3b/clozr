import { useRef, useState } from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';
import { WhatsAppIcon } from './icons/WhatsAppIcon';
import { color } from '../tokens';
import { applyTemplate, templatesForStage } from '../lib/waTemplates';
import {
  FullTrigger,
  PickerHeader,
  PickerRow,
  PickerSectionLabel,
  SmallTrigger,
  firstName,
} from './wa-picker/parts';
import { Popover } from './Popover';
import type { Lead } from '../types/domain';

/**
 * WaQuickPicker — botón de WhatsApp con popover de plantillas para el
 * pipeline. La etapa del lead define qué plantillas se ofrecen.
 *
 * Opciones del popover:
 *   - "Mensaje libre" → abre wa.me sin texto
 *   - Plantillas filtradas por `lead.stage` (de `lib/waTemplates`),
 *     con preview ya renderizado (nombre/producto/monto/negocio resueltos)
 *
 * Implementación: el popover + posicionamiento + outside-click + escape
 * los maneja <Popover>. El styling de trigger/header/row vive en
 * `./wa-picker/parts.tsx`. Este componente sólo orquesta.
 */

interface Props {
  lead: Lead;
  businessName?: string | null;
  iconSize?: number;
  /** 'small' = chip 26×26 (LeadCard). 'full' = botón con label (drawer). */
  variant?: 'small' | 'full';
  fullLabel?: string;
  /** Callback que abre wa.me con el body opcional renderizado. */
  onSend: (lead: Lead, body?: string) => void;
  /** True si no hay teléfono — desactiva el trigger. */
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const templates = templatesForStage(lead.stage);

  function handleTriggerClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!disabled) setOpen((v) => !v);
  }

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
    <>
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

      <Popover open={open} onClose={() => setOpen(false)} triggerRef={triggerRef}>
        <PickerHeader clientName={lead.clientName} />

        <PickerRow
          icon={<MessageSquare size={13} color={color.textDim} />}
          title="Mensaje libre"
          preview="Abrir WhatsApp sin texto pre-cargado"
          onClick={() => send()}
        />

        {templates.length > 0 && (
          <>
            <PickerSectionLabel>Plantillas</PickerSectionLabel>
            {templates.map((t) => {
              const preview = applyTemplate(t.body, {
                nombre: firstName(lead.clientName),
                producto: lead.product,
                monto: lead.amount,
                negocio: businessName,
              });
              return (
                <PickerRow
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
      </Popover>
    </>
  );
}
