import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LeadCard } from './LeadCard';
import type { Lead, LeadStage } from '../../../types/domain';

interface SortableLeadCardProps {
  lead: Lead;
  onClick?: (lead: Lead) => void;
  onWhatsApp?: (lead: Lead) => void;
  onCall?: (lead: Lead) => void;
  onConvertToSale?: (lead: Lead) => void;
  onChangeStage?: (lead: Lead, newStage: LeadStage) => void;
}

/**
 * Wrapper que conecta LeadCard con @dnd-kit/sortable.
 *
 * useSortable nos da:
 *   - attributes / listeners → para que la card sea draggable
 *   - setNodeRef → para que dnd-kit mida la card
 *   - transform / transition → para animar el reordenamiento
 *   - isDragging → para reducir opacidad de la card original (dejamos un "ghost")
 *
 * El componente DragOverlay (en Pipeline.tsx) renderiza el preview que
 * sigue al cursor — eso es lo que el usuario ve nítido durante el drag.
 */
export function SortableLeadCard({ lead, onClick, onWhatsApp, onCall, onConvertToSale, onChangeStage }: SortableLeadCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { type: 'lead', lead },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <LeadCard
      ref={setNodeRef}
      lead={lead}
      isDragging={isDragging}
      onClick={onClick}
      onWhatsApp={onWhatsApp}
      onCall={onCall}
      onConvertToSale={onConvertToSale}
      onChangeStage={onChangeStage}
      dragHandleProps={{ ...attributes, ...listeners }}
      style={style}
    />
  );
}
