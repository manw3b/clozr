import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { pipelineDb } from "../../lib/db/pipeline";
import { dbItemToLead } from "../../lib/mappers";
import { qk, invalidate } from "../../lib/queryKeys";
import { STAGES } from "../../types/domain";
import type { Lead, LeadStage } from "../../types/domain";

export function usePipelineLeads() {
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";
  return useQuery({
    queryKey: qk.pipelineLeads(wid),
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
      await qc.cancelQueries({ queryKey: qk.pipelineLeads(wid) });
      const prev = qc.getQueryData<Lead[]>(qk.pipelineLeads(wid));
      qc.setQueryData<Lead[]>(qk.pipelineLeads(wid), (old) =>
        old?.map((l) =>
          l.id === leadId ? { ...l, stage: newStage, stageChangedAt: new Date().toISOString() } : l,
        ),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.pipelineLeads(wid), ctx.prev);
    },
    onSettled: () => invalidate.afterLeadChange(qc),
  });
}
