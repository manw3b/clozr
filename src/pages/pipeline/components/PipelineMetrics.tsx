import { TrendingUp, DollarSign, Target, Trophy, AlertCircle } from 'lucide-react';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney } from '../../../lib/format';
import type { Lead } from '../../../types/domain';
import { usePipelineStages } from '../usePipelineStages';

interface PipelineMetricsProps {
  leads: Lead[];
}

const STUCK_DAYS = 7;

/**
 * Tira de métricas arriba del kanban.
 *
 * - Total pipeline: suma de TODOS los leads activos (excluye cerrado/perdido)
 * - Weighted: pondera el monto por probabilidad de cierre de cada stage
 * - Cerrado del mes: suma de leads que pasaron a cerrado este mes
 * - Win rate: % de cerrados / (cerrados + perdidos)
 *
 * Debajo: tira "Por etapa" con count + promedio de días en cada etapa
 * no-terminal, para identificar cuellos de botella.
 */
export function PipelineMetrics({ leads }: PipelineMetricsProps) {
  const { stages: STAGES } = usePipelineStages();
  const stageById = new Map(STAGES.map((s) => [s.id, s]));
  const isTerminal = (stageId: string) => stageById.get(stageId)?.terminal === true;
  const isWon = (stageId: string) => stageById.get(stageId)?.isWon === true;
  const isLost = (stageId: string) => stageById.get(stageId)?.isLost === true;

  const active = leads.filter((l) => !isTerminal(l.stage));
  const closed = leads.filter((l) => isWon(l.stage));
  const lost = leads.filter((l) => isLost(l.stage));

  const totalPipeline = active.reduce((sum, l) => sum + (l.amount || 0), 0);

  const weighted = active.reduce((sum, l) => {
    const stageConfig = STAGES.find((s) => s.id === l.stage);
    const probability = stageConfig?.probability || 0;
    return sum + (l.amount || 0) * probability;
  }, 0);

  const monthClosed = closed.reduce((sum, l) => sum + (l.amount || 0), 0);

  const totalDecided = closed.length + lost.length;
  const winRate = totalDecided > 0 ? (closed.length / totalDecided) * 100 : 0;

  // Estancados: activos con >= STUCK_DAYS en su etapa actual.
  const now = Date.now();
  const stuckCount = active.filter((l) => {
    if (!l.stageChangedAt) return false;
    const days = Math.floor((now - new Date(l.stageChangedAt).getTime()) / 86_400_000);
    return days >= STUCK_DAYS && l.priority !== 'hot';
  }).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: space[3],
        }}
      >
        <Metric
          icon={<TrendingUp size={14} strokeWidth={2.4} />}
          iconTone="info"
          label="Pipeline activo"
          value={formatMoney(totalPipeline)}
          sub={`${active.length} ${active.length === 1 ? 'lead' : 'leads'}`}
          accent={
            stuckCount > 0
              ? {
                  icon: <AlertCircle size={11} />,
                  text: `${stuckCount} ${stuckCount === 1 ? 'estancado' : 'estancados'}`,
                  tone: 'warning',
                }
              : undefined
          }
        />
        <Metric
          icon={<Target size={14} strokeWidth={2.4} />}
          iconTone="warning"
          label="Pondera­do"
          value={formatMoney(weighted)}
          sub="Por probabilidad"
        />
        <Metric
          icon={<DollarSign size={14} strokeWidth={2.4} />}
          iconTone="success"
          label="Cerrado este mes"
          value={formatMoney(monthClosed)}
          sub={`${closed.length} ${closed.length === 1 ? 'venta' : 'ventas'}`}
        />
        <Metric
          icon={<Trophy size={14} strokeWidth={2.4} />}
          iconTone="primary"
          label="Win rate"
          value={`${winRate.toFixed(0)}%`}
          sub={`${closed.length} ganados / ${lost.length} perdidos`}
        />
      </div>

      <StageBreakdown leads={active} />
    </div>
  );
}

/* ============================================================
 *  StageBreakdown — tira horizontal con count + avg días por etapa
 * ============================================================ */

function StageBreakdown({ leads }: { leads: Lead[] }) {
  const { stages: STAGES } = usePipelineStages();
  const now = Date.now();
  const nonTerminal = STAGES.filter((s) => !s.terminal);

  const byStage = nonTerminal.map((stage) => {
    const inStage = leads.filter((l) => l.stage === stage.id);
    let avgDays = 0;
    if (inStage.length > 0) {
      const total = inStage.reduce((sum, l) => {
        if (!l.stageChangedAt) return sum;
        return sum + Math.floor((now - new Date(l.stageChangedAt).getTime()) / 86_400_000);
      }, 0);
      avgDays = Math.round(total / inStage.length);
    }
    return { stage: stage.id, label: stage.label, count: inStage.length, avgDays };
  });

  return (
    <div
      style={{
        display: 'flex',
        gap: space[2],
        padding: `${space[2]} ${space[3]}`,
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        overflowX: 'auto',
      }}
    >
      {byStage.map((s, i) => (
        <StagePill
          key={s.stage}
          label={s.label}
          count={s.count}
          avgDays={s.avgDays}
          last={i === byStage.length - 1}
        />
      ))}
    </div>
  );
}

function StagePill({
  label,
  count,
  avgDays,
  last,
}: {
  label: string;
  count: number;
  avgDays: number;
  last: boolean;
}) {
  const isEmpty = count === 0;
  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          minWidth: 0,
          flex: 1,
          padding: `4px ${space[2]}`,
          opacity: isEmpty ? 0.45 : 1,
        }}
        title={
          isEmpty
            ? `${label}: sin leads`
            : `${label}: ${count} ${count === 1 ? 'lead' : 'leads'}, promedio ${avgDays} ${avgDays === 1 ? 'día' : 'días'} en etapa`
        }
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: weight.semibold,
            color: color.textDim,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span
            style={{
              fontSize: text.base,
              fontWeight: weight.bold,
              color: color.text,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {count}
          </span>
          {!isEmpty && (
            <span style={{ fontSize: text.xs, color: color.textMuted }}>
              · {avgDays}d prom.
            </span>
          )}
        </span>
      </div>
      {!last && (
        <span
          aria-hidden
          style={{
            width: 1,
            background: color.border,
            margin: `4px 0`,
            flexShrink: 0,
          }}
        />
      )}
    </>
  );
}


function Metric({
  icon,
  iconTone,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  iconTone: 'info' | 'warning' | 'success' | 'primary';
  label: string;
  value: string;
  sub: string;
  accent?: { icon: React.ReactNode; text: string; tone: 'warning' | 'danger' };
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
        borderRadius: radius.md,
        padding: `${space[2]} ${space[3]}`,
        display: 'flex',
        alignItems: 'center',
        gap: space[3],
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: radius.sm,
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
            fontSize: 10,
            color: color.textMuted,
            fontWeight: weight.semibold,
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: 1,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: text.base,
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
            display: 'flex',
            alignItems: 'center',
            gap: space[2],
            marginTop: 1,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: text.xs,
              color: color.textDim,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {sub}
          </span>
          {accent && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: text.xs,
                fontWeight: weight.semibold,
                color: accent.tone === 'danger' ? color.danger : color.warning,
                whiteSpace: 'nowrap',
              }}
            >
              {accent.icon}
              {accent.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
