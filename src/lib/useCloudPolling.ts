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

/** Intervalo default — 30 seg. Configurable acá si en el futuro queremos
 *  por feature (pipeline más rápido, catálogo más lento, etc). */
const POLL_INTERVAL_MS = 30_000;

/**
 * Hook que el caller pasa directamente a TanStack Query como
 * `refetchInterval`. Reactivo — si cambia el cloud mode de la feature,
 * el polling se prende/apaga sin remountar nada.
 */
export function useCloudPolling(feature: Feature): number | false {
  // Suscribimos a los campos relevantes para que cambios disparen
  // re-render. zustand selector — barato.
  const jwt = useCloudAuthStore((s) => s.jwt);
  const activeWorkspaceId = useCloudAuthStore((s) => s.activeWorkspaceId);
  const expiresAt = useCloudAuthStore((s) => s.expiresAt);
  const bootstrapStatus = useCloudAuthStore((s) => s.bootstrapStatus);
  const workspaces = useCloudAuthStore((s) => s.workspaces);

  // Replicamos la lógica de isCloudModeFor() sin invocarla por el get()
  // — necesitamos reactividad a los selectores arriba.
  if (!jwt || !expiresAt || expiresAt * 1000 < Date.now()) return false;
  if (!activeWorkspaceId) return false;
  const role = workspaces.find((w) => w.id === activeWorkspaceId)?.role;
  if (role && role !== "owner") return POLL_INTERVAL_MS;
  const status = bootstrapStatus[activeWorkspaceId]?.[feature];
  if (status === "done" || status === "skip") return POLL_INTERVAL_MS;
  return false;
}
