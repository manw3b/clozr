import { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Check, X, Target } from 'lucide-react';
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
  /** Setea el objetivo en USD del workspace activo. Si no se pasa, se oculta
   *  el control de edición (defensivo para previews/storybook). */
  onSetGoal?: (amountUsd: number) => void;
  /** Setea el objetivo de cantidad de ventas del workspace activo. */
  onSetSalesGoal?: (count: number) => void;
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
  onSetGoal,
  onSetSalesGoal,
}: MyDayHeroProps) {
  const progress = goal.amount > 0 ? Math.min(100, (goal.current / goal.amount) * 100) : 0;
  const remaining = Math.max(0, goal.amount - goal.current);
  const hasGoal = goal.amount > 0;
  const canEdit = !!onSetGoal;
  const canEditSalesGoal = !!onSetSalesGoal;

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
          {hasGoal ? (
            <>
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
                  <SalesGoalChip
                    salesCount={goal.salesCount}
                    salesGoal={goal.salesGoal}
                    onSave={canEditSalesGoal ? onSetSalesGoal : undefined}
                  />
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

              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: space[2],
                  marginBottom: space[2],
                }}
              >
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
                {canEdit && (
                  <GoalEditButton current={goal.amount} onSave={onSetGoal!} />
                )}
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
            </>
          ) : (
            <GoalEmptyState onSetGoal={canEdit ? onSetGoal! : undefined} />
          )}
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
 *  SalesGoalChip — pill que muestra "X de Y ventas" y se edita inline
 * ============================================================ */

function SalesGoalChip({
  salesCount,
  salesGoal,
  onSave,
}: {
  salesCount: number;
  salesGoal?: number | null;
  onSave?: (count: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(salesGoal ?? ''));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      setDraft(salesGoal ? String(salesGoal) : '');
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, salesGoal]);

  function commit() {
    const n = parseInt(draft, 10);
    setEditing(false);
    if (!Number.isFinite(n) || n < 0) return;
    if (n === (salesGoal ?? 0)) return;
    onSave?.(n);
  }

  if (editing) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          padding: '2px 6px',
          background: color.surface,
          border: `1px solid ${color.borderStrong}`,
          borderRadius: radius.sm,
        }}
      >
        <span style={{ fontSize: text.xs, color: color.textDim, fontWeight: weight.semibold }}>
          {salesCount} de
        </span>
        <input
          ref={inputRef}
          type="number"
          min={0}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={commit}
          placeholder="0"
          style={{
            width: 36,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: text.xs,
            fontWeight: weight.semibold,
            color: color.text,
            padding: 0,
            textAlign: 'center',
          }}
        />
        <span style={{ fontSize: text.xs, color: color.textDim, fontWeight: weight.semibold }}>
          ventas
        </span>
      </span>
    );
  }

  // Display mode: compact pill, click para editar
  const isClickable = !!onSave;
  return (
    <button
      type="button"
      onClick={isClickable ? () => setEditing(true) : undefined}
      disabled={!isClickable}
      style={{
        fontSize: text.xs,
        fontWeight: weight.semibold,
        color: color.textDim,
        background: 'transparent',
        cursor: isClickable ? 'pointer' : 'default',
        padding: '2px 6px',
        borderRadius: radius.sm,
        border: `1px dashed ${salesGoal ? 'transparent' : color.border}`,
        transition: 'background 100ms, color 100ms, border-color 100ms',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
      }}
      onMouseEnter={(e) => {
        if (isClickable) {
          e.currentTarget.style.color = color.text;
          e.currentTarget.style.background = color.surfaceHover;
        }
      }}
      onMouseLeave={(e) => {
        if (isClickable) {
          e.currentTarget.style.color = color.textDim;
          e.currentTarget.style.background = 'transparent';
        }
      }}
      title={isClickable ? 'Editar objetivo de ventas' : undefined}
    >
      {salesGoal ? (
        <>
          {salesCount} de {salesGoal} {plural(salesGoal, 'venta', 'ventas')}
        </>
      ) : (
        <>+ objetivo de ventas</>
      )}
    </button>
  );
}

