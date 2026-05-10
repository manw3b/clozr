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
  // Separamos por moneda — NO convertimos. La plata en pesos y la plata en
  // dólares son cajas físicas distintas; mezclarlas con cotización oculta
  // que un dólar puede valer 1450 hoy y 1480 mañana. Cada amount queda en
  // su moneda original.
  const incomeArs = summary.totalIncome.ars;
  const incomeUsd = summary.totalIncome.usd;
  const expenseArs = summary.totalExpense.ars;
  const expenseUsd = summary.totalExpense.usd;
  const netArs = incomeArs - expenseArs;
  const netUsd = incomeUsd - expenseUsd;

  const incomeCount = summary.movements.filter((m) => m.kind === 'income').length;
  const expenseCount = summary.movements.filter((m) => m.kind === 'expense').length;

  // Si todavía no hay nada en el período, los CTAs "Cargar" hacen un
  // pulso sutil para llamar la atención del usuario nuevo. Cuando ya
  // cargó algo, dejamos el pulso para no distraer.
  const pulseEmpty = summary.movements.length === 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: space[3] }}>
      <FlowCard
        label={`Ingresos ${periodSuffix}`}
        ars={incomeArs}
        usd={incomeUsd}
        count={incomeCount}
        kind="income"
        onQuickAdd={onQuickAdd ? () => onQuickAdd('income') : undefined}
        pulseQuickAdd={pulseEmpty}
        animationDelay={40}
      />
      <FlowCard
        label={`Egresos ${periodSuffix}`}
        ars={expenseArs}
        usd={expenseUsd}
        count={expenseCount}
        kind="expense"
        onQuickAdd={onQuickAdd ? () => onQuickAdd('expense') : undefined}
        pulseQuickAdd={pulseEmpty}
        animationDelay={80}
      />
      <FlowCard
        label={`Neto ${periodSuffix}`}
        ars={netArs}
        usd={netUsd}
        kind="net"
        animationDelay={120}
      />
    </div>
  );
}

