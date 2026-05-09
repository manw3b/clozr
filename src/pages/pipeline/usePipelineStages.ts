import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { settingsDb } from "../../lib/db/settings";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { STAGES as FALLBACK_STAGES } from "../../types/domain";
import type { StageConfig } from "../../types/domain";

/**
 * Devuelve las etapas configurables del workspace, ya transformadas al
 * shape `StageConfig` que consume la UI. Si el workspace todavía no las
 * tiene seedeadas, cae a la lista hard-coded como red de seguridad.
 *
 * Probability: la derivamos linealmente del orden (0 → 1) para que el
 * "Pipeline ponderado" siga calculando algo razonable. Las etapas marcadas
 * `is_won` reciben 1 y las `is_lost` reciben 0.
 */
export function usePipelineStages(): {
  stages: StageConfig[];
  isLoading: boolean;
} {
  const wid = useWorkspaceStore((s) => s.activeWorkspace?.id ?? "");
  const q = useQuery({
    queryKey: ["pipeline-stages", wid],
    queryFn: () => settingsDb.getPipelineStages(wid),
    enabled: !!wid,
    // Las etapas cambian rara vez — cache largo evita re-fetch innecesario.
    staleTime: 5 * 60 * 1000,
  });

  const stages = useMemo<StageConfig[]>(() => {
    const rows = q.data ?? [];
    if (rows.length === 0) return FALLBACK_STAGES;
    // Sólo etapas no-perdidas para el cálculo de probability lineal.
    const open = rows.filter((r) => r.is_lost === 0 && r.is_won === 0);
    const lastIdx = Math.max(open.length - 1, 1);
    return rows.map<StageConfig>((r) => {
      const isWon = r.is_won === 1;
      const isLost = r.is_lost === 1;
      let probability: number | undefined;
      if (isWon) probability = 1;
      else if (isLost) probability = 0;
      else {
        const idx = open.findIndex((o) => o.id === r.id);
        probability = idx >= 0 ? Math.max(0.05, idx / lastIdx) : 0.5;
      }
      return {
        id: r.id,
        label: r.name,
        color: r.color,
        terminal: isWon || isLost,
        isWon,
        isLost,
        probability,
        order: r.stage_order,
      };
    });
  }, [q.data]);

  return { stages, isLoading: q.isLoading };
}

/** Helper sync para callers fuera de React (mutaciones). Devuelve la última
 *  query cacheada o el fallback hard-coded. */
export function getCachedStages(qc: import("@tanstack/react-query").QueryClient, wid: string): StageConfig[] {
  const rows = qc.getQueryData<import("../../lib/db/types").PipelineStage[]>([
    "pipeline-stages",
    wid,
  ]);
  if (!rows || rows.length === 0) return FALLBACK_STAGES;
  return rows.map<StageConfig>((r) => ({
    id: r.id,
    label: r.name,
    color: r.color,
    terminal: r.is_won === 1 || r.is_lost === 1,
    isWon: r.is_won === 1,
    isLost: r.is_lost === 1,
    order: r.stage_order,
  }));
}
