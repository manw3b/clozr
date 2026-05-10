import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney } from '../../../lib/format';
import { CASH_CATEGORY_LABELS } from '../../../types/domain';
import type { CashMovement, CashCategory } from '../../../types/domain';

interface Props {
  movements: CashMovement[];
  /** Cantidad máxima de categorías a mostrar (resto va a "Otras"). Default 3. */
  topN?: number;
  /** Sufijo descriptivo del período. Default "del día". */
  periodSuffix?: string;
}

/**
 * Top categorías de egreso del período, separadas por moneda.
 *
 * Mezclar pesos y dólares en un mismo ranking miente: $50.000 ARS no es
 * comparable con US$50 sin conversión, y la conversión cambia día a día.
 * Por eso rendereamos hasta 2 sub-secciones (ARS y USD) cada una con su
 * propio top N. Si una moneda no tiene egresos, esa sub-sección no aparece.
 */
export function TopExpenseCategories({ movements, topN = 3, periodSuffix = 'del día' }: Props) {
  const expenses = movements.filter((m) => m.kind === 'expense');
  if (expenses.length === 0) return null;

  const arsRanking = computeRanking(expenses.filter((m) => m.currency === 'ARS'), topN);
  const usdRanking = computeRanking(expenses.filter((m) => m.currency === 'USD'), topN);

  if (!arsRanking && !usdRanking) return null;

  return (
    <div
      className="clozr-caja-card"
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: `${space[3]} ${space[4]}`,
        animationDelay: '160ms',
      }}
    >
      <h3
        style={{
          margin: 0,
          marginBottom: space[3],
          fontSize: text.xs,
          fontWeight: weight.semibold,
          color: color.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
        }}
      >
        ¿Dónde se va la plata? · Top egresos {periodSuffix}
      </h3>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: arsRanking && usdRanking ? '1fr 1fr' : '1fr',
          gap: space[4],
        }}
      >
        {arsRanking && (
          <RankingBlock currency="ARS" ranking={arsRanking} />
        )}
        {usdRanking && (
          <RankingBlock currency="USD" ranking={usdRanking} />
        )}
      </div>
    </div>
  );
}

interface Ranking {
  visible: Array<{ category: CashCategory; label: string; total: number; count: number; pct: number }>;
  rest: { count: number; total: number; pct: number; categories: number };
  grandTotal: number;
}

function computeRanking(items: CashMovement[], topN: number): Ranking | null {
  if (items.length === 0) return null;
  const byCategory = new Map<CashCategory, { total: number; count: number }>();
  let grandTotal = 0;
  for (const m of items) {
    const entry = byCategory.get(m.category) ?? { total: 0, count: 0 };
    entry.total += m.amount;
    entry.count += 1;
    byCategory.set(m.category, entry);
    grandTotal += m.amount;
  }
  if (grandTotal === 0) return null;
  const sorted = Array.from(byCategory.entries())
    .map(([cat, data]) => ({
      category: cat,
      label: CASH_CATEGORY_LABELS[cat],
      total: data.total,
      count: data.count,
      pct: data.total / grandTotal,
    }))
    .sort((a, b) => b.total - a.total);
  const visible = sorted.slice(0, topN);
  const restItems = sorted.slice(topN);
  const restTotal = restItems.reduce((s, r) => s + r.total, 0);
  return {
    visible,
    rest: {
      count: restItems.reduce((s, r) => s + r.count, 0),
      total: restTotal,
      pct: restTotal / grandTotal,
      categories: restItems.length,
    },
    grandTotal,
  };
}

function RankingBlock({
  currency,
  ranking,
}: {
  currency: 'ARS' | 'USD';
  ranking: Ranking;
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: space[2],
          gap: space[2],
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: weight.bold,
            color: color.textDim,
            textTransform: 'uppercase',
            letterSpacing: '0.7px',
            padding: '2px 6px',
            background: color.surface2,
            borderRadius: radius.sm,
          }}
        >
          {currency === 'ARS' ? 'Pesos' : 'Dólares'}
        </span>
        <span
          style={{
            fontSize: text.xs,
            color: color.textDim,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          Total: {formatMoney(ranking.grandTotal, currency)}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        {ranking.visible.map((row) => (
          <CategoryRow
            key={row.category}
            label={row.label}
            total={row.total}
            count={row.count}
            pct={row.pct}
            currency={currency}
          />
        ))}
        {ranking.rest.categories > 0 && (
          <CategoryRow
            label={`Otras (${ranking.rest.categories})`}
            total={ranking.rest.total}
            count={ranking.rest.count}
            pct={ranking.rest.pct}
            currency={currency}
            muted
          />
        )}
      </div>
    </div>
  );
}

function CategoryRow({
  label,
  total,
  count,
  pct,
  currency,
  muted,
}: {
  label: string;
  total: number;
  count: number;
  pct: number;
  currency: 'ARS' | 'USD';
  muted?: boolean;
}) {
  const pctStr = `${Math.round(pct * 100)}%`;
  const barColor = muted ? color.textDim : color.danger;
  const barBg = muted ? color.surface2 : color.dangerBg;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
      <span
        style={{
          flex: '0 0 140px',
          fontSize: text.sm,
          fontWeight: weight.medium,
          color: muted ? color.textMuted : color.text,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={label}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 6,
          background: barBg,
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.max(2, pct * 100)}%`,
            height: '100%',
            background: barColor,
            borderRadius: 3,
            transition: 'width 240ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </div>
      <span
        style={{
          flex: '0 0 56px',
          textAlign: 'right',
          fontSize: text.xs,
          fontWeight: weight.semibold,
          color: muted ? color.textMuted : color.text,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {pctStr}
      </span>
      <span
        style={{
          flex: '0 0 90px',
          textAlign: 'right',
          fontSize: text.xs,
          color: color.textMuted,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
        title={`${count} ${count === 1 ? 'movimiento' : 'movimientos'}`}
      >
        {formatMoney(total, currency)}
      </span>
    </div>
  );
}
