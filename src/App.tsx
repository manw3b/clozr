import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { resolveImageUrl } from "./lib/images";
import { useWorkspaceStore } from "./store/workspaceStore";
import { useBusinessStore } from "./store/businessStore";
import { useUIStore, type ScreenId } from "./store/uiStore";
import { useAuthStore } from "./store/authStore";
import { useExchangeRateStore } from "./store/exchangeRateStore";
import { dbSelect } from "./lib/db/index";
import { seedAppleCatalog, seedWatchAndMac, refreshIphoneCatalog } from "./lib/db/quickStock";
import { paymentMethodsDb } from "./lib/db/paymentMethods";
import { followupsDb } from "./lib/db/followups";
import { ensurePricingSchema } from "./lib/db/ensureSchema";
import { autoBackupIfDue } from "./lib/backup";

// New design system pages
import { AppShell } from "./layout/AppShell";
import { MyDayContainer } from "./pages/mi-dia/MyDayContainer";
import { Clientes } from "./pages/clientes/Clientes";
import { Pipeline } from "./pages/pipeline/Pipeline";
import { Ventas } from "./pages/ventas/Ventas";
import { Caja } from "./pages/caja/Caja";

// Migrated to new design system
import { Tareas } from "./pages/tareas/Tareas";
import { Equipo } from "./pages/equipo/Equipo";
import { Deudas } from "./pages/deudas/Deudas";
import { Reportes } from "./pages/reportes/Reportes";

import { Inventario } from "./pages/inventario/Inventario";

// Legacy screens (skin pass applied; will be fully migrated later)
import OnboardingScreen from "./features/onboarding/OnboardingScreen";
import SettingsScreen from "./features/settings/SettingsScreen";

import Toaster from "./components/Toaster";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutsHelp } from "./components/ShortcutsHelp";
import { useGlobalShortcuts } from "./lib/useGlobalShortcuts";
import { checkForUpdate, downloadAndInstall, type UpdateStatus } from "./lib/updater";
import logoIsotipo from "./assets/logo-isotipo.svg";

// ─── Update banner ────────────────────────────────────────────────

function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<UpdateStatus>("idle");

  useEffect(() => {
    const t = setTimeout(() => {
      checkForUpdate().then((info) => { if (info) setVersion(info.version); });
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  if (!version || status === "done") return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
      padding: "10px 20px", background: "var(--primary-bg)",
      borderBottom: "1px solid var(--border)", flexShrink: 0,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary)" }} />
      <span style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 500 }}>
        Nueva versión disponible: <strong>v{version}</strong>
      </span>
      <button
        disabled={status === "downloading"}
        onClick={() => downloadAndInstall(setStatus)}
        style={{
          padding: "5px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600,
          background: "var(--primary)", color: "#fff",
          opacity: status === "downloading" ? 0.7 : 1,
          transition: "background 0.12s ease",
        }}
      >
        {status === "downloading" ? "Instalando..." : "Actualizar ahora"}
      </button>
    </div>
  );
}

// ─── Loading ──────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <img src={logoIsotipo} alt="Clozr" style={{ height: 56, width: "auto", objectFit: "contain", opacity: 0.5, animation: "fadeIn 0.4s ease" }} />
    </div>
  );
}

// ─── Workspace logo helper (for sidebar header in some legacy screens) ───

export function WorkspaceLogo({ logoPath, emoji, name }: { logoPath: string | null; emoji: string; name: string }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!logoPath) { setLogoUrl(null); return; }
    resolveImageUrl(logoPath).then(setLogoUrl).catch(() => setLogoUrl(null));
  }, [logoPath]);
  if (logoUrl) return <img src={logoUrl} alt={name} style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />;
  return <span style={{ fontSize: 16 }}>{emoji}</span>;
}

// ─── App ──────────────────────────────────────────────────────────

