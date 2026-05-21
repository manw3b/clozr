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

  setSession: (args: { jwt: string; email: string; userId: string; sessionId: string; expiresAt: number }) => void;
  clearSession: () => void;
  /** True si tenemos JWT y NO está expirado. */
  isLoggedIn: () => boolean;
}

export const useCloudAuthStore = create<CloudAuthState>()(
  persist(
    (set, get) => ({
      jwt: null,
      email: null,
      userId: null,
      sessionId: null,
      expiresAt: null,

      setSession: ({ jwt, email, userId, sessionId, expiresAt }) =>
        set({ jwt, email, userId, sessionId, expiresAt }),

      clearSession: () =>
        set({ jwt: null, email: null, userId: null, sessionId: null, expiresAt: null }),

      isLoggedIn: () => {
        const { jwt, expiresAt } = get();
        if (!jwt || !expiresAt) return false;
        return expiresAt * 1000 > Date.now();
      },
    }),
    { name: "clozr-cloud-auth" },
  ),
);
