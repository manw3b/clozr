import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { pipelineDb } from "../../lib/db/pipeline";
import type { Lead, LeadStage, LeadPriority } from "../../types/domain";
import { STAGES } from "../../types/domain";
import type { PipelineItem } from "../../lib/db/types";

const STAGE_LABEL_TO_ID: Record<string, LeadStage> = {
  "prospecto": "prospecto",
  "prospect": "prospecto",
  "contactado": "contactado",
  "contacted": "contactado",
  "visita agendada": "visita-agendada",
  "visita-agendada": "visita-agendada",
  "presupuestado": "presupuestado",
  "negociando": "negociando",
  "cerrado": "cerrado",
  "perdido": "perdido",
};

function stageFromDb(stageNameOrId: string): LeadStage {
  const key = stageNameOrId.toLowerCase().trim();
  return STAGE_LABEL_TO_ID[key] ?? "prospecto";
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function priorityFromInactive(days: number): LeadPriority {
  if (days >= 14) return "low";
  if (days >= 7) return "medium";
  return "high";
}

export function dbItemToLead(p: PipelineItem): Lead {
  return {
    id: p.id,
    clientId: p.customer_id,
    clientName: p.customer_name ?? "Sin cliente",
    clientInitials: initials(p.customer_name),
    stage: stageFromDb(p.stage_name ?? p.stage_id),
    amount: p.estimated_value ?? undefined,
    currency: (p.currency as "ARS" | "USD") ?? "ARS",
    priority: priorityFromInactive(p.inactive_days ?? 0),
    createdAt: p.created_at,
    stageChangedAt: p.updated_at,
  };
}

export function usePipelineLeads() {
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";
  return useQuery({
    queryKey: ["pipeline", wid],
    queryFn: async () => {
      const items = await pipelineDb.getAll(wid);
      return items.map(dbItemToLead);
    },
    enabled: !!wid,
  });
}

export function useMoveLead() {
  const qc = useQueryClient();
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";

  return useMutation({
    mutationFn: async ({ leadId, newStage }: { leadId: string; newStage: LeadStage }) => {
      const stageConfig = STAGES.find((s) => s.id === newStage);
      const stageOrder = STAGES.findIndex((s) => s.id === newStage);
      if (!stageConfig) return;
      await pipelineDb.updateStage(leadId, newStage, stageConfig.label, stageOrder);
    },
    onMutate: async ({ leadId, newStage }) => {
      await qc.cancelQueries({ queryKey: ["pipeline", wid] });
      const prev = qc.getQueryData<Lead[]>(["pipeline", wid]);
      qc.setQueryData<Lead[]>(["pipeline", wid], (old) =>
        old?.map((l) =>
          l.id === leadId ? { ...l, stage: newStage, stageChangedAt: new Date().toISOString() } : l,
        ),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["pipeline", wid], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}
