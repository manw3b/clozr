/**
 * useIndustry — devuelve la `IndustryConfig` del workspace activo.
 *
 * El campo `industry` vive en el workspace (`cloud_workspaces.industry`
 * cuando hay cloud, `workspaces.industry` cuando es local). Si no existe
 * todavía (cold start de un workspace pre-F), default es "generic".
 *
 * Ver docs/ROADMAP.md §3 para el modelo.
 *
 * Hoy solo "generic" está registrado en INDUSTRIES — el resto vendrá
 * cuando se monten rubros pagos.
 */

import { useWorkspaceStore } from "../store/workspaceStore";
import { useCloudAuthStore } from "../store/cloudAuthStore";
import { getIndustry, type IndustryConfig } from "./industries";

export function useIndustry(): IndustryConfig {
  // Preferimos cloud workspace si hay sesión activa con workspace.
  const cloudWs = useCloudAuthStore((s) => {
    if (!s.activeWorkspaceId) return null;
    return s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? null;
  });
  const localWs = useWorkspaceStore((s) => s.activeWorkspace);

  // Cloud workspace puede tener `industry` cuando lo agreguemos al schema
  // de cloud_workspaces. Hoy es undefined → default generic. El cast es
  // defensivo — schema actual no tiene `industry` aún.
  const industrySlug =
    (cloudWs as { industry?: string } | null)?.industry ??
    (localWs as { industry?: string } | null)?.industry ??
    "generic";

  return getIndustry(industrySlug);
}
