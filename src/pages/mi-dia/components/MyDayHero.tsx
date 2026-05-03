import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/Button';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatMoney, formatDateLong, greetText, plural } from '../../../lib/format';
import type { DailyGoal } from '../../../types/domain';

interface MyDayHeroProps {
  greeting: 'morning' | 'afternoon' | 'evening' | 'night';
  userName: string;
  date: string;
  workspaceName: string;
  goal: DailyGoal;
  score: number;
  onNewSale: () => void;
}

/**
 * Hero del día — primera impresión cuando el vendedor abre la app.
 *
 * Reemplaza tu "Mi Día" actual donde solo había un saludo y un score aislado.
 * Acá ponemos JUNTOS: saludo + objetivo + score + acción rápida principal.
 */
export function MyDayHero({
  greeting,
  userName,
  date,
  workspaceName,
  goal,
  score,
  onNewSale,
}: MyDayHeroProps) {
  const progress = goal.amount > 0 ? Math.min(100, (goal.current / goal.amount) * 100) : 0;
  const remaining = Math.max(0, goal.amount - goal.current);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: space[6],
        alignItems: 'center',
        padding: `${space[6]} ${space[8]}`,
        background: `linear-gradient(135deg, ${color.surface} 0%, var(--surface-2) 100%)`,
        border: `1px solid ${color.border}`,
        borderRadius: radius.xl,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decoración de fondo: sutil gradiente rojo en la esquina */}
      <div
        style={{
          position: 'absolute',
          top: -120,
          right: -120,
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${color.primary} 0%, transparent 70%)`,
          opacity: 0.15,
          pointerEvents: 'none',
        }}
      />

      {/* IZQUIERDA — saludo + objetivo */}
      <div style={{ position: 'relative', zIndex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: space[2],
            marginBottom: space[1],
          }}
        >
          <span
            style={{
              fontSize: text.xs,
              fontWeight: weight.semibold,
              color: color.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            {workspaceName} · {formatDateLong(date)}
          </span>
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: text['3xl'],
            fontWeight: weight.bold,
            color: color.text,
            letterSpacing: '-0.8px',
            lineHeight: 1.1,
            marginBottom: space[5],
          }}
        >
          {greetText(greeting)}, {userName}
        </h1>

        {/* Objetivo del día */}
        <div style={{ maxWidth: 520 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: space[2],
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
              <span
                style={{
                  fontSize: text.sm,
                  color: color.textMuted,
                  fontWeight: weight.medium,
                }}
              >
                Objetivo del día
              </span>
              <span
                style={{
                  fontSize: text.xs,
                  fontWeight: weight.semibold,
                  color: color.textDim,
                }}
              >
                {goal.salesCount} de {goal.salesGoal || '?'} {plural(goal.salesGoal || 0, 'venta', 'ventas')}
              </span>
            </div>
            <span
              style={{
                fontSize: text.sm,
                fontWeight: weight.semibold,
                color: progress >= 100 ? color.success : color.text,
              }}
            >
              {progress.toFixed(0)}%
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[2] }}>
            <span
              style={{
                fontSize: text['2xl'],
                fontWeight: weight.bold,
                color: color.text,
                letterSpacing: '-0.5px',
                lineHeight: 1,
              }}
            >
              {formatMoney(goal.current)}
            </span>
            <span
              style={{
                fontSize: text.sm,
                color: color.textMuted,
                fontWeight: weight.medium,
              }}
            >
              de {formatMoney(goal.amount)}
            </span>
          </div>

          <ProgressBar value={progress} />

          <div
            style={{
              marginTop: space[2],
              fontSize: text.sm,
              color: color.textMuted,
            }}
          >
            {progress >= 100 ? (
              <span style={{ color: color.success, fontWeight: weight.semibold }}>
                ¡Objetivo cumplido! 🎯
              </span>
            ) : (
              <>
                Faltan{' '}
                <span style={{ color: color.text, fontWeight: weight.semibold }}>
                  {formatMoney(remaining)}
                </span>{' '}
                para el objetivo
              </>
            )}
          </div>
        </div>
      </div>

      {/* DERECHA — score + CTA */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: space[4],
          position: 'relative',
          zIndex: 1,
        }}
      >
        <ScoreRing value={score} />
        <Button
          variant="primary"
          size="lg"
          iconLeft={<Plus size={18} />}
          onClick={onNewSale}
        >
          Nueva venta
        </Button>
      </div>
    </div>
  );
}

/* ============================================================
 *  ProgressBar — barra de progreso del objetivo
 * ============================================================ */

function ProgressBar({ value }: { value: number }) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(value), 50);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div
      style={{
        height: 8,
        background: color.surface2,
        borderRadius: radius.full,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          width: `${animated}%`,
          height: '100%',
          background:
            value >= 100
              ? `linear-gradient(90deg, ${color.success} 0%, #34D399 100%)`
              : `linear-gradient(90deg, ${color.primary} 0%, ${color.primaryHover} 100%)`,
          borderRadius: radius.full,
          transition: 'width 800ms cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: value > 0 ? `0 0 12px ${color.primary}66` : 'none',
        }}
      />
    </div>
  );
}

/* ============================================================
 *  ScoreRing — anillo circular del score del día
 * ============================================================ */

function ScoreRing({ value }: { value: number }) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(value), 100);
    return () => clearTimeout(t);
  }, [value]);

  const size = 96;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (animated / 100) * circumference;

  const ringColor =
    value >= 80 ? color.success : value >= 50 ? color.primary : color.warning;

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color.surface2}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ringColor}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 1200ms cubic-bezier(0.4, 0, 0.2, 1)',
            filter: `drop-shadow(0 0 8px ${ringColor}66)`,
          }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: text.xl,
            fontWeight: weight.bold,
            color: ringColor,
            lineHeight: 1,
            letterSpacing: '-0.5px',
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontSize: 9,
            fontWeight: weight.bold,
            color: color.textDim,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginTop: 2,
          }}
        >
          Score
        </div>
      </div>
    </div>
  );
}
