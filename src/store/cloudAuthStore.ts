/**
 * cloudAuthStore — sesión del backend Cloudflare/Turso.
 *
 * SEPARADO del authStore local (que maneja userId/userName/userRole del
 * workspace mono-PC). Cuando F2 migre los datos a Turso, ambos se van
 * a unificar; por ahora coexisten y los conectamos en el authStore.setUser
 * desde el callback del magic link.
 *
 * Persisted en localStorage para que el JWT sobreviva reload. El JWT es
 * suficientemente seguro para localStorage en el contexto de una app
 * desktop (la app es la única que accede a su localStorage; no hay
 * cross-site scripting en WebView2).
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CloudRole = "owner" | "admin" | "vendedor" | "viewer";

export interface CloudWorkspace {
  id: string;
  name: string;
  role: CloudRole;
  status: "active" | "invited" | "revoked";
}

interface CloudAuthState {
  /** JWT firmado por el worker. Null = no logueado. */
  jwt: string | null;
  /** Email del usuario logueado (extraído del flow, no del JWT). */
  email: string | null;
  /** user_id del backend Turso (extraído del JWT.uid). */
  userId: string | null;
  /** session_id del backend (extraído del JWT.sub). */
  sessionId: string | null;
  /** Unix seconds — cuándo expira. */
  expiresAt: number | null;

  /** Workspaces a los que el user pertenece (hidratado por GET /me). */
  workspaces: CloudWorkspace[];
  /** ID del workspace cloud activo (persisted). */
  activeWorkspaceId: string | null;

  /**
   * Estado del bootstrap por feature. Cuando es 'done', las queries de
   * esa feature (customersDb, pipelineDb, etc) ya saben pegar al cloud
   * en vez de SQLite. Por feature porque vamos a ir migrando rounds:
   *   customers (R1) → pipeline (R2) → sales (R3) → ...
   *
   * Keyed por workspaceId para que cada workspace tenga su propio
   * estado de migración. Si tenés 2 workspaces y sólo migraste uno,
   * la app respeta eso.
   *
   * Por defecto 'pending' — UI muestra prompt "subir tus clientes a la
   * nube" cuando hay workspace activo. Una vez 'done', no se vuelve a
   * mostrar (lo cambia el flow de import).
   * 'skip' = el user decidió arrancar limpio sin subir los locales.
   */
  bootstrapStatus: Record<string, { customers?: "pending" | "done" | "skip" }>;

  setSession: (args: { jwt: string; email: string; userId: string; sessionId: string; expiresAt: number }) => void;
  setWorkspaces: (ws: CloudWorkspace[]) => void;
  setActiveWorkspace: (id: string | null) => void;
  /** Agrega o reemplaza un workspace en la lista. Útil después de crear. */
  upsertWorkspace: (ws: CloudWorkspace) => void;
  setBootstrapStatus: (workspaceId: string, feature: "customers", status: "pending" | "done" | "skip") => void;
  /** True si el workspace activo terminó el bootstrap de la feature. */
  isCloudModeFor: (feature: "customers") => boolean;
  clearSession: () => void;
  /** True si tenemos JWT y NO está expirado. */
  isLoggedIn: () => boolean;
  /** Workspace cloud activo (o null si no hay). */
  activeWorkspace: () => CloudWorkspace | null;
  /** Rol del user en el workspace activo (o null). */
  currentRole: () => CloudRole | null;
}

export const useCloudAuthStore = create<CloudAuthState>()(
  persist(
    (set, get) => ({
      jwt: null,
      email: null,
      userId: null,
      sessionId: null,
      expiresAt: null,
      workspaces: [],
      activeWorkspaceId: null,
      bootstrapStatus: {},

      setSession: ({ jwt, email, userId, sessionId, expiresAt }) =>
        set({ jwt, email, userId, sessionId, expiresAt }),

      setWorkspaces: (ws) =>
        set((state) => {
          // Si tenemos activeWorkspaceId pero ya no existe en la lista
          // (ej: te expulsaron), lo limpiamos. Si no hay activo y hay ≥1,
          // tomamos el primero como default.
          let activeId = state.activeWorkspaceId;
          if (activeId && !ws.some((w) => w.id === activeId)) activeId = null;
          if (!activeId && ws.length > 0) activeId = ws[0]?.id ?? null;
          return { workspaces: ws, activeWorkspaceId: activeId };
        }),

      setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

      upsertWorkspace: (ws) =>
        set((state) => {
          const others = state.workspaces.filter((w) => w.id !== ws.id);
          const next = [...others, ws];
          // Si era el primer workspace, lo marcamos activo.
          const activeId = state.activeWorkspaceId ?? ws.id;
          return { workspaces: next, activeWorkspaceId: activeId };
        }),

      setBootstrapStatus: (workspaceId, feature, status) =>
        set((state) => ({
          bootstrapStatus: {
            ...state.bootstrapStatus,
            [workspaceId]: {
              ...(state.bootstrapStatus[workspaceId] ?? {}),
              [feature]: status,
            },
          },
        })),

      isCloudModeFor: (feature) => {
        const { activeWorkspaceId, bootstrapStatus, isLoggedIn, workspaces } = get();
        if (!isLoggedIn()) return false;
        if (!activeWorkspaceId) return false;

        // Reglas de cloud mode:
        //   - Owner: tiene datos LOCALES propios (acumulados antes de
        //     conectarse al cloud). Cloud mode se activa cuando él
        //     decide subirlos ('done') o saltearlos ('skip'). Hasta que
        //     decida, queda 'pending' y la app sigue leyendo del SQLite
        //     local — no perdería sus 47 clientes históricos por error.
        //
        //   - Miembros invitados (admin/vendedor/viewer): NO tienen
        //     datos locales propios — entraron al workspace por invite.
        //     Para ellos cloud mode siempre ON, así ven los datos que
        //     subió el owner. Si su PC tiene datos locales por accidente
        //     (corrieron Clozr antes solos), igual van al cloud porque
        //     no son "suyos" en el contexto de este workspace cloud.
        const role = workspaces.find((w) => w.id === activeWorkspaceId)?.role;
        if (role && role !== "owner") return true;

        const status = bootstrapStatus[activeWorkspaceId]?.[feature];
        return status === "done" || status === "skip";
      },

      clearSession: () =>
        set({
          jwt: null, email: null, userId: null, sessionId: null, expiresAt: null,
          workspaces: [], activeWorkspaceId: null,
          bootstrapStatus: {},
        }),

      isLoggedIn: () => {
        const { jwt, expiresAt } = get();
        if (!jwt || !expiresAt) return false;
        return expiresAt * 1000 > Date.now();
      },

      activeWorkspace: () => {
        const { workspaces, activeWorkspaceId } = get();
        if (!activeWorkspaceId) return null;
        return workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
      },

      currentRole: () => {
        const ws = get().activeWorkspace();
        return ws ? ws.role : null;
      },
    }),
    { name: "clozr-cloud-auth" },
  ),
);
