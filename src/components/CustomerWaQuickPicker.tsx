import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Sparkles } from 'lucide-react';
import { WhatsAppIcon } from './icons/WhatsAppIcon';
import { color } from '../tokens';
import {
  VISIT_TEMPLATE_KEYS,
  DEFAULT_VISIT_TEMPLATES,
  applyVisitTemplate,
} from '../lib/visitTemplates';
import { workspaceSettings } from '../lib/db/workspaceSettings';
import { useWorkspaceStore } from '../store/workspaceStore';
import { qk } from '../lib/queryKeys';
import {
  FullTrigger,
  PickerHeader,
  PickerRow,
  SmallTrigger,
  firstName,
} from './wa-picker/parts';
import { Popover } from './Popover';

/**
 * CustomerWaQuickPicker — botón de WhatsApp para fila de Clientes y drawer.
 *
 * 2 opciones fijas (a diferencia del WaQuickPicker del pipeline que filtra
 * por etapa):
 *   - "Mensaje libre" → wa.me sin texto
 *   - "Mensaje rápido" → wa.me con la plantilla configurada en Settings
 *     (placeholders {nombre} y {negocio} ya resueltos)
 *
 * Si la plantilla está vacía (rara vez, sólo si el vendedor la borró y no
 * hay default), saltamos el popover y abrimos WA directo — cero fricción
 * para quien no usa templates.
 *
 * El popover + posicionamiento los maneja <Popover>. El styling vive en
 * `./wa-picker/parts.tsx`.
 */

interface CustomerLite {
  id: string;
  name: string;
  phone: string | null;
}

interface Props {
  client: CustomerLite;
  iconSize?: number;
  /** 'small' = chip 26×26 (filas). 'full' = botón con label (drawer). */
  variant?: 'small' | 'full';
  fullLabel?: string;
  /**
   * Callback al elegir una opción. `body` es undefined para "mensaje libre"
   * y para el bypass (plantilla vacía). El caller resuelve registrar
   * contacto + abrir wa.me.
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
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Misma queryKey que usa WhatsAppTemplatesSection — si el vendedor edita
  // la plantilla allá, este picker se entera por invalidación.
  const tplQ = useQuery({
    queryKey: qk.workspaceSettings.waTemplates(wid),
    queryFn: () =>
      workspaceSettings.getMany(wid, [VISIT_TEMPLATE_KEYS.quickOutreach]),
    enabled: !!wid,
  });
  const rawTpl = tplQ.data?.[VISIT_TEMPLATE_KEYS.quickOutreach] ?? '';
  const tpl = rawTpl.trim() || DEFAULT_VISIT_TEMPLATES.quickOutreach.trim();
  const hasTemplate = tpl.length > 0;

  const rendered = applyVisitTemplate(tpl, {
    nombre: firstName(client.name),
    negocio: businessName,
  });

  function handleTriggerClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (disabled) return;
    if (!hasTemplate) {
      // Bypass: una sola opción "libre" no vale un popover, abre directo.
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
        <PickerHeader clientName={client.name} />

        <PickerRow
          icon={<MessageSquare size={13} color={color.textDim} />}
          title="Mensaje libre"
          preview="Abrir WhatsApp sin texto pre-cargado"
          onClick={() => send(undefined)}
        />

        <PickerRow
          icon={<Sparkles size={13} color={color.primary} />}
          title="Mensaje rápido"
          preview={rendered}
          onClick={() => send(rendered)}
        />
      </Popover>
    </>
  );
}