function FlowCard({
  label,
  ars,
  usd,
  count,
  kind,
  onQuickAdd,
  pulseQuickAdd,
  animationDelay = 0,
}: {
  label: string;
  /** Total en pesos. NO se convierte — son las cajas separadas. */
  ars: number;
  /** Total en dólares. */
  usd: number;
  count?: number;
  kind: 'income' | 'expense' | 'net';
  onQuickAdd?: () => void;
  /** Aplica un pulso visual al botón quick-add para llamar la atención
   *  cuando todavía no hay movimientos cargados. */
  pulseQuickAdd?: boolean;
  /** Stagger de entrada en ms (la card aparece con un retraso). */
  animationDelay?: number;
}) {
  const isIncome = kind === 'income';
  const isExpense = kind === 'expense';
  const isNet = kind === 'net';

  // Para "neto" decidimos el tono según el signo combinado: si AMBAS
  // monedas están en negativo, rojo. Si AMBAS positivas o cero, verde.
  // Si una es positiva y otra negativa, neutral (porque la realidad es
  // mixta y no queremos mentir con un solo color).
  const netSignSummary = isNet ? netSign(ars, usd) : null;
  const tone = isIncome
    ? color.success
    : isExpense
    ? color.danger
    : netSignSummary === 'positive'
    ? color.success
    : netSignSummary === 'negative'
    ? color.danger
    : color.text;
  const toneBg = isIncome
    ? color.successBg
    : isExpense
    ? color.dangerBg
    : netSignSummary === 'positive'
    ? color.successBg
    : netSignSummary === 'negative'
    ? color.dangerBg
    : color.surface2;
  const Icon = isIncome ? ArrowUpRight : isExpense ? ArrowDownRight : TrendingUp;

  return (
    <div
      className="clozr-caja-card"
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: space[4],
        position: 'relative',
        animationDelay: `${animationDelay}ms`,
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
          // Botón visible desde el arranque (tono coloreado, no sólo hover).
          // Da affordance clara: cada card tiene su propio "+ cargar".
          // Si pulseQuickAdd está activo (caja sin movimientos), aplicamos
          // un halo pulsante para guiar al usuario nuevo.
          <button
            className={
              pulseQuickAdd
                ? isIncome
                  ? 'clozr-caja-pulse-income'
                  : 'clozr-caja-pulse-expense'
                : undefined
            }
            onClick={onQuickAdd}
            aria-label={`Agregar ${isIncome ? 'ingreso' : 'egreso'}`}
            title={`Agregar ${isIncome ? 'ingreso' : 'egreso'}`}
            style={{
              height: 26,
              padding: '0 8px',
              borderRadius: radius.sm,
              background: toneBg,
              color: tone,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              flexShrink: 0,
              transition: 'all 120ms',
              cursor: 'pointer',
              fontSize: text.xs,
              fontWeight: weight.semibold,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = tone;
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = toneBg;
              e.currentTarget.style.color = tone;
            }}
          >
            <Plus size={13} strokeWidth={2.6} />
            Cargar
          </button>
        )}
      </div>

      {/* Dos amounts apilados: ARS arriba (mayor) y USD abajo (un poco
          menor pero igual prominente). Si una moneda está en 0, queda
          atenuada — el ojo va al que tiene movimiento sin que la otra
          desaparezca por completo. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <AmountLine ars usd={undefined} value={ars} kind={kind} netSign={netSignSummary} primary />
        <AmountLine ars={false} usd value={usd} kind={kind} netSign={netSignSummary} />
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
        {isNet && (
          <span>
            {netSignSummary === 'positive'
              ? 'Cerrás en positivo'
              : netSignSummary === 'negative'
              ? 'Cerrás en negativo'
              : netSignSummary === 'mixed'
              ? 'Mixto: revisá por moneda'
              : 'Sin movimientos'}
          </span>
        )}
      </div>
    </div>
  );
}

/** Una línea de monto en una moneda específica. Tono y signo dependen del
 *  contexto del flow card padre (ingreso siempre +, egreso siempre −,
 *  neto según signo). Si el value es 0, se atenúa para no competir con
 *  la moneda que sí tiene movimiento. */
function AmountLine({
  ars,
  usd,
  value,
  kind,
  netSign: netSignProp,
  primary,
}: {
  ars: boolean;
  usd: boolean | undefined;
  value: number;
  kind: 'income' | 'expense' | 'net';
  netSign: NetSign | null;
  primary?: boolean;
}) {
  const isIncome = kind === 'income';
  const isExpense = kind === 'expense';
  const isNet = kind === 'net';
  const isZero = value === 0;
  const sign = isIncome ? '+' : isExpense ? '−' : value > 0 ? '+' : value < 0 ? '−' : '';
  const display = Math.abs(value);
  const currency: 'ARS' | 'USD' = ars ? 'ARS' : 'USD';
  // Para isNet: cada línea usa su propio signo (independiente de las otras).
  // Para isIncome/isExpense: tono del kind. Si el value es 0, atenuamos.
  const tone = isZero
    ? color.textDim
    : isIncome
    ? color.success
    : isExpense
    ? color.danger
    : isNet
    ? value > 0
      ? color.success
      : value < 0
      ? color.danger
      : color.textMuted
    : color.text;
  void netSignProp; // el cálculo de tono ya no depende del summary global
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 6,
        opacity: isZero ? 0.55 : 1,
      }}
    >
      <span
        style={{
          fontSize: primary ? text['2xl'] : text.lg,
          fontWeight: weight.bold,
          color: tone,
          letterSpacing: '-0.4px',
          lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {sign}
        {formatMoney(display, currency)}
      </span>
      <span
        style={{
          fontSize: text.xs,
          fontWeight: weight.semibold,
          color: color.textDim,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {ars ? 'ARS' : usd ? 'USD' : ''}
      </span>
    </div>
  );
}

type NetSign = 'positive' | 'negative' | 'zero' | 'mixed';
function netSign(ars: number, usd: number): NetSign {
  const a = Math.sign(ars);
  const u = Math.sign(usd);
  if (a === 0 && u === 0) return 'zero';
  if (a >= 0 && u >= 0) return 'positive';
  if (a <= 0 && u <= 0) return 'negative';
  return 'mixed';
}
