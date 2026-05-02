import { useEffect, useState } from "react";
import {
  Home,
  Users,
  GitPullRequest,
  CheckSquare,
  ShoppingCart,
  Archive,
  Settings,
  Wallet,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { resolveImageUrl } from "./lib/images";
import { useWorkspaceStore } from "./store/workspaceStore";
import { useBusinessStore } from "./store/businessStore";
import { useUIStore, type ScreenId } from "./store/uiStore";
import { useAuthStore } from "./store/authStore";
import { useExchangeRateStore } from "./store/exchangeRateStore";
import { dbSelect } from "./lib/db/index";
import { cashDb } from "./lib/db/cash";
import { productTemplatesDb } from "./lib/db/productTemplates";
import { seedAppleCatalog, seedWatchAndMac } from "./lib/db/quickStock";
import { applyImagesToTemplates } from "./lib/templates/applyImages";
import Select from "./components/ui/Select";
import OnboardingScreen from "./features/onboarding/OnboardingScreen";
import MiDia from "./features/dashboard/MiDia";
import CustomersScreen from "./features/customers/CustomersScreen";
import PipelineScreen from "./features/pipeline/PipelineScreen";
import TasksScreen from "./features/tasks/TasksScreen";
import SalesScreen from "./features/sales/SalesScreen";
import InventoryScreen from "./features/inventory/InventoryScreen";
import CashScreen from "./features/cash/CashScreen";
import TeamScreen from "./features/team/TeamScreen";
import SettingsScreen from "./features/settings/SettingsScreen";
import NewSaleModal from "./features/sales/NewSaleModal";
import Toaster from "./components/Toaster";
import Topbar from "./components/Topbar";
import Modal from "./components/Modal";
import type { CashMovementType, CashDirection, CreateCashMovementInput } from "./lib/db/types";

// ─── Nav config ───────────────────────────────────────────────────

const NAV_PRIMARY: Array<{ id: ScreenId; label: string; Icon: typeof Home }> = [
  { id: "home", label: "Mi Día", Icon: Home },
  { id: "cash", label: "Caja", Icon: Wallet },
  { id: "customers", label: "Clientes", Icon: Users },
  { id: "pipeline", label: "Pipeline", Icon: GitPullRequest },
  { id: "tasks", label: "Tareas", Icon: CheckSquare },
  { id: "sales", label: "Ventas", Icon: ShoppingCart },
  { id: "inventory", label: "Inventario", Icon: Archive },
];

const NAV_SECONDARY: Array<{ id: ScreenId; label: string; Icon: typeof Home }> = [
  { id: "team", label: "Equipo", Icon: Users },
  { id: "settings", label: "Ajustes", Icon: Settings },
];

// ─── Movement modal ───────────────────────────────────────────────

const MOV_TYPES: Array<{ value: CashMovementType; label: string; direction: CashDirection }> = [
  { value: "cobro", label: "Cobro", direction: "in" },
  { value: "venta", label: "Venta manual", direction: "in" },
  { value: "gasto", label: "Gasto", direction: "out" },
  { value: "compra", label: "Compra stock", direction: "out" },
  { value: "otro", label: "Otro ingreso", direction: "in" },
];

function QuickMovementModal({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const { activeWorkspace } = useWorkspaceStore();
  const { activeBusiness } = useBusinessStore();
  const { showToast } = useUIStore();
  const [type, setType] = useState<CashMovementType>("cobro");
  const [currency, setCurrency] = useState("ARS");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const direction = MOV_TYPES.find((t) => t.value === type)?.direction ?? "in";

  const handleSubmit = async () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { showToast("Ingresá un monto válido"); return; }
    if (!activeWorkspace?.id || !activeBusiness?.id) { showToast("No hay negocio activo"); return; }
    setSubmitting(true);
    try {
      const data: CreateCashMovementInput = {
        type, direction, amount: parsed, currency,
        description: description.trim() || null,
      };
      await cashDb.createMovement(activeWorkspace.id, activeBusiness.id, data);
      onSuccess();
    } catch {
      showToast("Error al registrar movimiento");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px",
    background: "var(--surface-2)", border: "1px solid var(--border-strong)",
    borderRadius: 8, color: "var(--text-primary)", fontSize: 14, outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>Tipo</label>
        <Select
          value={type}
          onChange={(v) => setType(v as CashMovementType)}
          options={MOV_TYPES.map((t) => ({ value: t.value, label: t.label }))}
        />
      </div>
      <div>
        <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>Moneda</label>
        <Select value={currency} onChange={setCurrency} options={[{ value: "ARS", label: "ARS" }, { value: "USD", label: "USD" }]} />
      </div>
      <div>
        <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
          Monto ({currency})
        </label>
        <input
          autoFocus
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="0"
          style={inputStyle}
        />
      </div>
      <div>
        <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>Descripción (opcional)</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Ej: Pago de Mario, flete, etc."
          style={inputStyle}
        />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: "10px", background: "var(--surface-2)", borderRadius: 8, fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !amount}
          style={{ flex: 2, padding: "10px", background: direction === "in" ? "var(--green)" : "var(--brand)", borderRadius: 8, fontSize: 14, fontWeight: 600, color: "#fff", opacity: submitting || !amount ? 0.5 : 1 }}
        >
          {submitting ? "Registrando..." : direction === "in" ? `Registrar ingreso` : `Registrar egreso`}
        </button>
      </div>
    </div>
  );
}

// ─── Loading ──────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ fontSize: 42, fontWeight: 800, color: "var(--text-primary)", letterSpacing: -2, opacity: 0.5 }}>
        Clozr<span style={{ color: "var(--brand)" }}>.</span>
      </div>
    </div>
  );
}

