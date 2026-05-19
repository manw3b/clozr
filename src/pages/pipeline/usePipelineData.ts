import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useBusinessStore } from "../../store/businessStore";
import { pipelineDb } from "../../lib/db/pipeline";
import { followupsDb } from "../../lib/db/followups";
import { dbItemToLead } from "../../lib/mappers";
import { qk, invalidate } from "../../lib/queryKeys";
import { followupForStage } from "../../lib/stageFollowups";
import { getCachedStages } from "./usePipelineStages";
import type { Lead, LeadStage } from "../../types/domain";

export function usePipelineLeads() {
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";
  return useQuery({
    queryKey: qk.pipeline.leads(wid),
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
  const { activeBusiness } = useBusinessStore();
  const wid = activeWorkspace?.id ?? "";
  const bid = activeBusiness?.id ?? "";

  return useMutation({
    mutationFn: async ({ leadId, newStage }: { leadId: string; newStage: LeadStage }) => {
      // Usamos la lista dinámica del workspace (cacheada en React Query).
      const stages = getCachedStages(qc, wid);
      const stageConfig = stages.find((s) => s.id === newStage);
      const stageOrder = stages.findIndex((s) => s.id === newStage);
      if (!stageConfig) return;
      await pipelineDb.updateStage(leadId, newStage, stageConfig.label, stageOrder);

      // Auto-followup según la nueva etapa. Best-effort: si falla no
      // queremos romper el move (la persistencia del stage ya está hecha).
      const lead = qc.getQueryData<Lead[]>(qk.pipeline.leads(wid))?.find((l) => l.id === leadId);
      if (lead && lead.clientId && bid) {
        const cfg = followupForStage(newStage, lead.clientName);
        if (cfg) {
          await followupsDb
            .createStageFollowup(wid, bid, lead.clientId, lead.clientName, cfg.text, cfg.days)
            .catch(() => {});
        }
      }
    },
    onMutate: async ({ leadId, newStage }) => {
      await qc.cancelQueries({ queryKey: qk.pipeline.leads(wid) });
      const prev = qc.getQueryData<Lead[]>(qk.pipeline.leads(wid));
      qc.setQueryData<Lead[]>(qk.pipeline.leads(wid), (old) =>
        old?.map((l) =>
          l.id === leadId ? { ...l, stage: newStage, stageChangedAt: new Date().toISOString() } : l,
        ),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.pipeline.leads(wid), ctx.prev);
    },
    onSettled: () => invalidate.afterLeadChange(qc),
  });
}

/** Pospone la próxima acción de un lead. Acepta días desde ahora. La hora
 *  se mantiene si ya había una; si no, default 10:00. */
export function useSnoozeLead() {
  const qc = useQueryClient();
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";
  return useMutation({
    mutationFn: async ({ leadId, days }: { leadId: string; days: number }) => {
      // Lead actual (para preservar la hora si ya había)
      const cur = qc.getQueryData<Lead[]>(qk.pipeline.leads(wid))?.find((l) => l.id === leadId);
      const target = new Date();
      if (cur?.nextActionAt) {
        const prev = new Date(cur.nextActionAt);
        target.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
      } else {
        target.setHours(10, 0, 0, 0);
      }
      target.setDate(target.getDate() + days);
      // ISO sin segundos ni TZ — formato compatible con next_action_at del schema
      const yyyy = target.getFullYear();
      const mm = String(target.getMonth() + 1).padStart(2, "0");
      const dd = String(target.getDate()).padStart(2, "0");
      const hh = String(target.getHours()).padStart(2, "0");
      const mi = String(target.getMinutes()).padStart(2, "0");
      const iso = `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
      await pipelineDb.snooze(leadId, iso);
      return iso;
    },
    onSettled: () => invalidate.afterLeadChange(qc),
  });
}

/**
 * Agenda una visita: mueve el lead a "visita-agendada", graba la hora,
 * y si el cliente es mayorista incrementa el contador y devuelve el
 * código asignado. Devuelve el mismo lead con los campos actualizados
 * para que la UI pueda armar el mensaje de WhatsApp en el acto.
 */
export function useScheduleVisit() {
  const qc = useQueryClient();
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";

  return useMutation({
    mutationFn: async ({
      leadId,
      visitAt,
      product,
      isMayorista,
    }: {
      leadId: string;
      /** ISO local sin TZ: "YYYY-MM-DDTHH:mm" */
      visitAt: string;
      product?: string | null;
      isMayorista: boolean;
    }) => {
      // Buscamos la etapa "visita agendada" del workspace: primero por id
      // canonical, después por nombre (tolerante a guion/espacio/case).
      const stages = getCachedStages(qc, wid);
      const stageCfg =
        stages.find((s) => s.id === "visita-agendada") ??
        stages.find((s) => /visita/i.test(s.label));
      const stageOrder = stageCfg ? stages.findIndex((s) => s.id === stageCfg.id) : -1;
      if (!stageCfg) throw new Error("No hay etapa de visita configurada en este workspace");

      // Si es mayorista, generamos el código antes de persistir.
      let wholesaleCode: string | null = null;
      if (isMayorista) {
        const { workspaceSettings } = await import("../../lib/db/workspaceSettings");
        const { VISIT_TEMPLATE_KEYS, DEFAULT_VISIT_TEMPLATES, formatWholesaleCode } =
          await import("../../lib/visitTemplates");
        const prefix =
          (await workspaceSettings.get(wid, VISIT_TEMPLATE_KEYS.codePrefix)) ??
          DEFAULT_VISIT_TEMPLATES.codePrefix;
        const next = await workspaceSettings.bumpCounter(
          wid,
          VISIT_TEMPLATE_KEYS.codeCounter,
          1200,
        );
        wholesaleCode = formatWholesaleCode(prefix, next);
      }

      await pipelineDb.scheduleVisit(leadId, {
        visitAt,
        product: product ?? null,
        wholesaleCode,
        stageId: stageCfg.id,
        stageName: stageCfg.label,
        stageOrder,
      });

      return { wholesaleCode };
    },
    onSettled: () => invalidate.afterLeadChange(qc),
  });
}

/** Agrega una nota como activity al pipeline_item. */
export function useAddLeadNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, text }: { leadId: string; text: string }) => {
      await pipelineDb.addActivity(leadId, {
        type: "note",
        description: text,
      });
    },
    onSettled: () => invalidate.afterLeadChange(qc),
  });
}
