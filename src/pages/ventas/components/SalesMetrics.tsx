import { TrendingUp, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney } from '../../../lib/format';
import type { Sale } from '../../../types/domain';

interface SalesMetricsProps {
  sales: Sale[];
}

export function SalesMetrics({ sales }: SalesMetricsProps) {
  const total = sales.reduce((s, x) => s + x.amount, 0);
  const totalPaid = sales.reduce((s, x) => s + x.paid, 0);
  const totalPending = total - totalPaid;
  const overdue = sales.filter(
    (s) => (s.status === 'pending' || s.status === 'partial') &&
           s.dueAt && new Date(s.dueAt).getTime() < Date.now()
  );
  const overdueAmount = overdue.reduce((sum, s) => sum + (s.pending || s.amount - s.paid), 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: space[3] }}>
      <Metric
        icon={<TrendingUp size={16} strokeWidth={2.4} />}
        iconTone="primary"
        label="Total facturado"
        value={formatMoney(total)}
        sub={`${sales.length} ${sales.length === 1 ? 'venta' : 'ventas'}`}
      />
      <Metric
        icon={<CheckCircle2 size={16} strokeWidth={2.4} />}
        iconTone="success"
        label="Cobrado"
        value={formatMoney(totalPaid)}
        sub={`${total > 0 ? Math.round((totalPaid / total) * 100) : 0}% del total`}
      />
      <Metric
        icon={<Clock size={16} strokeWidth={2.4} />}
        iconTone="warning"
        label="Por cobrar"
        value={formatMoney(totalPending)}
        sub={`${sales.filter((s) => s.status !== 'paid').length} pendientes`}
      />
      <Metric
        icon={<AlertCircle size={16} strokeWidth={2.4} />}
        iconTone="danger"
        label="Vencido"
        value={formatMoney(overdueAmount)}
        sub={`${overdue.length} ${overdue.length === 1 ? 'venta' : 'ventas'} atrasadas`}
      />
    </div>
  );
}

function Metric({
  icon, iconTone, label, value, sub,
}: { icon: React.ReactNode; iconTone: 'primary' | 'success' | 'warning' | 'danger'; label: string; value: string; sub: string; }) {
  const tones = {
    primary: { bg: color.primaryBg, fg: color.primary },
    success: { bg: color.successBg, fg: color.success },
    warning: { bg: color.warningBg, fg: color.warning },
    danger: { bg: color.dangerBg, fg: color.danger },
  };
  const t = tones[iconTone];
  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: `${space[3]} ${space[4]}`,
        display: 'flex',
        alignItems: 'center',
        gap: space[3],
      }}
    >
      <div
        style={{
          width: 36, height: 36, borderRadius: radius.md, background: t.bg, color: t.fg,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: text.xs, color: color.textMuted, fontWeight: weight.medium,
            textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: text.lg, fontWeight: weight.bold, color: color.text,
            letterSpacing: '-0.3px', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontSize: text.xs, color: color.textDim, marginTop: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {sub}
        </div>
      </div>
    </div>
  );
}
