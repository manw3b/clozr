import { ShoppingCart, Plus } from 'lucide-react';
import { SectionCard, SectionRow } from './SectionCard';
import { EmptyState } from '../../../components/EmptyState';
import { Avatar } from '../../../components/Avatar';
import { Badge } from '../../../components/Badge';
import { color, space, text, weight } from '../../../tokens';
import { formatMoney, formatTime } from '../../../lib/format';
import type { Sale } from '../../../types/domain';

interface SalesBlockProps {
  sales: Sale[];
  onSaleClick: (sale: Sale) => void;
  onNewSale: () => void;
  onViewAll: () => void;
}

export function SalesBlock({ sales, onSaleClick, onNewSale, onViewAll }: SalesBlockProps) {
  const total = sales.reduce((sum, s) => sum + s.amount, 0);

  return (
    <SectionCard
      title="Ventas de hoy"
      count={sales.length}
      countTone="primary"
      subtitle={sales.length > 0 ? `Total: ${formatMoney(total)}` : undefined}
      icon={<ShoppingCart size={16} strokeWidth={2.2} />}
      iconTone="success"
      onViewAll={onViewAll}
    >
      {sales.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<ShoppingCart size={20} />}
          title="Sin ventas hoy"
          description="Registrá tu primera venta del día."
          action={{ label: 'Nueva venta', onClick: onNewSale, iconLeft: <Plus size={14} /> }}
        />
      ) : (
        sales.map((sale, idx) => (
          <SaleRow
            key={sale.id}
            sale={sale}
            onClick={() => onSaleClick(sale)}
            isLast={idx === sales.length - 1}
          />
        ))
      )}
    </SectionCard>
  );
}

function SaleRow({ sale, onClick, isLast }: { sale: Sale; onClick: () => void; isLast: boolean }) {
  return (
    <SectionRow onClick={onClick} isLast={isLast}>
      <Avatar name={sale.clientName} size={36} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: space[2],
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
            {sale.clientName}
          </span>
          {sale.status === 'paid' && (
            <Badge tone="success" size="sm" dot>
              Pagado
            </Badge>
          )}
          {sale.status === 'partial' && (
            <Badge tone="warning" size="sm" dot>
              Parcial
            </Badge>
          )}
          {sale.status === 'pending' && (
            <Badge tone="danger" size="sm" dot>
              Sin pagar
            </Badge>
          )}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: text.xs,
            color: color.textMuted,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {sale.product} · {formatTime(sale.createdAt)}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          style={{
            fontSize: text.sm,
            fontWeight: weight.bold,
            color: color.text,
            letterSpacing: '-0.2px',
          }}
        >
          {formatMoney(sale.amount)}
        </div>
        {sale.status === 'partial' && (
          <div style={{ fontSize: 10, color: color.warning, fontWeight: weight.semibold }}>
            Falta {formatMoney(sale.amount - sale.paid)}
          </div>
        )}
      </div>
    </SectionRow>
  );
}
