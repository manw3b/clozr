import { TrendingUp, DollarSign, Receipt, Trophy, AlertCircle } from 'lucide-react';
import { colorCss, colorBg } from '../../../lib/colorPalette';
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
 * - Pipeline activo: suma de leads activos (excluye terminal — ganado/perdido).
 * - Ticket promedio: pipeline activo / leads activos. Más concreto que el
 *   "ponderado" anterior (que dependía de probabilidades fijas por etapa
 *   que ya no existen con etapas dinámicas).
 * - Cerrado este mes: suma de leads que pasaron a la etapa "ganada" este mes.
 * - Win rate: % de ganados / decididos.
 *
 * Debajo: tira "Por etapa" con count + total monetario + avg días por etapa
 * no-terminal, con una barra mini que visualiza la distribución de $.
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

  // Ticket promedio = pipeline / count (sin contar leads sin monto explícito,
  // para que un lead "Pyt" sin estimación no nos infle el promedio a 0).
  const leadsWithAmount = active.filter((l) => (l.amount ?? 0) > 0);
  const avgTicket =
    leadsWithAmount.length > 0
      ? leadsWithAmount.reduce((s, l) => s + (l.amount ?? 0), 0) / leadsWithAmount.length
      : 0;

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
          icon={<Receipt size={14} strokeWidth={2.4} />}
          iconTone="warning"
          label="Ticket promedio"
          value={leadsWithAmount.length > 0 ? formatMoney(avgTicket) : '—'}
          sub={
            leadsWithAmount.length === active.length
              ? 'Por lead activo'
              : `${leadsWithAmount.length} de ${active.length} con monto`
          }
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
    const total = inStage.reduce((sum, l) => sum + (l.amount ?? 0), 0);
    let avgDays = 0;
    if (inStage.length > 0) {
      const sumDays = inStage.reduce((sum, l) => {
        if (!l.stageChangedAt) return sum;
        return sum + Math.floor((now - new Date(l.stageChangedAt).getTime()) / 86_400_000);
      }, 0);
      avgDays = Math.round(sumDays / inStage.length);
    }
    return {
      stage: stage.id,
      label: stage.label,
      stageColor: stage.color,
      count: inStage.length,
      avgDays,
      total,
    };
  });

  // Para la barrita de distribución relativa: encontramos el max por monto
  // (o por count si nadie tiene monto, así igual se ve algo).
  const maxAmount = Math.max(0, ...byStage.map((s) => s.total));
  const maxCount = Math.max(0, ...byStage.map((s) => s.count));

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
      {byStage.map((s, i) => {
        // Bar mide $ relativo al max; si no hay $, cae al count relativo.
        const ratio =
          maxAmount > 0
            ? s.total / maxAmount
            : maxCount > 0
            ? s.count / maxCount
            : 0;
        return (
          <StagePill
            key={s.stage}
            label={s.label}
            stageColor={s.stageColor}
            count={s.count}
            avgDays={s.avgDays}
            total={s.total}
            barRatio={ratio}
            last={i === byStage.length - 1}
          />
        );
      })}
    </div>
  );
}

function StagePill({
  label,
  stageColor,
  count,
  avgDays,
  total,
  barRatio,
  last,
}: {
  label: string;
  stageColor: string;
  count: number;
  avgDays: number;
  total: number;
  /** Ratio 0..1 para la barrita de distribución relativa entre etapas. */
  barRatio: number;
  last: boolean;
}) {
  const isEmpty = count === 0;
  const accent = colorCss(stageColor);
  const accentBg = colorBg(stageColor, 0.15);
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
          opacity: isEmpty ? 0.5 : 1,
        }}
        title={
          isEmpty
            ? `${label}: sin leads`
            : `${label}: ${count} ${count === 1 ? 'lead' : 'leads'}` +
              (total > 0 ? ` · ${formatMoney(total)}` : '') +
              ` · promedio ${avgDays} ${avgDays === 1 ? 'día' : 'días'} en etapa`
        }
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
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
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: accent,
              flexShrink: 0,
            }}
          />
          {label}
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
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
          {total > 0 && (
            <span
              style={{
                fontSize: text.xs,
                fontWeight: weight.semibold,
                color: color.textMuted,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {formatMoney(total)}
            </span>
          )}
          {!isEmpty && total === 0 && (
            <span style={{ fontSize: text.xs, color: color.textDim }}>
              · {avgDays}d prom.
            </span>
          )}
          {!isEmpty && total > 0 && (
            <span style={{ fontSize: text.xs, color: color.textDim, whiteSpace: 'nowrap' }}>
              · {avgDays}d
            </span>
          )}
        </span>
        {/* Barrita: visualiza el peso de la etapa relativo al resto. */}
        <span
          aria-hidden
          style={{
            display: 'block',
            marginTop: 4,
            height: 3,
            width: '100%',
            background: accentBg,
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              display: 'block',
              height: '100%',
              width: `${Math.round(barRatio * 100)}%`,
              background: accent,
              borderRadius: 2,
              transition: 'width 240ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
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
