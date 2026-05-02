import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { pipelineDb } from "../../lib/db/pipeline";
import { formatDate, getInactiveDays } from "../../lib/hooks";
import type { PipelineItem, PipelineStage, ActivityResult } from "../../lib/db/types";
import AddNoteModal from "./AddNoteModal";

interface PipelineDetailSheetProps {
  item: PipelineItem;
  stages: PipelineStage[];
  onStageChange: (stageId: string) => Promise<unknown>;
  onNoteAdd: (description: string, result: ActivityResult) => Promise<unknown>;
}

export default function PipelineDetailSheet({
  item,
  stages,
  onStageChange,
  onNoteAdd,
}: PipelineDetailSheetProps) {
  const [showAddNote, setShowAddNote] = useState(false);

  const { data: activities = [] } = useQuery({
    queryKey: ["activities", item.id],
    queryFn: () => pipelineDb.getActivities(item.id),
  });

  const days = getInactiveDays(item.last_activity_at, item.created_at);

  const resultColor = (result: string | null) => {
    if (result === "positivo") return "var(--green)";
    if (result === "negativo") return "var(--brand-light)";
    return "var(--amber)";
  };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Header */}
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.3 }}>
            {item.customer_name ?? "Sin nombre"}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", background: "var(--surface-2)", padding: "2px 8px", borderRadius: 5 }}>
              {item.stage_name}
            </span>
            {days > 0 && (
              <span style={{ fontSize: 12, color: days > 14 ? "var(--brand-light)" : "var(--amber)" }}>
                {days} días sin actividad
              </span>
            )}
          </div>
          {item.estimated_value != null && (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 6 }}>
              Valor estimado: ${item.estimated_value.toLocaleString("es-AR")} {item.currency}
            </p>
          )}
        </div>

        {/* Stage selector */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
            Etapa
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
            {stages.map((stage) => (
              <button
                key={stage.id}
                onClick={() => onStageChange(stage.id)}
                style={{
                  padding: "7px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, textAlign: "left",
                  background: item.stage_id === stage.id ? "var(--brand)" : "var(--surface-2)",
                  color: item.stage_id === stage.id ? "#fff" : "var(--text-secondary)",
                  border: item.stage_id === stage.id ? "1px solid var(--brand)" : "1px solid var(--border)",
                  transition: "all 0.12s",
                }}
              >
                {stage.name}
              </button>
            ))}
          </div>
        </div>

        {/* Activity */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Actividad
            </p>
            <button
              onClick={() => setShowAddNote(true)}
              style={{
                display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600,
                color: "var(--brand)", padding: "4px 8px", background: "var(--red-bg)", borderRadius: 6,
              }}
            >
              <Plus size={12} />
              Nota
            </button>
          </div>

          {activities.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Sin actividad registrada</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {activities.map((act) => (
                <div key={act.id} style={{
                  padding: "10px 12px", background: "var(--surface-2)",
                  borderRadius: 8, borderLeft: `3px solid ${resultColor(act.result)}`,
                }}>
                  <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.4 }}>{act.description}</p>
                  <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>{formatDate(act.performed_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AddNoteModal
        isOpen={showAddNote}
        onClose={() => setShowAddNote(false)}
        onSubmit={async (desc, res) => {
          await onNoteAdd(desc, res);
          setShowAddNote(false);
        }}
      />
    </>
  );
}
