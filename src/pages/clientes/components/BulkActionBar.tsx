import { X, Tag, Trash2, Download } from 'lucide-react';
import { WhatsAppIcon } from '../../../components/icons/WhatsAppIcon';
import { Button } from '../../../components/Button';
import { color, radius, space, text, weight } from '../../../tokens';

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  onSendWhatsApp: () => void;
  onAddTag: () => void;
  onExport: () => void;
  onDelete: () => void;
}

/**
 * Barra que aparece encima de la tabla cuando hay clientes seleccionados.
 * Reemplaza visualmente los headers cuando está activa.
 */
export function BulkActionBar({
  count,
  onClear,
  onSendWhatsApp,
  onAddTag,
  onExport,
  onDelete,
}: BulkActionBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[3],
        padding: `${space[2]} ${space[4]}`,
        background: color.primaryBg,
        border: `1px solid ${color.primary}`,
        borderRadius: radius.lg,
        animation: 'clozr-bulkbar-slide 200ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
        <button
          onClick={onClear}
          aria-label="Deseleccionar todos"
          style={{
            width: 28,
            height: 28,
            borderRadius: radius.sm,
            background: 'transparent',
            color: color.primary,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 100ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(225, 29, 72, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <X size={16} strokeWidth={2.5} />
        </button>
        <span
          style={{
            fontSize: text.sm,
            color: color.primary,
            fontWeight: weight.semibold,
          }}
        >
          {count} seleccionado{count !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', gap: space[1], alignItems: 'center' }}>
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<WhatsAppIcon size={13} color="var(--success)" />}
          onClick={onSendWhatsApp}
        >
          Enviar mensaje
        </Button>
        <Button variant="ghost" size="sm" iconLeft={<Tag size={13} />} onClick={onAddTag}>
          Etiquetar
        </Button>
        <Button variant="ghost" size="sm" iconLeft={<Download size={13} />} onClick={onExport}>
          Exportar
        </Button>
        <div style={{ width: 1, height: 18, background: color.primary, opacity: 0.3, margin: `0 ${space[1]}` }} />
        <Button variant="ghost" size="sm" iconLeft={<Trash2 size={13} />} onClick={onDelete}>
          Eliminar
        </Button>
      </div>

      <style>{`
        @keyframes clozr-bulkbar-slide {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
