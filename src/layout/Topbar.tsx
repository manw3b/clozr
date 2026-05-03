import { useEffect, useRef, useState } from 'react';
import {
  Search,
  Plus,
  ChevronDown,
  Bell,
  Command,
  Users,
  ShoppingCart,
  GitBranch,
  CheckSquare,
  Wallet,
  AlertCircle,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { color, duration, ease, layout, radius, space, text, weight } from '../tokens';
import { Button } from '../components/Button';
import { useNotifications, type NotificationItem } from '../lib/notifications';

export type NewAction = 'cliente' | 'venta' | 'lead' | 'tarea' | 'movimiento';
export type NotifNavigate = 'tasks' | 'cash' | 'pipeline';

interface TopbarProps {
  workspace: { name: string; emoji?: string };
  onSearchClick: () => void;
  onNewAction: (action: NewAction) => void;
  onNotificationClick: (screen: NotifNavigate) => void;
}

export function Topbar({ workspace, onSearchClick, onNewAction, onNotificationClick }: TopbarProps) {
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
        <NotificationsMenu onNavigate={onNotificationClick} />
        <NewMenu onAction={onNewAction} />
      </div>
    </header>
  );
}

/* ===== Notifications dropdown ===== */

function NotificationsMenu({ onNavigate }: { onNavigate: (s: NotifNavigate) => void }) {
  const { data } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const total = data?.counts.total ?? 0;
  const items = data?.items ?? [];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', onClickOutside);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onClickOutside);
        document.removeEventListener('keydown', onKey);
      };
    }
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <IconButton aria-label="Notificaciones" badge={total} onClick={() => setOpen((v) => !v)}>
        <Bell size={16} />
      </IconButton>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 360,
            maxHeight: 480,
            background: color.surface,
            border: `1px solid ${color.borderStrong}`,
            borderRadius: radius.md,
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 50,
          }}
        >
          <header
            style={{
              padding: `${space[3]} ${space[4]}`,
              borderBottom: `1px solid ${color.border}`,
              fontSize: text.sm,
              fontWeight: weight.semibold,
              color: color.text,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <span>Notificaciones</span>
            <span style={{ fontSize: text.xs, color: color.textMuted, fontWeight: weight.medium }}>
              {total === 0 ? 'Todo al día' : `${total} pendiente${total === 1 ? '' : 's'}`}
            </span>
          </header>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: `${space[8]} ${space[4]}`, textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: space[2] }}>✨</div>
                <p style={{ margin: 0, fontSize: text.sm, color: color.textMuted }}>
                  No tenés tareas vencidas, cobros atrasados ni leads estancados.
                </p>
              </div>
            ) : (
              items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onClick={() => {
                    setOpen(false);
                    onNavigate(item.screen);
                  }}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({ item, onClick }: { item: NotificationItem; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const Icon = item.kind === 'task' ? CheckSquare : item.kind === 'collection' ? AlertCircle : TrendingUp;
  const accent =
    item.kind === 'collection' ? color.danger : item.kind === 'lead' ? color.warning : color.info;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: `${space[3]} ${space[4]}`,
        background: hover ? color.surfaceHover : 'transparent',
        borderBottom: `1px solid ${color.border}`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: space[3],
        cursor: 'pointer',
        transition: `background ${duration.fast} ${ease}`,
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: radius.sm,
          background: 'var(--surface-2)',
          color: accent,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={14} strokeWidth={2.2} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: text.sm,
            fontWeight: weight.medium,
            color: color.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title}
        </div>
        <div style={{ fontSize: text.xs, color: color.textMuted, marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Clock size={10} /> {item.subtitle}
        </div>
      </div>
    </button>
  );
}

/* ===== "Nuevo" dropdown menu ===== */

const NEW_ITEMS: Array<{ id: NewAction; label: string; shortcut: string; Icon: typeof Users }> = [
  { id: 'cliente', label: 'Cliente', shortcut: 'C', Icon: Users },
  { id: 'venta', label: 'Venta', shortcut: 'V', Icon: ShoppingCart },
  { id: 'lead', label: 'Lead', shortcut: 'L', Icon: GitBranch },
  { id: 'tarea', label: 'Tarea', shortcut: 'T', Icon: CheckSquare },
  { id: 'movimiento', label: 'Movimiento de caja', shortcut: 'M', Icon: Wallet },
];

function NewMenu({ onAction }: { onAction: (a: NewAction) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', onClickOutside);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onClickOutside);
        document.removeEventListener('keydown', onKey);
      };
    }
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <Button variant="primary" size="md" iconLeft={<Plus size={16} />} onClick={() => setOpen((v) => !v)}>
        Nuevo
      </Button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 220,
            background: color.surface,
            border: `1px solid ${color.borderStrong}`,
            borderRadius: radius.md,
            boxShadow: 'var(--shadow-lg)',
            padding: 4,
            zIndex: 50,
          }}
        >
          {NEW_ITEMS.map((item) => (
            <NewMenuItem
              key={item.id}
              label={item.label}
              shortcut={item.shortcut}
              Icon={item.Icon}
              onClick={() => {
                setOpen(false);
                onAction(item.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NewMenuItem({
  label,
  shortcut,
  Icon,
  onClick,
}: {
  label: string;
  shortcut: string;
  Icon: typeof Users;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[2],
        width: '100%',
        padding: `${space[2]} ${space[3]}`,
        borderRadius: radius.sm,
        background: hover ? color.surfaceHover : 'transparent',
        color: color.text,
        fontSize: text.sm,
        textAlign: 'left',
        transition: `background ${duration.fast} ${ease}`,
      }}
    >
      <Icon size={14} color={color.textMuted} strokeWidth={2.2} />
      <span style={{ flex: 1 }}>{label}</span>
      <kbd
        style={{
          fontSize: 11,
          fontWeight: weight.medium,
          color: color.textMuted,
          padding: '1px 5px',
          background: color.bg,
          border: `1px solid ${color.border}`,
          borderRadius: radius.sm,
          fontFamily: 'inherit',
        }}
      >
        {shortcut}
      </kbd>
    </button>
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
  onClick,
  ...rest
}: {
  children: React.ReactNode;
  badge?: number;
  onClick?: () => void;
  'aria-label': string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
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
