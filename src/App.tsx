import { useEffect, useState, useMemo, lazy, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { resolveImageUrl } from "./lib/images";
import { useWorkspaceStore } from "./store/workspaceStore";
import { useBusinessStore } from "./store/businessStore";
import { useUIStore, type ScreenId } from "./store/uiStore";
import { useAuthStore } from "./store/authStore";
import { useExchangeRateStore } from "./store/exchangeRateStore";
import { useSyncActiveDolarToExchangeRate } from "./store/useDolaresAr";
import { UndoToastHost } from "./components/UndoToastHost";
import { ConfirmHost } from "./components/ConfirmHost";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { confirmAsync } from "./lib/confirmAsync";
import { WhatsNewModal } from "./components/WhatsNewModal";
import { seedAppleCatalog, seedWatchAndMac, refreshIphoneCatalog, refreshIpadCatalog } from "./lib/db/quickStock";
import { paymentMethodsDb } from "./lib/db/paymentMethods";
import { followupsDb } from "./lib/db/followups";
import { ensurePricingSchema } from "./lib/db/ensureSchema";
import { autoBackupIfDue } from "./lib/backup";
import { log } from "./lib/logger";
import { useCloudAuthListener } from "./lib/useCloudAuthListener";
import { useSyncCloudRole } from "./lib/useSyncCloudRole";
import { onAuthExpired } from "./lib/cloudAuth";
import { useCloudAuthStore } from "./store/cloudAuthStore";

// AppShell stays eager — render shell immediately
import { AppShell } from "./layout/AppShell";

// MyDay (home) eager: landing page, sin spinner inicial
import { MyDayContainer } from "./pages/mi-dia/MyDayContainer";

// Resto: lazy-loaded por pantalla. Cada uno hace su propio chunk de Vite —
// arranca más rápido y solo descarga lo que el usuario navega.
//
// F.preload: las top-5 pantallas (Pipeline/Clientes/Ventas/Inventario/Tareas)
// están separadas en imports nombrados (importPipeline, etc) para que el
// splash pueda pre-bajarlas en background ANTES de que el user navegue.
// Cuando navega: el chunk ya está en cache del browser → Suspense ni
// parpadea. Las menos-frecuentes (Caja, Deudas, Reportes, Equipo,
// Settings, Onboarding, Login) siguen lazy puro.
const importPipeline = () => import("./pages/pipeline/Pipeline");
const importClientes = () => import("./pages/clientes/Clientes");
const importVentas = () => import("./pages/ventas/Ventas");
const importInventario = () => import("./pages/inventario/Inventario");
const importTareas = () => import("./pages/tareas/Tareas");

const Pipeline = lazy(() => importPipeline().then((m) => ({ default: m.Pipeline })));
const Clientes = lazy(() => importClientes().then((m) => ({ default: m.Clientes })));
const Ventas = lazy(() => importVentas().then((m) => ({ default: m.Ventas })));
const Inventario = lazy(() => importInventario().then((m) => ({ default: m.Inventario })));
const Tareas = lazy(() => importTareas().then((m) => ({ default: m.Tareas })));

const Caja = lazy(() => import("./pages/caja/Caja").then((m) => ({ default: m.Caja })));
const Equipo = lazy(() => import("./pages/equipo/Equipo").then((m) => ({ default: m.Equipo })));
const Deudas = lazy(() => import("./pages/deudas/Deudas").then((m) => ({ default: m.Deudas })));
const Reportes = lazy(() => import("./pages/reportes/Reportes").then((m) => ({ default: m.Reportes })));
const OnboardingScreen = lazy(() => import("./features/onboarding/OnboardingScreen"));
const SettingsScreen = lazy(() => import("./features/settings/SettingsScreen"));
const LoginScreen = lazy(() => import("./features/auth/LoginScreen"));

import Toaster from "./components/Toaster";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutsHelp } from "./components/ShortcutsHelp";
import { useGlobalShortcuts } from "./lib/useGlobalShortcuts";
import { checkForUpdate, downloadAndInstall, type UpdateStatus } from "./lib/updater";
import { SplashScreen, type SplashTask } from "./components/SplashScreen";
import { qk } from "./lib/queryKeys";
import { customersDb } from "./lib/db/customers";
import { salesDb } from "./lib/db/sales";
import { tasksDb } from "./lib/db/tasks";
import { pipelineDb } from "./lib/db/pipeline";
import logoIsotipo from "./assets/logo-isotipo.svg";

// ─── Update banner ────────────────────────────────────────────────