export default function App() {
  const { workspaces, activeWorkspace, isLoading, loadWorkspaces } = useWorkspaceStore();
  const { activeBusiness, loadBusinesses } = useBusinessStore();
  const { activeScreen, setActiveScreen } = useUIStore();
  const { userId, userName, setUser } = useAuthStore();
  const { loadRate } = useExchangeRateStore();
  const queryClient = useQueryClient();

  useGlobalShortcuts();

  useEffect(() => { loadWorkspaces().catch(() => {}); }, [loadWorkspaces]);

  useEffect(() => {
    if (!activeWorkspace) return;
    loadBusinesses(activeWorkspace.id).catch(() => {});
    loadRate(activeWorkspace.id).catch(() => {});
    // Defensa: si las migraciones 023-025 no corrieron en esta DB,
    // crear las tablas/columnas a mano antes de seedear defaults.
    ensurePricingSchema()
      .then(() => paymentMethodsDb.seedDefaults(activeWorkspace.id))
      .catch(() => {});
  }, [activeWorkspace?.id, loadBusinesses, loadRate]);

  // Scan de clientes inactivos: corre 1 vez al cargar workspace+business.
  // Crea followups auto-inactive (idempotente: skip si ya hay uno pendiente
  // por cliente).
  useEffect(() => {
    if (!activeWorkspace || !activeBusiness) return;
    const wid = activeWorkspace.id;
    const bid = activeBusiness.id;
    followupsDb.scanInactiveCustomers(wid, bid, 60).catch(() => {});
    // Solo dispara cuando cambian los IDs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id, activeBusiness?.id]);

  useEffect(() => {
    // Seed inicial (idempotente para usuarios con DB vacía)
    seedAppleCatalog()
      .then(() => seedWatchAndMac())
      // Refresh idempotente del catálogo iPhone (corre siempre — actualiza
      // modelos/colores/storages cada vez que cambia el seed sin perder data
      // de catalog_items o ventas existentes).
      .then(() => refreshIphoneCatalog())
      .catch(() => {});

    // Backup nativo automático: 1 vez por día, mantiene los últimos 14
    autoBackupIfDue().catch(() => {});
  }, []);

  useEffect(() => {
    if (userId || !activeWorkspace) return;
    dbSelect<{ user_id: string; name: string; role: string }>(
      `SELECT wm.user_id, wm.role, u.name FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = ? ORDER BY wm.joined_at ASC LIMIT 1`,
      [activeWorkspace.id],
    ).then((rows) => {
      if (rows[0]) setUser(rows[0].user_id, rows[0].name, rows[0].role as never);
    }).catch(() => {});
  }, [userId, activeWorkspace, setUser]);

  // Invalidate caches after mutations from quick modals
  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries();
    };
    window.addEventListener("clozr:invalidate", handler);
    return () => window.removeEventListener("clozr:invalidate", handler);
  }, [queryClient]);

  if (isLoading) return <LoadingScreen />;
  if (!activeWorkspace || workspaces.length === 0) return <OnboardingScreen />;

  const renderScreen = (screen: ScreenId) => {
    switch (screen) {
      case "home": return <MyDayContainer />;
      case "cash": return <Caja />;
      case "customers": return <Clientes />;
      case "pipeline": return <Pipeline />;
      case "sales": return <Ventas />;
      case "tasks": return <Tareas />;
      case "deudas": return <Deudas />;
      case "reportes": return <Reportes />;
      case "inventory":
      case "catalog":
      case "stock":
      case "stock-list": return <Inventario />;
      case "team": return <Equipo />;
      case "settings": return <SettingsScreen />;
    }
  };

  return (
    <>
      <UpdateBanner />
      <AppShell
        active={activeScreen}
        onNavigate={(id) => setActiveScreen(id as ScreenId)}
        workspace={{ name: activeBusiness?.name ?? activeWorkspace.name, emoji: activeBusiness?.emoji ?? activeWorkspace.emoji }}
        user={{ name: userName ?? "Usuario", email: "" }}
        onSearchClick={() => { window.dispatchEvent(new CustomEvent("clozr:open-cmdk")); }}
        onNotificationClick={(screen) => setActiveScreen(screen as ScreenId)}
        onNewAction={(action) => {
          switch (action) {
            case "cliente":
              setActiveScreen("customers");
              window.dispatchEvent(new CustomEvent("clozr:open-new-client"));
              break;
            case "venta":
              setActiveScreen("sales");
              window.dispatchEvent(new CustomEvent("clozr:open-new-sale"));
              break;
            case "lead":
              setActiveScreen("pipeline");
              break;
            case "tarea":
              setActiveScreen("tasks");
              break;
            case "movimiento":
              setActiveScreen("cash");
              window.dispatchEvent(new CustomEvent("clozr:open-new-movement"));
              break;
          }
        }}
      >
        {renderScreen(activeScreen)}
      </AppShell>
      <CommandPalette />
      <ShortcutsHelp />
      <Toaster />
    </>
  );
}
