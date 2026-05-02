import { useState, useCallback } from "react";
import { Plus } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pipelineDb } from "../../lib/db/pipeline";
import { settingsDb } from "../../lib/db/settings";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useAuthStore } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import { getInactiveDays } from "../../lib/hooks";
import { INACTIVE_CRITICAL_DAYS } from "../../lib/constants";
import SidePanel from "../../components/SidePanel";
import PipelineCard from "./PipelineCard";
import PipelineDetailSheet from "./PipelineDetailSheet";
import AddToPipelineModal from "./AddToPipelineModal";
import type { PipelineItem, PipelineStage, ActivityResult } from "../../lib/db/types";

function DraggableCard({
  item,
  selected,
  onPress,
}: {
  item: PipelineItem;
  selected: boolean;
  onPress: (item: PipelineItem) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.4 : 1, transition: "opacity 0.15s", touchAction: "none" }}
    >
      <PipelineCard item={item} selected={selected} onPress={onPress} />
    </div>
  );
}

function DroppableColumn({
  stageId,
  children,
}: {
  stageId: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        overflowY: "auto",
        paddingRight: 2,
        border: `1px solid ${isOver ? "var(--brand)" : "transparent"}`,
        borderRadius: 10,
        transition: "border-color 0.15s, background 0.12s ease",
        background: isOver ? "var(--surface-2)" : "transparent",
        padding: isOver ? 4 : 0,
      }}
    >
      {children}
    </div>
  );
}

