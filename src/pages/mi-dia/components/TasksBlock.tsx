import { useState } from 'react';
import { CheckSquare, Check, Clock, Circle } from 'lucide-react';
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
}

export function TasksBlock({ tasks, onToggleTask, onTaskClick, onViewAll, onCreateTask }: TasksBlockProps) {
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
  isLast,
}: {
  task: Task;
  onToggle: () => void;
  onClick: () => void;
  isLast: boolean;
}) {
  const isOverdue = task.dueAt && new Date(task.dueAt).getTime() < Date.now() && task.status === 'pending';
  const isDone = task.status === 'done';

  return (
    <SectionRow onClick={onClick} isLast={isLast}>
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={isDone ? 'Marcar como pendiente' : 'Marcar como completada'}
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: radius.sm,
          border: `2px solid ${isDone ? color.success : color.border}`,
          background: isDone ? color.success : 'transparent',
          color: '#FFFFFF',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 150ms',
        }}
        onMouseEnter={(e) => {
          if (!isDone) e.currentTarget.style.borderColor = color.primary;
        }}
        onMouseLeave={(e) => {
          if (!isDone) e.currentTarget.style.borderColor = color.border;
        }}
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

      {/* Priority badge */}
      {task.priority === 'high' && !isDone && (
        <Badge tone="danger" size="sm" dot>
          Alta
        </Badge>
      )}
      {task.type === 'rutina' && (
        <Badge tone="info" size="sm">
          Rutina
        </Badge>
      )}
    </SectionRow>
  );
}

function Dot() {
  return (
    <Circle size={3} fill={color.textDim} stroke={color.textDim} style={{ flexShrink: 0 }} />
  );
}
