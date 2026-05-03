import {
  ShoppingCart,
  CreditCard,
  ArrowDown,
  ArrowUp,
  Truck,
  Zap,
  Briefcase,
  Home,
  Tag,
  Receipt,
} from 'lucide-react';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney, formatTime } from '../../../lib/format';
import type { CashMovement, CashCategory } from '../../../types/domain';
import { CASH_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '../../../types/domain';

interface CashMovementsListProps {
  movements: CashMovement[];
  onMovementClick?: (m: CashMovement) => void;
}

const categoryIcons: Record<
  CashCategory,
  { icon: React.ComponentType<any>; tone: 'success' | 'danger' | 'info' | 'warning' | 'neutral' }
> = {
  'sale-payment':  { icon: ShoppingCart, tone: 'success' },
  'cash-in':       { icon: ArrowUp, tone: 'success' },
  'transfer-in':   { icon: CreditCard, tone: 'success' },
  'supplier':      { icon: Truck, tone: 'danger' },
  'salary':        { icon: Briefcase, tone: 'danger' },
  'rent':          { icon: Home, tone: 'danger' },
  'utilities':     { icon: Zap, tone: 'warning' },
  'transport':     { icon: Truck, tone: 'warning' },
  'fees':          { icon: Tag, tone: 'warning' },
  'cash-out':      { icon: ArrowDown, tone: 'danger' },
  'other':         { icon: Receipt, tone: 'neutral' },
};

const toneBgMap = {
  success: color.successBg,
  danger: color.dangerBg,
  info: color.infoBg,
  warning: color.warningBg,
  neutral: color.surface2,
};
const toneFgMap = {
  success: color.success,
  danger: color.danger,
  info: color.info,
  warning: color.warning,
  neutral: color.textMuted,
};

export function CashMovementsList({ movements, onMovementClick }: CashMovementsListProps) {
  // Sort por fecha desc
  const sorted = [...movements].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: `${space[3]} ${space[5]}`,
          borderBottom: `1px solid ${color.border}`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: text.md,
              fontWeight: weight.semibold,
              color: color.text,
            }}
          >
            Movimientos del día
          </h2>
          <div style={{ fontSize: text.xs, color: color.textMuted, marginTop: 2 }}>
            {sorted.length} movimientos · ordenados por fecha
          </div>
        </div>
      </header>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {sorted.map((m, idx) => (
          <MovementRow
            key={m.id}
            movement={m}
            isLast={idx === sorted.length - 1}
            onClick={() => onMovementClick?.(m)}
          />
        ))}
      </div>
    </div>
  );
}

function MovementRow({
  movement,
  isLast,
  onClick,
}: {
  movement: CashMovement;
  isLast: boolean;
  onClick?: () => void;
}) {
  const { icon: Icon, tone } = categoryIcons[movement.category];
  const isIncome = movement.kind === 'income';

  return (
    <div
      onClick={onClick}
      style={{
        padding: `${space[3]} ${space[5]}`,
        borderBottom: isLast ? 'none' : `1px solid ${color.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: space[3],
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 100ms',
      }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.background = color.surfaceHover;
      }}
      onMouseLeave={(e) => {
        if (onClick) e.currentTarget.style.background = 'transparent';
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.md,
          background: toneBgMap[tone],
          color: toneFgMap[tone],
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={16} strokeWidth={2.4} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: text.sm,
            fontWeight: weight.semibold,
            color: color.text,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: 1,
          }}
        >
          {movement.description}
        </div>
        <div
          style={{
            fontSize: text.xs,
            color: color.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <span>{CASH_CATEGORY_LABELS[movement.category]}</span>
          <span>·</span>
          <span>{formatTime(movement.createdAt)}</span>
          {movement.paymentMethod && (
            <>
              <span>·</span>
              <span>{PAYMENT_METHOD_LABELS[movement.paymentMethod]}</span>
            </>
          )}
        </div>
      </div>

      {/* Amount */}
      <div
        style={{
          fontSize: text.sm,
          fontWeight: weight.bold,
          color: isIncome ? color.success : color.danger,
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {isIncome ? '+' : '−'}{formatMoney(movement.amount, movement.currency)}
      </div>
    </div>
  );
}
