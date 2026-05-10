import { ArrowUpRight, ArrowDownRight, TrendingUp, Plus } from 'lucide-react';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney } from '../../../lib/format';
import type { CashSummary } from '../../../types/domain';

interface CashFlowCardsProps {
  summary: CashSummary;
  /** Sufijo descriptivo del período (ej: "del día", "de esta semana"). */
  periodSuffix?: string;
  /** Quick-add por tipo. Si se pasa, cada card muestra un "+" que dispara
   *  la creación de movimiento del tipo correspondiente. */
  onQuickAdd?: (kind: 'income' | 'expense') => void;
}

export function CashFlowCards({ summary, periodSuffix = 'del día', onQuickAdd }: CashFlowCardsProps) {
  const incomeArs = summary.totalIncome.ars + summary.totalIncome.usd * summary.usdRate;
  const expenseArs = summary.totalExpense.ars + summary.totalExpense.usd * summary.usdRate;
  const netArs = incomeArs - expenseArs;

  const incomeCount = summary.movements.filter((m) => m.kind === 'income').length;
  const expenseCount = summary.movements.filter((m) => m.kind === 'expense').length;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: space[3] }}>
      <FlowCard
        label={`Ingresos ${periodSuffix}`}
        amount={incomeArs}
        currencyDetails={{ ars: summary.totalIncome.ars, usd: summary.totalIncome.usd }}
        count={incomeCount}
        kind="income"
        onQuickAdd={onQuickAdd ? () => onQuickAdd('income') : undefined}
      />
      <FlowCard
        label={`Egresos ${periodSuffix}`}
        amount={expenseArs}
        currencyDetails={{ ars: summary.totalExpense.ars, usd: summary.totalExpense.usd }}
        count={expenseCount}
        kind="expense"
        onQuickAdd={onQuickAdd ? () => onQuickAdd('expense') : undefined}
      />
      <FlowCard
        label={`Neto ${periodSuffix}`}
        amount={netArs}
        kind="net"
      />
    </div>
  );
}

function FlowCard({
  label,
  amount,
  currencyDetails,
  count,
  kind,
  onQuickAdd,
}: {
  label: string;
  amount: number;
  currencyDetails?: { ars: number; usd: number };
  count?: number;
  kind: 'income' | 'expense' | 'net';
  onQuickAdd?: () => void;
}) {
  const isIncome = kind === 'income';
  const isExpense = kind === 'expense';
  const isNet = kind === 'net';
  // Para "neto" usamos el tono del signo: positivo verde, negativo rojo,
  // cero/loading neutro. Así de un vistazo se ve si "ganaste plata" hoy.
  const tone = isIncome
    ? color.success
    : isExpense
    ? color.danger
    : amount > 0
    ? color.success
    : amount < 0
    ? color.danger
    : color.text;
  const toneBg = isIncome
    ? color.successBg
    : isExpense
    ? color.dangerBg
    : amount > 0
    ? color.successBg
    : amount < 0
    ? color.dangerBg
    : color.surface2;
  const Icon = isIncome ? ArrowUpRight : isExpense ? ArrowDownRight : TrendingUp;
  const sign = isIncome ? '+' : isExpense ? '−' : amount > 0 ? '+' : amount < 0 ? '−' : '';
  const displayAmount = Math.abs(amount);

  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: space[4],
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space[2],
          marginBottom: space[2],
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: radius.md,
            background: toneBg,
            color: tone,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={14} strokeWidth={2.4} />
        </div>
        <span
          style={{
            fontSize: text.xs,
            fontWeight: weight.semibold,
            color: color.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            flex: 1,
            minWidth: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </span>
        {onQuickAdd && (
          <button
            onClick={onQuickAdd}
            aria-label={`Agregar ${isIncome ? 'ingreso' : 'egreso'}`}
            title={`Agregar ${isIncome ? 'ingreso' : 'egreso'}`}
            style={{
              width: 24,
              height: 24,
              borderRadius: radius.sm,
              background: 'transparent',
              color: color.textMuted,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 100ms',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = toneBg;
              e.currentTarget.style.color = tone;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = color.textMuted;
            }}
          >
            <Plus size={14} strokeWidth={2.4} />
          </button>
        )}
      </div>

      <div
        style={{
          fontSize: text['2xl'],
          fontWeight: weight.bold,
          color: tone,
          letterSpacing: '-0.5px',
          lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {sign}{formatMoney(displayAmount)}
      </div>

      <div
        style={{
          marginTop: space[2],
          fontSize: text.xs,
          color: color.textMuted,
          display: 'flex',
          gap: space[2],
          flexWrap: 'wrap',
          minHeight: 16,
        }}
      >
        {!isNet && typeof count === 'number' && (
          <span>{count} {count === 1 ? 'movimiento' : 'movimientos'}</span>
        )}
        {!isNet && currencyDetails && currencyDetails.usd > 0 && (
          <>
            <span>·</span>
            <span>
              {formatMoney(currencyDetails.ars)} ARS + {formatMoney(currencyDetails.usd, 'USD')}
            </span>
          </>
        )}
        {isNet && (
          <span>
            {amount > 0 ? 'Cierras en positivo' : amount < 0 ? 'Cierras en negativo' : 'Sin movimientos'}
          </span>
        )}
      </div>
    </div>
  );
}
