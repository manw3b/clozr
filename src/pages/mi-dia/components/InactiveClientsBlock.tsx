import { UserMinus, Phone } from 'lucide-react';
import { WhatsAppIcon } from '../../../components/icons/WhatsAppIcon';
import { SectionCard, SectionRow } from './SectionCard';
import { EmptyState } from '../../../components/EmptyState';
import { Avatar } from '../../../components/Avatar';
import { Badge } from '../../../components/Badge';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney, formatDaysAgo } from '../../../lib/format';
import type { InactiveClient } from '../../../types/domain';

interface InactiveClientsBlockProps {
  clients: InactiveClient[];
  onWhatsApp: (client: InactiveClient) => void;
  onCall: (client: InactiveClient) => void;
  onClientClick: (client: InactiveClient) => void;
  onViewAll: () => void;
}

export function InactiveClientsBlock({
  clients,
  onWhatsApp,
  onCall,
  onClientClick,
  onViewAll,
}: InactiveClientsBlockProps) {
  const totalValue = clients.reduce((sum, c) => sum + (c.client.lifetimeValue || 0), 0);

  return (
    <SectionCard
      title="Clientes en riesgo"
      count={clients.length}
      countTone="warning"
      subtitle={`${formatMoney(totalValue)} en valor histórico a recuperar`}
      icon={<UserMinus size={16} strokeWidth={2.2} />}
      iconTone="warning"
      onViewAll={onViewAll}
      viewAllLabel="Ver todos"
    >
      {clients.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<UserMinus size={20} />}
          title="Sin clientes inactivos"
          description="Todos tus clientes están en contacto reciente."
        />
      ) : (
        clients.map((c, idx) => (
          <InactiveRow
            key={c.client.id}
            inactive={c}
            onClick={() => onClientClick(c)}
            onWhatsApp={() => onWhatsApp(c)}
            onCall={() => onCall(c)}
            isLast={idx === clients.length - 1}
          />
        ))
      )}
    </SectionCard>
  );
}

function InactiveRow({
  inactive,
  onClick,
  onWhatsApp,
  onCall,
  isLast,
}: {
  inactive: InactiveClient;
  onClick: () => void;
  onWhatsApp: () => void;
  onCall: () => void;
  isLast: boolean;
}) {
  const { client, daysSinceContact, totalPurchases } = inactive;
  const isHighValue = (client.lifetimeValue || 0) > 3_000_000;

  return (
    <SectionRow onClick={onClick} isLast={isLast}>
      <Avatar name={client.name} size={36} />

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
            {client.name}
          </span>
          {isHighValue && (
            <Badge tone="primary" size="sm">
              Top
            </Badge>
          )}
          {client.type === 'revendedor' && (
            <Badge tone="info" size="sm">
              Revendedor
            </Badge>
          )}
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
          <span style={{ color: color.warning, fontWeight: weight.semibold }}>
            Sin contacto {formatDaysAgo(daysSinceContact)}
          </span>
          <span>·</span>
          <span>
            {totalPurchases} {totalPurchases === 1 ? 'compra' : 'compras'}
          </span>
          {client.lifetimeValue && (
            <>
              <span>·</span>
              <span>{formatMoney(client.lifetimeValue)} histórico</span>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <QuickButton onClick={onWhatsApp} ariaLabel="WhatsApp" tone="success">
          <WhatsAppIcon size={15} />
        </QuickButton>
        <QuickButton onClick={onCall} ariaLabel="Llamar">
          <Phone size={15} strokeWidth={2.2} />
        </QuickButton>
      </div>
    </SectionRow>
  );
}

function QuickButton({
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
      style={{
        width: 32,
        height: 32,
        borderRadius: radius.md,
        background: 'transparent',
        color: tone === 'success' ? color.success : color.textMuted,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 100ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background =
          tone === 'success' ? color.successBg : color.surfaceHover;
        e.currentTarget.style.color = tone === 'success' ? color.success : color.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = tone === 'success' ? color.success : color.textMuted;
      }}
    >
      {children}
    </button>
  );
}
