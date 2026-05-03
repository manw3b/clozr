import { useEffect, useRef, useState } from 'react';
import { Search, Plus, ChevronDown, Bell, Command } from 'lucide-react';
import { color, duration, ease, layout, radius, space, text, weight } from '../tokens';
import { Button } from '../components/Button';

interface TopbarProps {
  workspace: { name: string; emoji?: string };
  onSearchClick: () => void;
  onNewClick: () => void;
}

export function Topbar({ workspace, onSearchClick, onNewClick }: TopbarProps) {
  return (
    <header
      style={{
        height: layout.topbarH,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[4],
        padding: `0 ${space[5]}`,
        background: color.surface,
        borderBottom: `1px solid ${color.border}`,
        flexShrink: 0,
      }}
    >
      {/* IZQUIERDA — Workspace selector */}
      <WorkspaceSelector workspace={workspace} />

      {/* CENTRO — Búsqueda global */}
      <SearchTrigger onClick={onSearchClick} />

      {/* DERECHA — Acciones */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        <IconButton aria-label="Notificaciones" badge={3}>
          <Bell size={16} />
        </IconButton>
        <Button variant="primary" size="md" iconLeft={<Plus size={16} />} onClick={onNewClick}>
          Nuevo
        </Button>
      </div>
    </header>
  );
}

/* ===== Workspace selector ===== */

function WorkspaceSelector({ workspace }: { workspace: { name: string; emoji?: string } }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[2],
        padding: `${space[1]} ${space[2]} ${space[1]} ${space[1]}`,
        borderRadius: radius.md,
        background: hover ? color.surfaceHover : 'transparent',
        transition: `background ${duration.fast} ${ease}`,
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: radius.md,
          background: color.surface2,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        {workspace.emoji || '🏪'}
      </span>
      <span
        style={{
          fontSize: text.sm,
          fontWeight: weight.semibold,
          color: color.text,
          maxWidth: 180,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {workspace.name}
      </span>
      <ChevronDown size={14} color={color.textDim} strokeWidth={2.2} />
    </button>
  );
}

/* ===== Search global trigger (Cmd+K) ===== */

function SearchTrigger({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onClick();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClick]);

  return (
    <button
      ref={ref}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1,
        maxWidth: 480,
        height: 34,
        display: 'flex',
        alignItems: 'center',
        gap: space[2],
        padding: `0 ${space[3]}`,
        background: color.surface2,
        border: `1px solid ${hover ? color.borderStrong : color.border}`,
        borderRadius: radius.md,
        color: color.textDim,
        fontSize: text.sm,
        textAlign: 'left',
        transition: `border-color ${duration.fast} ${ease}`,
      }}
    >
      <Search size={15} strokeWidth={2.2} />
      <span style={{ flex: 1 }}>Buscar clientes, ventas, productos…</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          padding: '2px 5px',
          background: color.bg,
          border: `1px solid ${color.border}`,
          borderRadius: radius.sm,
          fontSize: text.xs,
          color: color.textMuted,
          fontWeight: weight.medium,
        }}
      >
        <Command size={10} strokeWidth={2.5} />K
      </span>
    </button>
  );
}

/* ===== Icon button con badge opcional ===== */

function IconButton({
  children,
  badge,
  ...rest
}: {
  children: React.ReactNode;
  badge?: number;
  'aria-label': string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        width: 36,
        height: 36,
        borderRadius: radius.md,
        background: hover ? color.surfaceHover : 'transparent',
        color: hover ? color.text : color.textMuted,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: `background ${duration.fast} ${ease}, color ${duration.fast} ${ease}`,
      }}
      {...rest}
    >
      {children}
      {typeof badge === 'number' && badge > 0 && (
        <span
          style={{
            position: 'absolute',
            top: 5,
            right: 5,
            minWidth: 14,
            height: 14,
            padding: '0 4px',
            background: color.primary,
            color: '#FFFFFF',
            fontSize: 9,
            fontWeight: weight.bold,
            borderRadius: radius.full,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `2px solid ${color.surface}`,
          }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}
