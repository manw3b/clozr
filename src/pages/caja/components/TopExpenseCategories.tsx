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
 * Tira horizontal con las top N categorías de egreso del período.
 *
 * Responde a la pregunta "¿en qué se me va la plata?". Muestra el % de
 * cada categoría sobre el total de egresos + el monto absoluto, con una
 * mini-barra para que el peso relativo se vea sin sumar mentalmente.
 *
 * Si no hay egresos, no se rendea nada — la sección desaparece.
 */
export function TopExpenseCategories({ movements, topN = 3, periodSuffix = 'del día' }: Props) {
  const expenses = movements.filter((m) => m.kind === 'expense');
  if (expenses.length === 0) return null;

  // Agrupar por categoría sumando montos en ARS (los USD ya están normalizados
  // a ARS en el summary, pero los movements individuales mantienen su moneda
  // original — para la comparativa relativa podemos usar amount sin convertir
  // siempre que estén en la misma moneda; si hay mix, multiplicamos por el
  // ratio aproximado USD≈1450 hardcoded… NO. Mejor: usamos el monto raw y
  // confiamos en que el % relativo sea representativo. Es una heurística
  // visual, no un balance contable).
  const byCategory = new Map<CashCategory, { total: number; count: number }>();
  let grandTotal = 0;
  for (const m of expenses) {
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
  const rest = sorted.slice(topN);
  const restTotal = rest.reduce((s, r) => s + r.total, 0);
  const restPct = restTotal / grandTotal;

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
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: space[2],
          gap: space[2],
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: text.xs,
            fontWeight: weight.semibold,
            color: color.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
          }}
        >
          ¿Dónde se va la plata? · Top egresos {periodSuffix}
        </h3>
        <span
          style={{
            fontSize: text.xs,
            color: color.textDim,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          Total: {formatMoney(grandTotal)}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        {visible.map((row) => (
          <CategoryRow
            key={row.category}
            label={row.label}
            total={row.total}
            count={row.count}
            pct={row.pct}
          />
        ))}
        {rest.length > 0 && (
          <CategoryRow
            label={`Otras (${rest.length})`}
            total={restTotal}
            count={rest.reduce((s, r) => s + r.count, 0)}
            pct={restPct}
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
  muted,
}: {
  label: string;
  total: number;
  count: number;
  pct: number;
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
        {formatMoney(total)}
      </span>
    </div>
  );
}
