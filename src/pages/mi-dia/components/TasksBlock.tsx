import { CheckSquare, Check, Clock, Circle, Lock, Plus, Minus } from 'lucide-react';
import { SectionCard, SectionRow } from './SectionCard';
import { EmptyState } from '../../../components/EmptyState';
import { Badge } from '../../../components/Badge';
import { color, radius, space, text, weight } from '../../../tokens';
import { formatRelative } from '../../../lib/format';
import type { Task } from '../../../types/domain';

interface TasksBlockProps {
  tasks: Task[];
  onToggleTask: (id: string) => void;
  onTaskClick: (task: Task) => void;
  onViewAll: () => void;
  onCreateTask: () => void;
  /** Para tareas con contador (target_count) — +1 / -1. Solo se renderiza
   *  el botón si la tarea tiene templateId + targetCount. */
  onProgressDelta?: (taskId: string, delta: 1 | -1) => void;
}

export function TasksBlock({ tasks, onToggleTask, onTaskClick, onViewAll, onCreateTask, onProgressDelta }: TasksBlockProps) {
  const overdueCount = tasks.filter(
    (t) => t.dueAt && new Date(t.dueAt).getTime() < Date.now() && t.status === 'pending'
  ).length;

  return (
    <SectionCard
      title="Tareas para hoy"
      count={tasks.length}
      countTone={overdueCount > 0 ? 'warning' : 'neutral'}
      subtitle={overdueCount > 0 ? `${overdueCount} atrasada${overdueCount > 1 ? 's' : ''}` : undefined}
      icon={<CheckSquare size={16} strokeWidth={2.2} />}
      iconTone="primary"
      onViewAll={onViewAll}
    >
      {tasks.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<Check size={20} />}
          title="Sin tareas pendientes"
          description="Estás al día con todo. Buen trabajo."
          action={{ label: 'Crear tarea', onClick: onCreateTask }}
        />
      ) : (
        tasks.map((task, idx) => (
          <TaskRow
            key={task.id}
            task={task}
            onToggle={() => onToggleTask(task.id)}
            onClick={() => onTaskClick(task)}
            onProgressDelta={onProgressDelta}
            isLast={idx === tasks.length - 1}
          />
        ))
      )}
    </SectionCard>
  );
}

/* ============================================================
 *  TaskRow
 * ============================================================ */

function TaskRow({
  task,
  onToggle,
  onClick,
  onProgressDelta,
  isLast,
}: {
  task: Task;
  onToggle: () => void;
  onClick: () => void;
  onProgressDelta?: (taskId: string, delta: 1 | -1) => void;
  isLast: boolean;
}) {
  const isOverdue = task.dueAt && new Date(task.dueAt).getTime() < Date.now() && task.status === 'pending';
  const isDone = task.status === 'done';
  const isMandatory = !!task.templateId;
  const hasCounter = isMandatory && typeof task.targetCount === 'number' && task.targetCount > 0;
  const progress = task.progress ?? 0;
  const target = task.targetCount ?? 0;

  return (
    <SectionRow onClick={onClick} isLast={isLast}>
      {/* Checkbox — bloqueado en tareas con contador (se completan al
          llegar a target_count) o se manejan con el toggle si no tienen
          contador. */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!hasCounter) onToggle();
        }}
        disabled={hasCounter}
        title={hasCounter ? 'Se completa automáticamente al llegar a la meta' : undefined}
        aria-label={isDone ? 'Marcar como pendiente' : 'Marcar como completada'}
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: radius.sm,
          color: '#FFFFFF',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: hasCounter ? 'default' : 'pointer',
          opacity: hasCounter && !isDone ? 0.5 : 1,
        }}
        className={`task-checkbox${isDone ? ' done' : ''}`}
      >
        {isDone && <Check size={14} strokeWidth={3} />}
      </button>

      {/* Title + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: text.sm,
            fontWeight: weight.medium,
            color: isDone ? color.textMuted : color.text,
            textDecoration: isDone ? 'line-through' : 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {task.title}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: space[2],
            marginTop: 2,
            fontSize: text.xs,
            color: color.textMuted,
          }}
        >
          {task.clientName && <span>{task.clientName}</span>}
          {task.dueAt && (
            <>
              {task.clientName && <Dot />}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  color: isOverdue ? color.warning : color.textMuted,
                  fontWeight: isOverdue ? weight.semibold : weight.regular,
                }}
              >
                <Clock size={11} strokeWidth={2.2} />
                {formatRelative(task.dueAt, { kind: 'due' })}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Contador +1/-1 para tareas obligatorias con target_count */}
      {hasCounter && onProgressDelta && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <button
            onClick={() => onProgressDelta(task.id, -1)}
            disabled={progress <= 0}
            className="btn-icon muted"
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Restar 1"
          >
            <Minus size={12} strokeWidth={2.4} />
          </button>
          <span
            style={{
              minWidth: 44,
              textAlign: 'center',
              fontSize: text.xs,
              fontWeight: weight.bold,
              color: isDone ? color.success : color.text,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {progress}/{target}
          </span>
          <button
            onClick={() => onProgressDelta(task.id, 1)}
            disabled={progress >= target}
            className="btn-icon success-bg"
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              color: color.success,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Sumar 1"
          >
            <Plus size={12} strokeWidth={2.4} />
          </button>
        </div>
      )}

      {/* Priority badge */}
      {task.priority === 'high' && !isDone && (
        <Badge tone="danger" size="sm" dot>
          Alta
        </Badge>
      )}
      {/* Badge "Obligatoria" — tarea materializada de un template. Visualmente
          gana sobre el badge "Rutina" para no duplicar (las obligatorias
          también son rutinas). */}
      {isMandatory ? (
        <Badge tone="primary" size="sm">
          <Lock size={9} strokeWidth={2.4} style={{ marginRight: 2 }} />
          Obligatoria
        </Badge>
      ) : task.type === 'rutina' ? (
        <Badge tone="info" size="sm">
          Rutina
        </Badge>
      ) : null}
    </SectionRow>
  );
}

function Dot() {
  return (
    <Circle size={3} fill={color.textDim} stroke={color.textDim} style={{ flexShrink: 0 }} />
  );
}
