/**
 * useCloudPolling — devuelve el intervalo de polling (en ms) para queries
 * que viven en cloud mode. Cuando NO hay cloud mode, retorna false para
 * que TanStack Query no haga polling (lo que pasaba antes — un poll
 * sobre SQLite local sería ridículo).
 *
 * Diseñado para usar en cualquier hook que llame useQuery:
 *
 *   useQuery({
 *     queryKey: qk.clientes.list(wid),
 *     queryFn: () => customersDb.getAll(wid),
 *     refetchInterval: useCloudPolling("customers"),  // ← acá
 *   })
 *
 * Por feature porque cada round migra a cloud en su tiempo. Si Caro
 * mira "Tareas" pero tareas todavía es local en su PC, no hay nada que
 * refrescar contra el cloud — poll = false.
 *
 * Defaults:
 *   - Cloud mode ON  → 30000 ms (30 seg). Balance entre frescura y carga.
 *   - Cloud mode OFF → false (sin polling).
 *
 * Bonus: TanStack respeta `refetchOnWindowFocus` por defecto, así que
 * además del polling pasivo, cuando volvés a la ventana (alt-tab, etc)
 * también se refresca. Eso ya estaba habilitado en el QueryClient.
 */

import { useCloudAuthStore } from "../store/cloudAuthStore";
import { useUserActivity } from "./useUserActivity";

type Feature =
  | "customers" | "pipeline" | "sales" | "tasks"
  | "cash" | "followups" | "catalog"
  | "paymentMethods" | "customerTypes" | "customerTags";

/** Intervalo de polling — 5 seg cuando hay cloud activo Y el user está usando la app. */
const POLL_INTERVAL_MS = 5_000;
/**
 * Intervalo cuando el user está idle (2min sin tocar nada). Bajamos a 30s
 * — sigue siendo "casi real time" para cuando vuelve, pero 6x menos carga.
 * Cuando vuelva al uso activo, useUserActivity emite el cambio y TanStack
 * Query reacciona automáticamente al nuevo refetchInterval.
 */
const POLL_INTERVAL_IDLE_MS = 30_000;

/**
 * staleTime se computa dinámicamente como `interval - 500ms` dentro del
 * hook (ver useCloudQueryConfig). Idea: navegar entre pantallas NO debe
 * disparar un refetch si el último poll fue reciente — el staleTime un
 * pelín menor que el poll garantiza eso en ambos modos (activo: 4.5s,
 * idle: 29.5s).
 */

/**
 * Hook que el caller pasa directamente a TanStack Query como
 * `refetchInterval`. Reactivo — si cambia el cloud mode de la feature,
 * el polling se prende/apaga sin remountar nada.
 */
export function useCloudPolling(feature: Feature): number | false {
  return useCloudQueryConfig(feature).refetchInterval;
}

/**
 * Versión que devuelve { refetchInterval, staleTime } juntos. Recomendado
 * para queries nuevas:
 *
 *   const { refetchInterval, staleTime } = useCloudQueryConfig("customers");
 *   useQuery({ ..., refetchInterval, staleTime });
 *
 * En cloud mode: poll 5s + staleTime 4.5s (evita refetch redundantes en
 * navegación). En local: sin polling + staleTime infinito (los datos
 * locales nunca cambian sin que la app los mutate).
 */
export function useCloudQueryConfig(feature: Feature): {
  refetchInterval: number | false;
  staleTime: number;
} {
  const jwt = useCloudAuthStore((s) => s.jwt);
  const activeWorkspaceId = useCloudAuthStore((s) => s.activeWorkspaceId);
  const expiresAt = useCloudAuthStore((s) => s.expiresAt);
  const bootstrapStatus = useCloudAuthStore((s) => s.bootstrapStatus);
  const workspaces = useCloudAuthStore((s) => s.workspaces);
  const userActive = useUserActivity();

  const isCloud = (() => {
    if (!jwt || !expiresAt || expiresAt * 1000 < Date.now()) return false;
    if (!activeWorkspaceId) return false;
    const role = workspaces.find((w) => w.id === activeWorkspaceId)?.role;
    if (role && role !== "owner") return true;
    const status = bootstrapStatus[activeWorkspaceId]?.[feature];
    return status === "done" || status === "skip";
  })();

  if (!isCloud) return { refetchInterval: false, staleTime: Infinity };
  const interval = userActive ? POLL_INTERVAL_MS : POLL_INTERVAL_IDLE_MS;
  // Stale: usamos el mismo gap entre poll y stale (0.5s menos) — funciona
  // para los dos modos. En idle quedamos con 29.5s staleTime → si navegás
  // entre pantallas sigue sirviendo cache local en vez de pegarle de nuevo.
  const staleTime = Math.max(0, interval - 500);
  return { refetchInterval: interval, staleTime };
}
