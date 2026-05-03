import { Wallet, AlertCircle, Check } from 'lucide-react';
import { SectionCard, SectionRow } from './SectionCard';
import { EmptyState } from '../../../components/EmptyState';
import { Button } from '../../../components/Button';
import { color, space, text, weight } from '../../../tokens';
import { formatMoney, formatRelative } from '../../../lib/format';
import type { DueCollection } from '../../../types/domain';

interface CollectionsBlockProps {
  collections: DueCollection[];
  onMarkPaid: (id: string) => void;
  onCollectionClick: (collection: DueCollection) => void;
  onViewAll: () => void;
}

export function CollectionsBlock({
  collections,
  onMarkPaid,
  onCollectionClick,
  onViewAll,
}: CollectionsBlockProps) {
  const overdueAmount = collections
    .filter((c) => c.daysOverdue > 0)
    .reduce((sum, c) => sum + c.amount, 0);
  const totalAmount = collections.reduce((sum, c) => sum + c.amount, 0);

  return (
    <SectionCard
      title="Cobros pendientes"
      count={collections.length}
      countTone={overdueAmount > 0 ? 'danger' : 'neutral'}
      subtitle={
        overdueAmount > 0
          ? `${formatMoney(overdueAmount)} atrasado`
          : `Total: ${formatMoney(totalAmount)}`
      }
      icon={<Wallet size={16} strokeWidth={2.2} />}
      iconTone={overdueAmount > 0 ? 'danger' : 'warning'}
      onViewAll={onViewAll}
    >
      {collections.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<Check size={20} />}
          title="Sin cobros pendientes"
          description="Todas las deudas están al día."
        />
      ) : (
        collections.map((c, idx) => (
          <CollectionRow
            key={c.id}
            collection={c}
            onMarkPaid={() => onMarkPaid(c.id)}
            onClick={() => onCollectionClick(c)}
            isLast={idx === collections.length - 1}
          />
        ))
      )}
    </SectionCard>
  );
}

function CollectionRow({
  collection,
  onMarkPaid,
  onClick,
  isLast,
}: {
  collection: DueCollection;
  onMarkPaid: () => void;
  onClick: () => void;
  isLast: boolean;
}) {
  const overdue = collection.daysOverdue > 0;
  const dueToday = collection.daysOverdue === 0;

  return (
    <SectionRow onClick={onClick} isLast={isLast}>
      {/* Indicador visual del estado */}
      <div
        style={{
          width: 4,
          alignSelf: 'stretch',
          background: overdue ? color.danger : dueToday ? color.warning : color.border,
          borderRadius: 2,
          marginTop: -12,
          marginBottom: -12,
          marginLeft: -8,
          flexShrink: 0,
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: space[2],
            marginBottom: 2,
          }}
        >
          {overdue && (
            <AlertCircle
              size={14}
              color={color.danger}
              strokeWidth={2.2}
              style={{ flexShrink: 0 }}
            />
          )}
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
            {collection.clientName}
          </span>
        </div>
        <div
          style={{
            fontSize: text.xs,
            color: overdue ? color.danger : color.textMuted,
            fontWeight: overdue ? weight.semibold : weight.regular,
          }}
        >
          {collection.product && `${collection.product} · `}
          {formatRelative(collection.dueAt, { kind: 'due' })}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          style={{
            fontSize: text.sm,
            fontWeight: weight.bold,
            color: overdue ? color.danger : color.text,
            letterSpacing: '-0.2px',
          }}
        >
          {formatMoney(collection.amount)}
        </div>
      </div>

      <Button
        variant="secondary"
        size="sm"
        iconLeft={<Check size={13} />}
        onClick={(e) => {
          e.stopPropagation();
          onMarkPaid();
        }}
      >
        Cobrar
      </Button>
    </SectionRow>
  );
}
