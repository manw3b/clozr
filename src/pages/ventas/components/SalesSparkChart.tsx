import { color, space, text, weight } from '../../../tokens';
import { formatMoney } from '../../../lib/format';

interface SalesSparkChartProps {
  data: Array<{ date: string; total: number; count: number }>;
  total: number;
  count: number;
  changePct?: number;
}

/**
 * Mini chart de barras para la evolución de ventas — SVG puro.
 */
export function SalesSparkChart({ data, total, count, changePct }: SalesSparkChartProps) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const width = 100;
  const height = 30;
  const barWidth = (width / data.length) * 0.7;
  const barGap = (width / data.length) * 0.3;

  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: 12,
        padding: space[4],
      }}
    >
      <div style={{ marginBottom: space[3] }}>
        <div
          style={{
            fontSize: text.xs,
            fontWeight: weight.semibold,
            color: color.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
            marginBottom: 4,
          }}
        >
          Ventas — últimos 30 días
        </div>
        <div
          style={{
            fontSize: text['2xl'],
            fontWeight: weight.bold,
            color: color.text,
            letterSpacing: '-0.5px',
            lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatMoney(total)}
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: text.xs,
            color: color.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: space[2],
          }}
        >
          <span>{count} ventas</span>
          {changePct !== undefined && (
            <>
              <span>·</span>
              <span style={{ color: changePct >= 0 ? color.success : color.danger, fontWeight: weight.semibold }}>
                {changePct >= 0 ? '↑' : '↓'} {Math.abs(changePct).toFixed(1)}%
              </span>
            </>
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 80, display: 'block' }}
      >
        {data.map((d, i) => {
          const isToday = i === data.length - 1;
          const h = (d.total / max) * height;
          const x = (i * width) / data.length + barGap / 2;
          const y = height - h;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={h || 0.5}
              rx={0.5}
              fill={isToday ? color.primary : color.border}
            >
              <title>
                {new Date(d.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} — {formatMoney(d.total)} ({d.count} ventas)
              </title>
            </rect>
          );
        })}
      </svg>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: space[1],
          fontSize: 10,
          color: color.textDim,
        }}
      >
        <span>
          {new Date(data[0]?.date || Date.now()).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
        </span>
        <span>
          {new Date(data[Math.floor(data.length / 2)]?.date || Date.now()).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
        </span>
        <span>Hoy</span>
      </div>
    </div>
  );
}
