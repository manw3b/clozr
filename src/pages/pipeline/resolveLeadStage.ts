/**
 * Resuelve el stage_id de un lead a un id que efectivamente exista en
 * `pipeline_stages` del workspace.
 *
 * Históricamente la app tenía 7 etapas hard-codeadas en `types/domain.ts`
 * (prospecto, contactado, visita-agendada, presupuestado, negociando,
 * cerrado, perdido). El seed actual usa otros ids (visita_agendada con
 * guion bajo, cobrado en lugar de cerrado, etc.). Y el usuario puede
 * además renombrar/borrar etapas.
 *
 * Resultado: leads viejos quedan "huérfanos" — su stage_id no matchea
 * ninguna columna y desaparecen del kanban. Esta función los recupera
 * mediante una serie de heurísticas:
 *
 *   1. Match exacto por id (caso normal).
 *   2. Match normalizado: ignora guiones/underscores/espacios y case.
 *      Cubre `visita-agendada` ↔ `visita_agendada` ↔ `Visita Agendada`.
 *   3. Aliases legacy fijos: `cerrado` → primera etapa con isWon=true.
 *   4. Fallback final: primera etapa no-terminal.
 */

import type { StageConfig } from "../../types/domain";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, "");
}

const LEGACY_ALIASES: Record<string, "won" | "lost"> = {
  cerrado: "won",
  closed: "won",
  ganado: "won",
  perdido: "lost",
  lost: "lost",
};

export function resolveLeadStage(
  rawStage: string,
  stages: StageConfig[],
): string {
  if (stages.length === 0) return rawStage;

  // 1. Exacto
  if (stages.some((s) => s.id === rawStage)) return rawStage;

  // 2. Normalizado (visita-agendada ≈ visita_agendada)
  const normRaw = normalize(rawStage);
  const byNorm = stages.find(
    (s) => normalize(s.id) === normRaw || normalize(s.label) === normRaw,
  );
  if (byNorm) return byNorm.id;

  // 3. Aliases legacy → matchear por flag
  const alias = LEGACY_ALIASES[rawStage.toLowerCase()];
  if (alias === "won") {
    const won = stages.find((s) => s.isWon);
    if (won) return won.id;
  }
  if (alias === "lost") {
    const lost = stages.find((s) => s.isLost);
    if (lost) return lost.id;
  }

  // 4. Fallback: primera etapa no-terminal (mantener el lead "vivo").
  const firstOpen = stages.find((s) => !s.terminal);
  return firstOpen?.id ?? stages[0]!.id;
}

/** True si el id NO matchea ninguna etapa exacta — el lead necesita
 *  ser "rescatado" mediante resolveLeadStage. */
export function isOrphanStage(rawStage: string, stages: StageConfig[]): boolean {
  return stages.length > 0 && !stages.some((s) => s.id === rawStage);
}
