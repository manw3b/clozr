import {
  Home,
  Users,
  GitBranch,
  ShoppingCart,
  Wallet,
  Package,
  CheckSquare,
  Settings,
  UsersRound,
  Receipt,
  BarChart3,
  ChevronLeft,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { color, duration, ease, layout, radius, space, text, weight } from '../tokens';
import { Avatar } from '../components/Avatar';
import logoIsotipo from '../assets/logo-isotipo.svg';

export interface SidebarItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

// F.navigation:
//  - Reportes movido a Operaciones (la sección "Análisis" tenía 1 solo item)
//  - Equipo se queda como item directo del sidebar (más visible). La tab
//    "Equipo en la nube" de Ajustes se elimina para evitar redundancia.
const SECTIONS: { title?: string; items: SidebarItem[] }[] = [
  {
    items: [
      { id: 'home', label: 'Mi Día', icon: Home },
      { id: 'pipeline', label: 'Pipeline', icon: GitBranch },
      { id: 'customers', label: 'Clientes', icon: Users },
      { id: 'sales', label: 'Ventas', icon: ShoppingCart },
    ],
  },
  {
    title: 'Operaciones',
    items: [
      { id: 'cash', label: 'Caja', icon: Wallet },
      { id: 'deudas', label: 'Deudas', icon: Receipt },
      { id: 'inventory', label: 'Inventario', icon: Package },
      { id: 'tasks', label: 'Tareas', icon: CheckSquare },
      { id: 'reportes', label: 'Reportes', icon: BarChart3 },
    ],
  },
  {
    title: 'Configuración',
    items: [
      { id: 'team', label: 'Equipo', icon: UsersRound },
      { id: 'settings', label: 'Ajustes', icon: Settings },
    ],
  },
];

interface SidebarProps {
  active: string;
  onNavigate: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  user: { name: string; email: string };
  onLogout?: () => void;
}

export function Sidebar({ active, onNavigate, collapsed, onToggleCollapse, user, onLogout }: SidebarProps) {
  return (
    <aside
      style={{
        width: collapsed ? layout.sidebarWCollapsed : layout.sidebarW,
        flexShrink: 0,
        background: color.surface,
        borderRight: `1px solid ${color.border}`,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        transition: `width ${duration.slow} ${ease}`,
        position: 'relative',
      }}
    >
      {/* Logo + collapse button — alineado con la altura del topbar */}
      <div
        style={{
          height: layout.topbarH,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? 0 : `0 ${space[5]}`,
          borderBottom: `1px solid ${color.border}`,
        }}
      >
        {collapsed ? (
          <button
            onClick={onToggleCollapse}
            aria-label="Expandir sidebar"
            title="Expandir (Cmd+B)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            <ClozrLogo collapsed={collapsed} />
          </button>
        ) : (
          <ClozrLogo collapsed={collapsed} />
        )}
        {!collapsed && (
          <button
            onClick={onToggleCollapse}
            aria-label="Colapsar sidebar"
            title="Colapsar (Cmd+B)"
            className="sidebar-item"
            style={{
              width: 28,
              height: 28,
              borderRadius: radius.sm,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: `${space[4]} ${collapsed ? space[2] : space[3]}`,
        }}
      >
        {SECTIONS.map((section, idx) => (
          <div key={idx} style={{ marginBottom: space[5] }}>
            {!collapsed && section.title && (
              <div
                style={{
                  fontSize: text.xs,
                  fontWeight: weight.semibold,
                  color: color.textDim,
                  textTransform: 'uppercase',
                  letterSpacing: '0.8px',
                  padding: `0 ${space[3]}`,
                  marginBottom: space[2],
                }}
              >
                {section.title}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {section.items.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={active === item.id}
                  collapsed={collapsed}
                  onClick={() => onNavigate(item.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div
        style={{
          padding: collapsed ? `${space[2]} 0` : space[3],
          borderTop: `1px solid ${color.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: space[2],
          justifyContent: collapsed ? 'center' : 'space-between',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: space[3],
            flex: 1,
            minWidth: 0,
            padding: collapsed ? 4 : `${space[2]} ${space[3]}`,
            borderRadius: radius.md,
          }}
        >
          <Avatar name={user.name} size={collapsed ? 32 : 28} />
          {!collapsed && (
            <div style={{ minWidth: 0, textAlign: 'left' }}>
              <div
                style={{
                  fontSize: text.sm,
                  fontWeight: weight.semibold,
                  color: color.text,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.name}
              </div>
              <div
                style={{
                  fontSize: text.xs,
                  color: color.textDim,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.email}
              </div>
            </div>
          )}
        </div>
        {!collapsed && onLogout && (
          <button
            onClick={onLogout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="sidebar-item danger"
            style={{
              width: 28,
              height: 28,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.sm,
              flexShrink: 0,
            }}
          >
            <LogOut size={14} />
          </button>
        )}
      </div>
    </aside>
  );
}

function NavButton({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: SidebarItem;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={`sidebar-nav${active ? ' active' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[3],
        padding: collapsed ? `${space[2]} 0` : `${space[2]} ${space[3]}`,
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: radius.md,
        fontSize: text.sm,
        fontWeight: active ? weight.semibold : weight.medium,
        position: 'relative',
        textAlign: 'left',
      }}
    >
      {/* Indicator vertical para item activo */}
      {active && !collapsed && (
        <span
          style={{
            position: 'absolute',
            left: -3,
            top: 6,
            bottom: 6,
            width: 3,
            background: color.primary,
            borderRadius: radius.full,
          }}
        />
      )}
      <Icon size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
      {!collapsed && (
        <>
          <span style={{ flex: 1 }}>{item.label}</span>
          {item.badge && item.badge > 0 && (
            <span
              style={{
                fontSize: text.xs,
                fontWeight: weight.bold,
                background: active ? color.primary : color.surface2,
                color: active ? '#FFFFFF' : color.textMuted,
                padding: '1px 6px',
                borderRadius: radius.full,
                minWidth: 18,
                textAlign: 'center',
              }}
            >
              {item.badge}
            </span>
          )}
        </>
      )}
    </button>
  );
}

/* ===== Logo Clozr (inline SVG, sin dependencia de archivo) ===== */
function ClozrLogo({ collapsed }: { collapsed: boolean }) {
  // Cuando está expandido, sólo wordmark — el isotipo + texto al lado era
  // doble branding redundante para una pantalla interna. Cuando está
  // colapsado, sólo isotipo (no hay espacio para texto).
  if (collapsed) {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: color.primary,
        }}
      >
        <IsotipoSVG size={28} />
      </div>
    );
  }
  return (
    <span
      style={{
        fontSize: text.xl,
        fontWeight: weight.black,
        color: color.text,
        letterSpacing: '-0.6px',
        lineHeight: 1,
      }}
    >
      Clozr
    </span>
  );
}

function IsotipoSVG({ size = 26 }: { size?: number }) {
  return <img src={logoIsotipo} width={size} height={size} alt="Clozr" style={{ display: "block" }} />;
}
