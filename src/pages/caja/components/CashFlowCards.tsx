import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney } from '../../../lib/format';
import type { CashSummary } from '../../../types/domain';

interface CashFlowCardsProps {
  summary: CashSummary;
  /** Sufijo descriptivo del período (ej: "del día", "de esta semana"). */
  periodSuffix?: string;
}

export function CashFlowCards({ summary, periodSuffix = 'del día' }: CashFlowCardsProps) {
  const incomeArs = summary.totalIncome.ars + summary.totalIncome.usd * summary.usdRate;
  const expenseArs = summary.totalExpense.ars + summary.totalExpense.usd * summary.usdRate;

  const incomeCount = summary.movements.filter((m) => m.kind === 'income').length;
  const expenseCount = summary.movements.filter((m) => m.kind === 'expense').length;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3] }}>
      <FlowCard
        label={`Ingresos ${periodSuffix}`}
        amount={incomeArs}
        currencyDetails={{ ars: summary.totalIncome.ars, usd: summary.totalIncome.usd }}
        count={incomeCount}
        kind="income"
      />
      <FlowCard
        label={`Egresos ${periodSuffix}`}
        amount={expenseArs}
        currencyDetails={{ ars: summary.totalExpense.ars, usd: summary.totalExpense.usd }}
        count={expenseCount}
        kind="expense"
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
}: {
  label: string;
  amount: number;
  currencyDetails: { ars: number; usd: number };
  count: number;
  kind: 'income' | 'expense';
}) {
  const isIncome = kind === 'income';
  const tone = isIncome ? color.success : color.danger;
  const toneBg = isIncome ? color.successBg : color.dangerBg;
  const Icon = isIncome ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: space[4],
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
          }}
        >
          {label}
        </span>
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
        {isIncome ? '+' : '−'}{formatMoney(amount)}
      </div>

      <div
        style={{
          marginTop: space[2],
          fontSize: text.xs,
          color: color.textMuted,
          display: 'flex',
          gap: space[2],
          flexWrap: 'wrap',
        }}
      >
        <span>{count} {count === 1 ? 'movimiento' : 'movimientos'}</span>
        {currencyDetails.usd > 0 && (
          <>
            <span>·</span>
            <span>
              {formatMoney(currencyDetails.ars)} ARS + {formatMoney(currencyDetails.usd, 'USD')}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