// ─── Nav item ─────────────────────────────────────────────────────

function NavItem({ label, Icon, active, onClick }: {
  label: string; Icon: typeof Home; active: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "8px 10px", borderRadius: 8, fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? "#fff" : hovered ? "var(--text-primary)" : "var(--text-secondary)",
        background: active ? "var(--brand)" : hovered ? "var(--surface-2)" : "transparent",
        transition: "background 0.12s, color 0.12s", textAlign: "left",
      }}
    >
      <Icon size={15} strokeWidth={active ? 2.2 : 1.8} style={{ flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────

function WorkspaceLogo({ logoPath, emoji, name }: { logoPath: string | null; emoji: string; name: string }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!logoPath) { setLogoUrl(null); return; }
    resolveImageUrl(logoPath).then(setLogoUrl).catch(() => setLogoUrl(null));
  }, [logoPath]);
  if (logoUrl) return <img src={logoUrl} alt={name} style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />;
  return <span style={{ fontSize: 16 }}>{emoji}</span>;
}

function Sidebar() {
  const { activeWorkspace } = useWorkspaceStore();
  const { activeScreen, setActiveScreen } = useUIStore();
  const { userName } = useAuthStore();

  return (
    <aside style={{
      width: 200, flexShrink: 0, display: "flex", flexDirection: "column",
      background: "var(--surface)", borderRight: "1px solid var(--border)", overflow: "hidden",
    }}>
      {/* Logo */}
      <div style={{ padding: "16px 16px 12px", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -1, color: "var(--text-primary)", lineHeight: 1 }}>
          Clozr<span style={{ color: "var(--brand)" }}>.</span>
        </div>
        {activeWorkspace && (
          <WorkspaceLogo
            logoPath={activeWorkspace.logo_path ?? null}
            emoji={activeWorkspace.emoji}
            name={activeWorkspace.name}
          />
        )}
      </div>

      <div style={{ height: 1, background: "var(--border)", marginBottom: 8 }} />

      {/* Primary nav */}
      <nav style={{ flex: 1, padding: "4px 8px", overflow: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_PRIMARY.map(({ id, label, Icon }) => (
          <NavItem key={id} label={label} Icon={Icon} active={activeScreen === id} onClick={() => setActiveScreen(id)} />
        ))}
        <div style={{ height: 1, background: "var(--border)", margin: "8px 2px" }} />
        {NAV_SECONDARY.map(({ id, label, Icon }) => (
          <NavItem key={id} label={label} Icon={Icon} active={activeScreen === id} onClick={() => setActiveScreen(id)} />
        ))}
      </nav>

      {/* User */}
      {userName && (
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%", background: "var(--brand)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0,
          }}>
            {userName.charAt(0).toUpperCase()}
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {userName}
          </span>
        </div>
      )}
    </aside>
  );
}

