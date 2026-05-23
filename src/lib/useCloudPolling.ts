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

type Feature =
  | "customers" | "pipeline" | "sales" | "tasks"
  | "cash" | "followups" | "catalog"
  | "paymentMethods" | "customerTypes" | "customerTags";

/** Intervalo de polling — 5 seg cuando hay cloud activo. */
const POLL_INTERVAL_MS = 5_000;

/** staleTime cuando hay cloud:
 *  - 4.5s — apenas menor que el polling. Así un cambio de pantalla DENTRO
 *    de la ventana de polling NO dispara un refetch redundante (TanStack
 *    sólo refetchea si el dato es "stale", y con el poll de 5s siempre
 *    hay un fetch reciente).
 *  - Antes era 0 (default TanStack) → cada navegación entre pantallas
 *    hacía un refetch redundante. Con polling 5s + staleTime 0 podíamos
 *    triplicar el tráfico real.
 */
const CLOUD_STALE_MS = 4_500;

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

  const isCloud = (() => {
    if (!jwt || !expiresAt || expiresAt * 1000 < Date.now()) return false;
    if (!activeWorkspaceId) return false;
    const role = workspaces.find((w) => w.id === activeWorkspaceId)?.role;
    if (role && role !== "owner") return true;
    const status = bootstrapStatus[activeWorkspaceId]?.[feature];
    return status === "done" || status === "skip";
  })();

  return isCloud
    ? { refetchInterval: POLL_INTERVAL_MS, staleTime: CLOUD_STALE_MS }
    : { refetchInterval: false, staleTime: Infinity };
}
