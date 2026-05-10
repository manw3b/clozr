import { Wallet, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney } from '../../../lib/format';
import type { CashSummary } from '../../../types/domain';

interface CashBalanceCardProps {
  summary: CashSummary;
}

/**
 * Hero card del balance del día.
 *
 * Cambio importante respecto al diseño anterior: ya no mostramos un "total
 * grande" como suma convertida ARS+USD×cotización. Eso era engañoso porque
 * la caja física en pesos y la caja física en dólares son cosas distintas
 * y el dólar fluctúa. Ahora cada moneda tiene su propio balance prominente.
 */
export function CashBalanceCard({ summary }: CashBalanceCardProps) {
  const deltaArs = summary.currentBalance.ars - summary.openingBalance.ars;
  const deltaUsd = summary.currentBalance.usd - summary.openingBalance.usd;
  const deltaArsPct =
    summary.openingBalance.ars > 0 ? (deltaArs / summary.openingBalance.ars) * 100 : 0;
  const deltaUsdPct =
    summary.openingBalance.usd > 0 ? (deltaUsd / summary.openingBalance.usd) * 100 : 0;

  return (
    <div
      className="clozr-caja-card"
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
            marginBottom: space[2],
            display: 'flex',
            alignItems: 'center',
            gap: space[2],
          }}
        >
          <Wallet size={14} strokeWidth={2.2} />
          Balance actual · cajas separadas por moneda
        </div>

        {/* Dos balances grandes lado a lado: ARS y USD. Sin conversión. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: space[4],
          }}
        >
          <BalanceColumn
            currency="ARS"
            current={summary.currentBalance.ars}
            opening={summary.openingBalance.ars}
            delta={deltaArs}
            deltaPct={deltaArsPct}
          />
          <BalanceColumn
            currency="USD"
            current={summary.currentBalance.usd}
            opening={summary.openingBalance.usd}
            delta={deltaUsd}
            deltaPct={deltaUsdPct}
          />
        </div>

        {/* Cotización informativa al pie — sin convertir nada, sólo
            recordatorio para el usuario. */}
        <div
          style={{
            marginTop: space[4],
            paddingTop: space[3],
            borderTop: `1px solid ${color.border}`,
            fontSize: text.xs,
            color: color.textDim,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>
            Cotización USD ↔ ARS:{' '}
            <strong style={{ color: color.textMuted, fontVariantNumeric: 'tabular-nums' }}>
              {formatMoney(summary.usdRate)}
            </strong>
          </span>
          <span style={{ fontStyle: 'italic' }}>Cada moneda se contabiliza por separado</span>
        </div>
      </div>
    </div>
  );
}

function BalanceColumn({
  currency,
  current,
  opening,
  delta,
  deltaPct,
}: {
  currency: 'ARS' | 'USD';
  current: number;
  opening: number;
  delta: number;
  deltaPct: number;
}) {
  const isPositive = delta >= 0;
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: weight.bold,
          color: color.textDim,
          textTransform: 'uppercase',
          letterSpacing: '0.7px',
          marginBottom: 4,
        }}
      >
        Caja en {currency === 'ARS' ? 'pesos' : 'dólares'} · {currency}
      </div>
      <div
        style={{
          fontSize: text['2xl'],
          fontWeight: weight.bold,
          color: color.text,
          letterSpacing: '-0.6px',
          lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatMoney(current, currency)}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: text.xs,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexWrap: 'wrap',
        }}
      >
        {isPositive ? (
          <ArrowUpRight size={12} color={color.success} strokeWidth={2.4} />
        ) : (
          <ArrowDownRight size={12} color={color.danger} strokeWidth={2.4} />
        )}
        <span
          style={{
            color: isPositive ? color.success : color.danger,
            fontWeight: weight.semibold,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {isPositive ? '+' : '−'}
          {formatMoney(Math.abs(delta), currency)}
          {opening > 0 && ` (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`}
        </span>
        <span style={{ color: color.textMuted }}>vs apertura</span>
      </div>
      <div style={{ fontSize: text.xs, color: color.textDim, marginTop: 2 }}>
        Apertura: {formatMoney(opening, currency)}
      </div>
    </div>
  );
}

