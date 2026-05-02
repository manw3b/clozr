import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Modal from "../../components/Modal";
import Avatar from "../../components/Avatar";
import { customersDb } from "../../lib/db/customers";
import { settingsDb } from "../../lib/db/settings";
import { useDebounce } from "../../lib/hooks";
import type { Customer } from "../../lib/db/types";

interface AddToPipelineModalProps {
  isOpen: boolean;
  workspaceId: string;
  onClose: () => void;
  onSubmit: (customerId: string, stageId: string) => Promise<unknown>;
}

export default function AddToPipelineModal({
  isOpen,
  workspaceId,
  onClose,
  onSubmit,
}: AddToPipelineModalProps) {
  const [query, setQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedStage, setSelectedStage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const debouncedQuery = useDebounce(query, 250);

  const { data: stages = [] } = useQuery({
    queryKey: ["pipeline-stages", workspaceId],
    queryFn: () => settingsDb.getPipelineStages(workspaceId),
    enabled: isOpen && !!workspaceId,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-search", workspaceId, debouncedQuery],
    queryFn: () => customersDb.search(workspaceId, { query: debouncedQuery }),
    enabled: isOpen && !!workspaceId,
  });

  // Set default stage when stages load
  useEffect(() => {
    if (stages.length > 0 && !selectedStage) {
      const firstActive = stages.find((s) => !s.is_won && !s.is_lost);
      setSelectedStage(firstActive?.id ?? stages[0].id);
    }
  }, [stages, selectedStage]);

  const entrableStages = stages.filter((s) => !s.is_won && !s.is_lost);

  const handle = async () => {
    if (!selectedCustomer || !selectedStage) return;
    setSubmitting(true);
    await onSubmit(selectedCustomer.id, selectedStage);
    setQuery("");
    setSelectedCustomer(null);
    setSelectedStage("");
    setSubmitting(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Agregar al pipeline">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {!selectedCustomer ? (
          <>
            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "0 12px",
              background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8,
            }}>
              <Search size={14} style={{ color: "var(--text-tertiary)" }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar cliente..."
                autoFocus
                style={{
                  flex: 1, padding: "10px 0", background: "transparent",
                  border: "none", color: "var(--text-primary)", fontSize: 14, outline: "none",
                }}
              />
            </div>
            <div style={{ maxHeight: 220, overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCustomer(c)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    background: "var(--surface-2)", borderRadius: 8, textAlign: "left",
                  }}
                >
                  <Avatar name={c.name} size={32} />
                  <span style={{ fontSize: 14, color: "var(--text-primary)" }}>{c.name}</span>
                </button>
              ))}
              {customers.length === 0 && query && (
                <p style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "8px 0" }}>Sin resultados</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              background: "var(--surface-2)", borderRadius: 8,
            }}>
              <Avatar name={selectedCustomer.name} size={32} />
              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", flex: 1 }}>
                {selectedCustomer.name}
              </span>
              <button onClick={() => setSelectedCustomer(null)} style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                Cambiar
              </button>
            </div>

            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
                Etapa inicial
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {entrableStages.map((stage) => (
                  <button
                    key={stage.id}
                    onClick={() => setSelectedStage(stage.id)}
                    style={{
                      padding: "9px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500, textAlign: "left",
                      background: selectedStage === stage.id ? "var(--brand)" : "var(--surface-2)",
                      color: selectedStage === stage.id ? "#fff" : "var(--text-secondary)",
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    {stage.name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={onClose}
                style={{ flex: 1, padding: "12px", background: "var(--surface-2)", borderRadius: 10, fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}
              >
                Cancelar
              </button>
              <button
                onClick={handle}
                disabled={submitting || !selectedStage}
                style={{
                  flex: 2, padding: "12px",
                  background: submitting || !selectedStage ? "var(--surface-3)" : "var(--brand)",
                  borderRadius: 10, fontSize: 14, fontWeight: 600,
                  color: submitting || !selectedStage ? "var(--text-tertiary)" : "#fff",
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Agregando..." : "Agregar al pipeline"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