/* ============================================================
 *  GoalEmptyState — mostrado cuando aún no hay objetivo seteado
 * ============================================================ */

function GoalEmptyState({ onSetGoal }: { onSetGoal?: (amountUsd: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) requestAnimationFrame(() => inputRef.current?.focus());
  }, [editing]);

  function commit() {
    const n = parseFloat(draft);
    if (!Number.isFinite(n) || n <= 0) {
      setEditing(false);
      setDraft('');
      return;
    }
    onSetGoal?.(n);
    setEditing(false);
    setDraft('');
  }

  if (!editing) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space[3],
          padding: `${space[3]} ${space[4]}`,
          background: 'rgba(225, 29, 72, 0.06)',
          border: `1px dashed ${color.primary}`,
          borderRadius: radius.md,
        }}
      >
        <Target size={18} color={color.primary} strokeWidth={2.2} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: text.sm,
              fontWeight: weight.semibold,
              color: color.text,
              marginBottom: 2,
            }}
          >
            Configurá tu objetivo del día
          </div>
          <div style={{ fontSize: text.xs, color: color.textMuted }}>
            En USD. Lo podés cambiar cuando quieras.
          </div>
        </div>
        {onSetGoal && (
          <button
            onClick={() => setEditing(true)}
            style={{
              padding: `${space[2]} ${space[3]}`,
              background: color.primary,
              color: '#fff',
              borderRadius: radius.sm,
              fontSize: text.sm,
              fontWeight: weight.semibold,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Configurar
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[2],
        padding: `${space[3]} ${space[4]}`,
        background: color.surface,
        border: `1px solid ${color.borderStrong}`,
        borderRadius: radius.md,
      }}
    >
      <span style={{ fontSize: text.sm, color: color.textMuted, fontWeight: weight.medium }}>
        US$
      </span>
      <input
        ref={inputRef}
        type="number"
        min={1}
        step="any"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setEditing(false);
            setDraft('');
          }
        }}
        placeholder="500"
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: text.lg,
          fontWeight: weight.bold,
          color: color.text,
          padding: 0,
        }}
      />
      <button
        onClick={commit}
        title="Guardar (Enter)"
        style={{
          width: 30,
          height: 30,
          borderRadius: radius.sm,
          background: color.primary,
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <Check size={16} />
      </button>
      <button
        onClick={() => {
          setEditing(false);
          setDraft('');
        }}
        title="Cancelar (Esc)"
        style={{
          width: 30,
          height: 30,
          borderRadius: radius.sm,
          background: 'transparent',
          color: color.textMuted,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

/* ============================================================
 *  GoalEditButton — pencil icon que abre input inline para editar el goal
 * ============================================================ */

function GoalEditButton({
  current,
  onSave,
}: {
  current: number;
  onSave: (amountUsd: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(current));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      setDraft(String(current));
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, current]);

  function commit() {
    const n = parseFloat(draft);
    if (!Number.isFinite(n) || n <= 0) {
      setEditing(false);
      return;
    }
    if (n !== current) onSave(n);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        title="Editar objetivo"
        aria-label="Editar objetivo"
        style={{
          marginLeft: space[1],
          width: 24,
          height: 24,
          borderRadius: radius.sm,
          color: color.textDim,
          background: 'transparent',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'color 100ms, background 100ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = color.text;
          e.currentTarget.style.background = color.surfaceHover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = color.textDim;
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <Pencil size={12} />
      </button>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        marginLeft: space[2],
        padding: `2px 6px`,
        background: color.surface,
        border: `1px solid ${color.borderStrong}`,
        borderRadius: radius.sm,
      }}
    >
      <span style={{ fontSize: text.xs, color: color.textMuted, fontWeight: weight.medium }}>
        US$
      </span>
      <input
        ref={inputRef}
        type="number"
        min={1}
        step="any"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        onBlur={commit}
        style={{
          width: 70,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: text.sm,
          fontWeight: weight.semibold,
          color: color.text,
          padding: 0,
        }}
      />
    </span>
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
