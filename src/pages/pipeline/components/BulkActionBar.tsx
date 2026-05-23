import { useEffect, useRef, useState } from 'react';
import { X, ChevronDown, Trophy, XCircle, ArrowRight } from 'lucide-react';
import { color, radius, space, text, weight, duration, ease } from '../../../tokens';
import { confirmAsync } from '../../../lib/confirmAsync';
import type { LeadStage } from '../../../types/domain';
import { usePipelineStages } from '../usePipelineStages';

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  onChangeStage: (stage: LeadStage) => void;
}

/**
 * Barra de acciones masivas que aparece cuando hay leads seleccionados.
 * Posicionada `position: fixed` al bottom — flota encima del kanban
 * sin desplazar el layout.
 */
export function BulkActionBar({ count, onClear, onChangeStage }: BulkActionBarProps) {
  const [moveOpen, setMoveOpen] = useState(false);
  const moveWrapRef = useRef<HTMLDivElement>(null);
  const { stages: STAGES } = usePipelineStages();
  const lostStage = STAGES.find((s) => s.isLost);

  useEffect(() => {
    if (!moveOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (moveWrapRef.current && !moveWrapRef.current.contains(e.target as Node)) {
        setMoveOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMoveOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [moveOpen]);

  async function move(stage: LeadStage) {
    if (lostStage && stage === lostStage.id) {
      const ok = await confirmAsync({
        title: "Marcar como perdidos",
        message: `¿Marcar ${count} ${count === 1 ? 'lead' : 'leads'} como perdido?`,
        confirmText: "Marcar perdidos",
        tone: "danger",
      });
      if (!ok) return;
    }
    onChangeStage(stage);
    setMoveOpen(false);
  }

  const moveOptions = STAGES.filter((s) => !s.terminal);

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: space[2],
        padding: `${space[2]} ${space[3]}`,
        background: color.surface,
        border: `1px solid ${color.borderStrong}`,
        borderRadius: radius.lg,
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <span
        style={{
          fontSize: text.sm,
          fontWeight: weight.semibold,
          color: color.text,
          padding: `0 ${space[2]}`,
        }}
      >
        {count} {count === 1 ? 'lead' : 'leads'} seleccionado{count === 1 ? '' : 's'}
      </span>

      <span
        aria-hidden
        style={{ width: 1, height: 22, background: color.border }}
      />

      <div ref={moveWrapRef} style={{ position: 'relative' }}>
        <ToolbarBtn onClick={() => setMoveOpen((v) => !v)}>
          <ArrowRight size={13} />
          Mover a
          <ChevronDown size={11} />
        </ToolbarBtn>
        {moveOpen && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 6px)',
              left: 0,
              minWidth: 200,
              background: color.surface,
              border: `1px solid ${color.borderStrong}`,
              borderRadius: radius.md,
              boxShadow: 'var(--shadow-lg)',
              padding: 4,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {moveOptions.map((s) => (
              <button
                key={s.id}
                onClick={() => move(s.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: space[2],
                  padding: `7px ${space[3]}`,
                  background: 'transparent',
                  color: color.text,
                  fontSize: text.sm,
                  fontWeight: weight.medium,
                  textAlign: 'left',
                  borderRadius: radius.sm,
                  cursor: 'pointer',
                  transition: `background ${duration.fast} ${ease}`,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = color.surfaceHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <ArrowRight size={12} color={color.textDim} />
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {(() => {
        const wonStage = STAGES.find((s) => s.isWon);
        return wonStage ? (
          <ToolbarBtn tone="success" onClick={() => move(wonStage.id)}>
            <Trophy size={13} />
            Marcar ganados
          </ToolbarBtn>
        ) : null;
      })()}

      {lostStage && (
        <ToolbarBtn tone="danger" onClick={() => move(lostStage.id)}>
          <XCircle size={13} />
          Marcar perdidos
        </ToolbarBtn>
      )}

      <span
        aria-hidden
        style={{ width: 1, height: 22, background: color.border }}
      />

      <button
        onClick={onClear}
        title="Limpiar selección (Esc)"
        aria-label="Limpiar selección"
        style={{
          width: 28,
          height: 28,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.sm,
          color: color.textMuted,
          background: 'transparent',
          cursor: 'pointer',
          transition: `background ${duration.fast} ${ease}`,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = color.surfaceHover)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function ToolbarBtn({
  children,
  tone,
  onClick,
}: {
  children: React.ReactNode;
  tone?: 'success' | 'danger';
  onClick: () => void;
}) {
  const baseColor =
    tone === 'success' ? color.success : tone === 'danger' ? color.danger : color.text;
  const hoverBg =
    tone === 'success'
      ? color.successBg
      : tone === 'danger'
      ? color.dangerBg
      : color.surfaceHover;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: `7px ${space[3]}`,
        background: 'transparent',
        color: baseColor,
        fontSize: text.sm,
        fontWeight: weight.semibold,
        borderRadius: radius.sm,
        cursor: 'pointer',
        transition: `background ${duration.fast} ${ease}`,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = hoverBg)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}
