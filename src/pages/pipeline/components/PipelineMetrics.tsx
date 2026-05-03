import { TrendingUp, DollarSign, Target, Trophy } from 'lucide-react';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney } from '../../../lib/format';
import type { Lead } from '../../../types/domain';
import { STAGES } from '../../../types/domain';

interface PipelineMetricsProps {
  leads: Lead[];
}

/**
 * Tira de métricas arriba del kanban.
 *
 * - Total pipeline: suma de TODOS los leads activos (excluye cerrado/perdido)
 * - Weighted: pondera el monto por probabilidad de cierre de cada stage
 * - Cerrado del mes: suma de leads que pasaron a cerrado este mes
 * - Win rate: % de cerrados / (cerrados + perdidos)
 */
export function PipelineMetrics({ leads }: PipelineMetricsProps) {
  const active = leads.filter((l) => l.stage !== 'cerrado' && l.stage !== 'perdido');
  const closed = leads.filter((l) => l.stage === 'cerrado');
  const lost = leads.filter((l) => l.stage === 'perdido');

  const totalPipeline = active.reduce((sum, l) => sum + (l.amount || 0), 0);

  const weighted = active.reduce((sum, l) => {
    const stageConfig = STAGES.find((s) => s.id === l.stage);
    const probability = stageConfig?.probability || 0;
    return sum + (l.amount || 0) * probability;
  }, 0);

  const monthClosed = closed.reduce((sum, l) => sum + (l.amount || 0), 0);

  const totalDecided = closed.length + lost.length;
  const winRate = totalDecided > 0 ? (closed.length / totalDecided) * 100 : 0;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: space[3],
      }}
    >
      <Metric
        icon={<TrendingUp size={16} strokeWidth={2.4} />}
        iconTone="info"
        label="Pipeline activo"
        value={formatMoney(totalPipeline)}
        sub={`${active.length} ${active.length === 1 ? 'lead' : 'leads'}`}
      />
      <Metric
        icon={<Target size={16} strokeWidth={2.4} />}
        iconTone="warning"
        label="Pondera­do"
        value={formatMoney(weighted)}
        sub="Por probabilidad"
      />
      <Metric
        icon={<DollarSign size={16} strokeWidth={2.4} />}
        iconTone="success"
        label="Cerrado este mes"
        value={formatMoney(monthClosed)}
        sub={`${closed.length} ${closed.length === 1 ? 'venta' : 'ventas'}`}
      />
      <Metric
        icon={<Trophy size={16} strokeWidth={2.4} />}
        iconTone="primary"
        label="Win rate"
        value={`${winRate.toFixed(0)}%`}
        sub={`${closed.length} ganados / ${lost.length} perdidos`}
      />
    </div>
  );
}

function Metric({
  icon,
  iconTone,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  iconTone: 'info' | 'warning' | 'success' | 'primary';
  label: string;
  value: string;
  sub: string;
}) {
  const tones = {
    info: { bg: color.infoBg, fg: color.info },
    warning: { bg: color.warningBg, fg: color.warning },
    success: { bg: color.successBg, fg: color.success },
    primary: { bg: color.primaryBg, fg: color.primary },
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
          width: 36,
          height: 36,
          borderRadius: radius.md,
          background: t.bg,
          color: t.fg,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: text.xs,
            color: color.textMuted,
            fontWeight: weight.medium,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: text.lg,
            fontWeight: weight.bold,
            color: color.text,
            letterSpacing: '-0.3px',
            lineHeight: 1.2,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontSize: text.xs,
            color: color.textDim,
            marginTop: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {sub}
        </div>
      </div>
    </div>
  );
}