// ─── App ──────────────────────────────────────────────────────────

export default function App() {
  const { workspaces, activeWorkspace, isLoading, loadWorkspaces } = useWorkspaceStore();
  const { loadBusinesses } = useBusinessStore();
  const { activeScreen, quickModal, setQuickModal } = useUIStore();
  const { userId, setUser } = useAuthStore();
  const { loadRate } = useExchangeRateStore();
  const queryClient = useQueryClient();

  const [fading, setFading] = useState(false);
  const [displayScreen, setDisplayScreen] = useState<ScreenId>("home");

  useEffect(() => { loadWorkspaces().catch(() => {}); }, [loadWorkspaces]);

  // Load businesses + exchange rate when workspace changes
  useEffect(() => {
    if (!activeWorkspace) return;
    loadBusinesses(activeWorkspace.id).catch(() => {});
    loadRate(activeWorkspace.id).catch(() => {});
  }, [activeWorkspace?.id, loadBusinesses, loadRate]);

  // Seed Apple templates, apply images, and seed quick-stock catalog (all idempotent)
  useEffect(() => {
    productTemplatesDb.seedBuiltinTemplates()
      .then(() => applyImagesToTemplates())
      .catch(() => {});
    seedAppleCatalog().catch(() => {});
    seedWatchAndMac().catch(() => {});
  }, []);

  // Bootstrap auth
  useEffect(() => {
    if (userId || !activeWorkspace) return;
    dbSelect<{ user_id: string; name: string }>(
      `SELECT wm.user_id, u.name FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = ? ORDER BY wm.joined_at ASC LIMIT 1`,
      [activeWorkspace.id],
    ).then((rows) => { if (rows[0]) setUser(rows[0].user_id, rows[0].name); }).catch(() => {});
  }, [userId, activeWorkspace, setUser]);

  // Screen transition
  useEffect(() => {
    if (activeScreen === displayScreen) return;
    setFading(true);
    const t = setTimeout(() => { setDisplayScreen(activeScreen); setFading(false); }, 100);
    return () => clearTimeout(t);
  }, [activeScreen, displayScreen]);

  const invalidateCash = () => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.toString().startsWith("cash") });
    queryClient.invalidateQueries({ queryKey: ["sales-day-stats"] });
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.toString().startsWith("sales") });
  };

  const renderScreen = (screen: ScreenId) => {
    switch (screen) {
      case "home": return <MiDia />;
      case "cash": return <CashScreen />;
      case "customers": return <CustomersScreen />;
      case "pipeline": return <PipelineScreen />;
      case "tasks": return <TasksScreen />;
      case "sales": return <SalesScreen />;
      case "inventory":
      case "catalog":
      case "stock":
      case "stock-list": return <InventoryScreen />;
      case "team": return <TeamScreen />;
      case "settings": return <SettingsScreen />;
    }
  };

  if (isLoading) return <LoadingScreen />;
  if (!activeWorkspace || workspaces.length === 0) return <OnboardingScreen />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "var(--bg)" }}>
      {/* Topbar — full width */}
      <Topbar />

      {/* Body = sidebar + main */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar />
        <main style={{ flex: 1, overflow: "auto", opacity: fading ? 0 : 1, transition: "opacity 0.1s ease" }}>
          {renderScreen(displayScreen)}
        </main>
      </div>

      {/* Global quick modals */}
      <Modal
        isOpen={quickModal === "sale"}
        onClose={() => setQuickModal(null)}
        title="Nueva venta"
        maxWidth={600}
      >
        <NewSaleModal
          onSuccess={() => { invalidateCash(); setQuickModal(null); }}
          onCancel={() => setQuickModal(null)}
        />
      </Modal>

      <Modal
        isOpen={quickModal === "movement"}
        onClose={() => setQuickModal(null)}
        title="Registrar movimiento"
        maxWidth={420}
      >
        <QuickMovementModal
          onSuccess={() => { invalidateCash(); setQuickModal(null); }}
          onCancel={() => setQuickModal(null)}
        />
      </Modal>

      <Toaster />
    </div>
  );
}