function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<UpdateStatus>("idle");

  // D6: throttle de chequeo a 1 vez cada 24h. Antes pegábamos al
  // updater de GitHub Actions en cada arranque (incluso si el user
  // abrió la app 10 veces hoy). Ahora persistimos lastUpdateCheck
  // en localStorage y skipeamos si pasó <24h.
  useEffect(() => {
    const t = setTimeout(() => {
      const last = Number(localStorage.getItem("clozr:lastUpdateCheck") ?? 0);
      const ageMs = Date.now() - last;
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
      if (ageMs < TWENTY_FOUR_HOURS) return;
      checkForUpdate().then((info) => {
        localStorage.setItem("clozr:lastUpdateCheck", String(Date.now()));
        if (info) setVersion(info.version);
      });
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

/** Spinner liviano para los Suspense boundaries de páginas lazy-loaded.
 *  Más sutil que LoadingScreen — no toma viewport completo. */
function PageLoader() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-6)",
      }}
    >
      <img
        src={logoIsotipo}
        alt=""
        style={{ height: 32, width: "auto", opacity: 0.4, animation: "fadeIn 0.3s ease" }}
      />
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
  const [splashDone, setSplashDone] = useState(false);
  const { workspaces, activeWorkspace, isLoading, loadWorkspaces } = useWorkspaceStore();
  const { activeBusiness, loadBusinesses } = useBusinessStore();
  const { activeScreen, setActiveScreen } = useUIStore();
  const { userId, userName, clearUser } = useAuthStore();
  const { loadRate } = useExchangeRateStore();
  const queryClient = useQueryClient();

  // Sincroniza el dólar activo (blue/oficial/etc) con el store legacy
  // de cotización — toda la app que lee `usdToArs` recibe el valor
  // del API automáticamente sin tener que tocar cada caller.
  useSyncActiveDolarToExchangeRate();

  // Escucha el deep link clozr://auth-complete?jwt=... que dispara Rust
  // cuando el SO le pasa un magic link a la app. Llena cloudAuthStore.
  useCloudAuthListener();

  // Cuando hay sesión cloud activa, mantiene authStore.userRole en sync
  // con el rol del workspace cloud activo. Así can() — que lee userRole —
  // aplica los permisos correctos sin tocar callsites.
  useSyncCloudRole();

  // Auto-logout cuando el server responde 401 (JWT expirado, session
  // revocada server-side por expulsion, etc). Lo registramos UNA vez al
  // mount del App.
  const { showToast } = useUIStore();
  const clearCloudSession = useCloudAuthStore((s) => s.clearSession);
  useEffect(() => {
    onAuthExpired(() => {
      clearCloudSession();
      queryClient.clear();
      showToast("Tu sesión expiró — entrá de nuevo desde Ajustes → Cuenta en la nube", "error");
    });
  }, [clearCloudSession, queryClient, showToast]);

  useGlobalShortcuts();

  useEffect(() => {
    loadWorkspaces().catch((err) => log.error("loadWorkspaces failed", { scope: "boot", err }));
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!activeWorkspace) return;
    loadBusinesses(activeWorkspace.id).catch((err) =>
      log.error("loadBusinesses failed", { scope: "boot", err }),
    );
    loadRate(activeWorkspace.id).catch((err) =>
      log.error("loadRate failed", { scope: "boot", err }),
    );
    // Defensa: si las migraciones 023-025 no corrieron en esta DB,
    // crear las tablas/columnas a mano antes de seedear defaults.
    ensurePricingSchema()
      .then(() => paymentMethodsDb.seedDefaults(activeWorkspace.id))
      .catch((err) =>
        log.error("ensureSchema/seedPaymentDefaults failed", { scope: "boot", err }),
      );
  }, [activeWorkspace?.id, loadBusinesses, loadRate]);

  // Scan de clientes inactivos: corre 1 vez al cargar workspace+business.
  // Crea followups auto-inactive (idempotente: skip si ya hay uno pendiente
  // por cliente).
  useEffect(() => {
    if (!activeWorkspace || !activeBusiness) return;
    const wid = activeWorkspace.id;
    const bid = activeBusiness.id;
    followupsDb.scanInactiveCustomers(wid, bid, 60).catch((err) =>
      log.warn("scanInactiveCustomers failed", { scope: "boot", err }),
    );
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
      // Mismo refresh para iPad — fuente de verdad en IPAD_SEED
      .then(() => refreshIpadCatalog())
      .catch((err) => log.error("Apple catalog seed/refresh failed", { scope: "boot", err }));

    // Backup nativo automático: 1 vez por día, mantiene los últimos 14
    autoBackupIfDue().catch((err) =>
      log.warn("autoBackupIfDue failed", { scope: "backup", err }),
    );
  }, []);

  // Nota: la auto-selección del primer miembro como sesión activa fue
  // reemplazada por LoginScreen — ahora si no hay userId mostramos el
  // selector de miembros (con PIN si lo tienen).

  // Invalidate caches after mutations from quick modals
  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries();
    };
    window.addEventListener("clozr:invalidate", handler);
    return () => window.removeEventListener("clozr:invalidate", handler);
  }, [queryClient]);

  // F.splash + F.preload — tasks que el splash espera. Cada una se muestra
  // en el splash con su label + check al terminar. Pre-cargar chunks
  // de pantallas top-5 + pre-fetch queries del workspace activo para que
  // al llegar a Mi Día / navegar entre pantallas todo esté cacheado.
  //
  // Las tareas se construyen UNA vez al mount (useMemo con array vacío)
  // para evitar que el splash las reciba como "nuevas" en cada render
  // del workspace cambiando — la primera carga es lo que importa.
  const splashTasks = useMemo<SplashTask[]>(() => {
    const wid = activeWorkspace?.id;
    const tasks: SplashTask[] = [
      // Chunks de pantallas — el browser cachea el chunk, después la
      // navegación a esa pantalla es instantánea (sin spinner de Suspense).
      { id: "chunk-pipeline", label: "Pipeline", promise: importPipeline() },
      { id: "chunk-clientes", label: "Clientes", promise: importClientes() },
      { id: "chunk-ventas", label: "Ventas", promise: importVentas() },
      { id: "chunk-inventario", label: "Inventario", promise: importInventario() },
      { id: "chunk-tareas", label: "Tareas", promise: importTareas() },
    ];
    if (wid) {
      // Pre-fetch de DB. Estos tasks calientan SQLite (open + schema +
      // first reads) y dejan los queryClient caches con keys canónicas
      // para que algunos hooks (useClientsList con qk.clientes.list)
      // den cache-hit directo. Los hooks con queryFn compuesto (ej
      // Promise.all) van a re-ejecutar igual — pero el SQLite ya está
      // hot, así que el segundo fetch es ~ms en vez de ~10ms.
      tasks.push(
        {
          id: "prefetch-clientes",
          label: "Clientes",
          promise: queryClient.prefetchQuery({
            queryKey: qk.clientes.list(wid),
            queryFn: () => customersDb.getAll(wid),
          }),
        },
        {
          id: "prefetch-ventas",
          label: "Ventas",
          promise: salesDb.getAll(wid),
        },
        {
          id: "prefetch-pipeline",
          label: "Pipeline",
          promise: queryClient.prefetchQuery({
            queryKey: qk.pipeline.leads(wid),
            queryFn: () => pipelineDb.getAll(wid),
          }),
        },
        {
          id: "prefetch-tareas",
          label: "Tareas",
          promise: queryClient.prefetchQuery({
            queryKey: qk.tasks.list(wid),
            queryFn: () => tasksDb.getAll(wid),
          }),
        },
      );
    }
    return tasks;
    // Solo se computa una vez al mount — si workspace tarda en cargar,
    // el splash mostrará la lista sin los prefetches (que arrancarán
    // cuando workspace esté listo en el siguiente render pero el splash
    // ya capturó la lista original). Trade-off: si el workspace tarda
    // >4s el splash termina sin pre-fetch, lo cual es OK porque el user
    // verá MyDay arrancar las queries normalmente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El splash se renderea como overlay (position fixed, z-index 9999) en
  // CUALQUIER caso debajo, así no parpadea si la app cambia de pantalla
  // mientras se desvanece. Lo extraigo como nodo reutilizable.
  const splashOverlay = !splashDone ? (
    <SplashScreen tasks={splashTasks} onDone={() => setSplashDone(true)} />
  ) : null;

  if (isLoading) {
    return (
      <>
        {splashOverlay}
        <LoadingScreen />
      </>
    );
  }
  if (!activeWorkspace || workspaces.length === 0) {
    return (
      <>
        {splashOverlay}
        <Suspense fallback={<LoadingScreen />}>
          <OnboardingScreen />
        </Suspense>
      </>
    );
  }
  // Sin sesión activa → LoginScreen.
  if (!userId) {
    return (
      <>
        {splashOverlay}
        <Suspense fallback={<LoadingScreen />}>
          <LoginScreen />
        </Suspense>
      </>
    );
  }

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
      {splashOverlay}
      <UpdateBanner />
      <UndoToastHost />
      <WhatsNewModal />
      <AppShell
        active={activeScreen}
        onNavigate={(id) => setActiveScreen(id as ScreenId)}
        workspace={{ name: activeBusiness?.name ?? activeWorkspace.name, emoji: activeBusiness?.emoji ?? activeWorkspace.emoji }}
        user={{ name: userName ?? "Usuario", email: "" }}
        onLogout={async () => {
          if (await confirmAsync({ title: "Cerrar sesión", message: "¿Cerrar sesión?", confirmText: "Cerrar sesión" })) {
            clearUser();
            queryClient.clear();
          }
        }}
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
              window.dispatchEvent(new CustomEvent("clozr:open-new-lead"));
              break;
            case "tarea":
              setActiveScreen("tasks");
              window.dispatchEvent(new CustomEvent("clozr:open-new-task"));
              break;
            case "movimiento":
              setActiveScreen("cash");
              window.dispatchEvent(new CustomEvent("clozr:open-new-movement"));
              break;
          }
        }}
      >
        {/* ErrorBoundary por-pantalla: si una pantalla crashea, el shell
            (sidebar/topbar/topbanner) sigue vivo y el user puede navegar
            a otra. resetKey=activeScreen → al navegar se reintenta limpio. */}
        <ErrorBoundary resetKey={activeScreen} compact scope={`screen:${activeScreen}`}>
          <Suspense fallback={<PageLoader />}>
            {renderScreen(activeScreen)}
          </Suspense>
        </ErrorBoundary>
      </AppShell>
      <CommandPalette />
      <ShortcutsHelp />
      <Toaster />
      <ConfirmHost />
    </>
  );
}
