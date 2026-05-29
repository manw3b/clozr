import { Phone, Zap, ArrowRight } from 'lucide-react';
import { WhatsAppIcon } from '../../../components/icons/WhatsAppIcon';
import { SectionCard, SectionRow } from './SectionCard';
import { EmptyState } from '../../../components/EmptyState';
import { Avatar } from '../../../components/Avatar';
import { Badge } from '../../../components/Badge';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney, formatRelative } from '../../../lib/format';
import type { FollowUp, FollowUpReason } from '../../../types/domain';

interface FollowUpsBlockProps {
  followUps: FollowUp[];
  onWhatsApp: (followUp: FollowUp) => void;
  onCall: (followUp: FollowUp) => void;
  onViewDetail: (followUp: FollowUp) => void;
  onViewAll: () => void;
}

const reasonLabels: Record<FollowUpReason, { label: string; tone: 'warning' | 'danger' | 'info' | 'primary' | 'success' }> = {
  'cotizacion-enviada': { label: 'Cotización enviada', tone: 'info' },
  'lead-tibio': { label: 'Lead tibio', tone: 'warning' },
  'sin-respuesta': { label: 'Sin respuesta', tone: 'danger' },
  recordatorio: { label: 'Recordatorio', tone: 'primary' },
  'cobro-pendiente': { label: 'Cobro pendiente', tone: 'danger' },
  'post-venta': { label: 'Post-venta', tone: 'success' },
  'cliente-inactivo': { label: 'Cliente inactivo', tone: 'warning' },
};

export function FollowUpsBlock({ followUps, onWhatsApp, onCall, onViewDetail, onViewAll }: FollowUpsBlockProps) {
  return (
    <SectionCard
      title="Seguimientos"
      count={followUps.length}
      countTone="primary"
      subtitle="Leads que requieren acción"
      icon={<Zap size={16} strokeWidth={2.2} />}
      iconTone="warning"
      onViewAll={onViewAll}
    >
      {followUps.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<Zap size={20} />}
          title="Sin seguimientos hoy"
          description="No hay leads esperando respuesta. Aprovechá para prospectar."
        />
      ) : (
        followUps.map((f, idx) => (
          <FollowUpRow
            key={f.id}
            followUp={f}
            onWhatsApp={() => onWhatsApp(f)}
            onCall={() => onCall(f)}
            onViewDetail={() => onViewDetail(f)}
            isLast={idx === followUps.length - 1}
          />
        ))
      )}
    </SectionCard>
  );
}

function FollowUpRow({
  followUp,
  onWhatsApp,
  onCall,
  onViewDetail,
  isLast,
}: {
  followUp: FollowUp;
  onWhatsApp: () => void;
  onCall: () => void;
  onViewDetail: () => void;
  isLast: boolean;
}) {
  const reason = reasonLabels[followUp.reason];
  const overdue = new Date(followUp.dueAt).getTime() < Date.now();

  return (
    <SectionRow isLast={isLast}>
      <Avatar name={followUp.clientName} size={36} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: space[2],
            marginBottom: 2,
          }}
        >
          <span
            style={{
              fontSize: text.sm,
              fontWeight: weight.semibold,
              color: color.text,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {followUp.clientName}
          </span>
          <Badge tone={reason.tone} size="sm">
            {reason.label}
          </Badge>
        </div>
        <div
          style={{
            fontSize: text.xs,
            color: color.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: space[2],
            flexWrap: 'wrap',
          }}
        >
          {followUp.amount && (
            <span style={{ fontWeight: weight.semibold, color: color.text }}>
              {formatMoney(followUp.amount)}
            </span>
          )}
          {followUp.daysSinceContact !== undefined && (
            <span>
              Sin contacto hace {followUp.daysSinceContact}d
            </span>
          )}
          <span
            style={{
              color: overdue ? color.warning : color.textMuted,
              fontWeight: overdue ? weight.semibold : weight.regular,
            }}
          >
            {formatRelative(followUp.dueAt, { kind: 'due' })}
          </span>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <QuickActionButton
          onClick={onWhatsApp}
          ariaLabel={`WhatsApp a ${followUp.clientName}`}
          tone="success"
        >
          <WhatsAppIcon size={15} />
        </QuickActionButton>
        <QuickActionButton
          onClick={onCall}
          ariaLabel={`Llamar a ${followUp.clientName}`}
        >
          <Phone size={15} strokeWidth={2.2} />
        </QuickActionButton>
        <QuickActionButton
          onClick={onViewDetail}
          ariaLabel={`Ver detalle de ${followUp.clientName}`}
        >
          <ArrowRight size={15} strokeWidth={2.2} />
        </QuickActionButton>
      </div>
    </SectionRow>
  );
}

/* ============================================================
 *  QuickActionButton — botoncito de acción rápida
 * ============================================================ */

function QuickActionButton({
  children,
  onClick,
  ariaLabel,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
  tone?: 'success';
}) {
  return (
    <button
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`btn-icon ${tone === 'success' ? 'wa' : 'muted'}`}
      style={{
        width: 32,
        height: 32,
        borderRadius: radius.md,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}