export default function PipelineScreen() {
  const { activeWorkspace } = useWorkspaceStore();
  const { userId } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const wid = activeWorkspace?.id ?? "";

  const [selected, setSelected] = useState<PipelineItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const { data: stages = [], isLoading: stagesLoading } = useQuery({
    queryKey: ["pipeline-stages", wid],
    queryFn: () => settingsDb.getPipelineStages(wid),
    enabled: !!wid,
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["pipeline-open", wid],
    queryFn: () => pipelineDb.getAll(wid),
    enabled: !!wid,
  });

  const isLoading = stagesLoading || itemsLoading;

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["pipeline-open", wid] }),
    [queryClient, wid],
  );

  const createMutation = useMutation({
    mutationFn: ({ customerId, stageId }: { customerId: string; stageId: string }) => {
      const stage = stages.find((s) => s.id === stageId);
      if (!stage) throw new Error("Etapa no encontrada");
      return pipelineDb.create(wid, {
        customer_id: customerId,
        stage_id: stage.id,
        stage_name: stage.name,
        stage_order: stage.stage_order,
        created_by: userId ?? undefined,
      });
    },
    onSuccess: () => {
      invalidate();
      setShowAdd(false);
      showToast("Lead agregado al pipeline", "success");
    },
    onError: () => showToast("Error al agregar lead"),
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string }) => {
      const stage = stages.find((s) => s.id === stageId);
      if (!stage) throw new Error("Etapa no encontrada");
      return pipelineDb.updateStage(id, stage.id, stage.name, stage.stage_order);
    },
    onSuccess: (_, { id, stageId }) => {
      const stage = stages.find((s: PipelineStage) => s.id === stageId);
      if (!stage) return;
      queryClient.setQueryData<PipelineItem[]>(["pipeline-open", wid], (old = []) =>
        old.map((p) =>
          p.id === id
            ? { ...p, stage_id: stage.id, stage_name: stage.name, stage_order: stage.stage_order }
            : p,
        ),
      );
      if (selected?.id === id)
        setSelected((prev) =>
          prev ? { ...prev, stage_id: stage.id, stage_name: stage.name, stage_order: stage.stage_order } : prev,
        );
      showToast("Etapa actualizada", "success");
    },
    onError: () => showToast("Error al actualizar etapa"),
  });

  const activityMutation = useMutation({
    mutationFn: ({
      itemId,
      description,
      result,
    }: {
      itemId: string;
      description: string;
      result: ActivityResult;
    }) =>
      pipelineDb.addActivity(itemId, {
        type: "nota",
        description,
        result,
        performed_by: userId ?? undefined,
      }),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["activities", selected?.id] });
      showToast("Nota guardada", "success");
    },
    onError: () => showToast("Error al guardar nota"),
  });

  const openCount = items.filter((p) => p.status === "open").length;
  const overdueCount = items.filter(
    (p) => getInactiveDays(p.last_activity_at, p.created_at) > INACTIVE_CRITICAL_DAYS,
  ).length;

  const byStage = stages.reduce<Record<string, PipelineItem[]>>((acc, s) => {
    acc[s.id] = items.filter((p) => p.stage_id === s.id);
    return acc;
  }, {});

  const activeDragItem = activeDragId ? items.find((i) => i.id === activeDragId) ?? null : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    const itemId = String(active.id);
    const newStageId = String(over.id);
    const item = items.find((i) => i.id === itemId);
    if (!item || item.stage_id === newStageId) return;
    stageMutation.mutate({ id: itemId, stageId: newStageId });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{
        padding: "32px 36px 24px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <h1 style={{ fontSize: 25, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.5 }}>
            Pipeline
          </h1>
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{openCount} activos</span>
            {overdueCount > 0 && (
              <span style={{ fontSize: 12.5, color: "var(--brand-light)" }}>{overdueCount} vencidos</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            height: 34, padding: "7px 14px", background: "var(--brand)",
            borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: "#fff",
            transition: "background 0.12s ease",
          }}
        >
          <Plus size={14} />
          Agregar lead
        </button>
      </div>

      {/* Kanban board */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{
          flex: 1, display: "flex", gap: 16,
          padding: "24px 36px 28px", overflowX: "auto", alignItems: "flex-start",
        }}>
          {isLoading ? (
            <div style={{ color: "var(--text-tertiary)", fontSize: 13.5, paddingTop: 8 }}>Cargando...</div>
          ) : (
            stages.map((stage) => {
              const stageItems = byStage[stage.id] ?? [];
              return (
                <div
                  key={stage.id}
                  style={{
                    width: 260, flexShrink: 0, display: "flex",
                    flexDirection: "column", gap: 10, maxHeight: "calc(100vh - 160px)",
                  }}
                >
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 12px", background: "var(--surface)",
                    border: "1px solid var(--border)", borderRadius: 12, flexShrink: 0,
                    transition: "background 0.12s ease",
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
                      {stage.name}
                    </span>
                    {stageItems.length > 0 && (
                      <span style={{
                        fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)",
                        background: "var(--surface-2)", padding: "1px 7px",
                        borderRadius: 10, minWidth: 20, textAlign: "center",
                      }}>
                        {stageItems.length}
                      </span>
                    )}
                  </div>
                  <DroppableColumn stageId={stage.id}>
                    {stageItems.length === 0 ? (
                      <div style={{
                        padding: "16px 12px", textAlign: "center", fontSize: 12.5,
                        color: "var(--text-tertiary)", border: "1px dashed var(--border)", borderRadius: 10,
                      }}>
                        Sin leads
                      </div>
                    ) : (
                      stageItems.map((item) => (
                        <DraggableCard
                          key={item.id}
                          item={item}
                          selected={selected?.id === item.id}
                          onPress={setSelected}
                        />
                      ))
                    )}
                  </DroppableColumn>
                </div>
              );
            })
          )}
        </div>

        <DragOverlay>
          {activeDragItem && (
            <div style={{ opacity: 0.9, transform: "rotate(2deg)", pointerEvents: "none" }}>
              <PipelineCard
                item={activeDragItem}
                selected={false}
                onPress={() => {}}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <SidePanel isOpen={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <PipelineDetailSheet
            item={selected}
            stages={stages}
            onStageChange={(stageId) => stageMutation.mutateAsync({ id: selected.id, stageId })}
            onNoteAdd={(description, result) =>
              activityMutation.mutateAsync({ itemId: selected.id, description, result })
            }
          />
        )}
      </SidePanel>

      <AddToPipelineModal
        isOpen={showAdd}
        workspaceId={wid}
        onClose={() => setShowAdd(false)}
        onSubmit={(customerId, stageId) =>
          createMutation.mutateAsync({ customerId, stageId })
        }
      />
    </div>
  );
}
