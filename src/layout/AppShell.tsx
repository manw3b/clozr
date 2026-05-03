import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar, type NewAction } from './Topbar';
import { color } from '../tokens';

interface AppShellProps {
  active: string;
  onNavigate: (id: string) => void;
  workspace: { name: string; emoji?: string };
  user: { name: string; email: string };
  onSearchClick?: () => void;
  onNewAction?: (action: NewAction) => void;
  children: ReactNode;
  /** Right drawer opcional. Cuando se pasa, se renderiza al costado derecho. */
  drawer?: ReactNode;
}

/**
 * Composición del shell de la app.
 *
 * Layout: [Sidebar] [Topbar / Main / Drawer]
 */
export function AppShell({
  active,
  onNavigate,
  workspace,
  user,
  onSearchClick = () => {},
  onNewAction = () => {},
  children,
  drawer,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: color.bg,
        color: color.text,
        overflow: 'hidden',
      }}
    >
      <Sidebar
        active={active}
        onNavigate={onNavigate}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        user={user}
      />

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <Topbar workspace={workspace} onSearchClick={onSearchClick} onNewAction={onNewAction} />

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <main
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 'var(--space-6) var(--space-8)',
              minWidth: 0,
            }}
          >
            {children}
          </main>

          {drawer && (
            <aside
              style={{
                width: 'var(--drawer-w)',
                flexShrink: 0,
                background: color.surface,
                borderLeft: `1px solid ${color.border}`,
                overflowY: 'auto',
              }}
            >
              {drawer}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
