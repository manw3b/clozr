import { Wallet, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney } from '../../../lib/format';
import type { CashSummary } from '../../../types/domain';

interface CashBalanceCardProps {
  summary: CashSummary;
}

/**
 * Hero card del balance del día.
 *
 * Estructura:
 * - Balance grande total (en ARS, convertido)
 * - Subtotales ARS y USD por separado
 * - Comparativa: apertura → ahora con delta
 * - Cotización USD vigente
 */
export function CashBalanceCard({ summary }: CashBalanceCardProps) {
  const totalArs = summary.currentBalance.ars + summary.currentBalance.usd * summary.usdRate;
  const openingTotalArs = summary.openingBalance.ars + summary.openingBalance.usd * summary.usdRate;
  const delta = totalArs - openingTotalArs;
  const deltaPct = openingTotalArs > 0 ? (delta / openingTotalArs) * 100 : 0;

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${color.surface} 0%, var(--surface-2) 100%)`,
        border: `1px solid ${color.border}`,
        borderRadius: radius.xl,
        padding: space[5],
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decoración esquina */}
      <div
        style={{
          position: 'absolute',
          top: -100,
          right: -100,
          width: 280,
          height: 280,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${color.success} 0%, transparent 70%)`,
          opacity: 0.1,
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div
          style={{
            fontSize: text.xs,
            fontWeight: weight.semibold,
            color: color.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            gap: space[2],
          }}
        >
          <Wallet size={14} strokeWidth={2.2} />
          Balance actual
        </div>

        {/* Total grande */}
        <div
          style={{
            fontSize: text['3xl'],
            fontWeight: weight.bold,
            color: color.text,
            letterSpacing: '-0.8px',
            lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatMoney(totalArs)}
        </div>

        {/* Delta vs apertura */}
        <div
          style={{
            marginTop: 4,
            fontSize: text.sm,
            display: 'flex',
            alignItems: 'center',
            gap: space[1],
          }}
        >
          {delta >= 0 ? (
            <ArrowUpRight size={14} color={color.success} strokeWidth={2.4} />
          ) : (
            <ArrowDownRight size={14} color={color.danger} strokeWidth={2.4} />
          )}
          <span
            style={{
              color: delta >= 0 ? color.success : color.danger,
              fontWeight: weight.semibold,
            }}
          >
            {formatMoney(Math.abs(delta))} ({deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
          </span>
          <span style={{ color: color.textMuted }}>vs apertura</span>
        </div>

        {/* Subtotales ARS / USD */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: space[3],
            marginTop: space[4],
            paddingTop: space[4],
            borderTop: `1px solid ${color.border}`,
          }}
        >
          <SubBalance
            label="ARS"
            current={summary.currentBalance.ars}
            opening={summary.openingBalance.ars}
            currency="ARS"
          />
          <SubBalance
            label={`USD (cotización ${formatMoney(summary.usdRate)})`}
            current={summary.currentBalance.usd}
            opening={summary.openingBalance.usd}
            currency="USD"
          />
        </div>
      </div>
    </div>
  );
}

function SubBalance({
  label,
  current,
  opening,
  currency,
}: {
  label: string;
  current: number;
  opening: number;
  currency: 'ARS' | 'USD';
}) {
  const delta = current - opening;
  return (
    <div>
      <div
        style={{
          fontSize: text.xs,
          color: color.textMuted,
          fontWeight: weight.medium,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: text.lg,
          fontWeight: weight.bold,
          color: color.text,
          letterSpacing: '-0.2px',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatMoney(current, currency)}
      </div>
      <div
        style={{
          fontSize: text.xs,
          color: delta >= 0 ? color.success : color.danger,
          fontWeight: weight.semibold,
          marginTop: 2,
        }}
      >
        {delta >= 0 ? '+' : ''}{formatMoney(delta, currency)}
      </div>
    </div>
  );
}
