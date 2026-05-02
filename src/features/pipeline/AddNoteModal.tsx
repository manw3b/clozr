import { useState } from "react";
import Modal from "../../components/Modal";
import type { ActivityResult } from "../../lib/db/types";

const RESULTS: Array<{ value: ActivityResult; label: string; color: string }> = [
  { value: "positivo", label: "Positivo", color: "var(--green)" },
  { value: "neutro", label: "Neutro", color: "var(--amber)" },
  { value: "negativo", label: "Negativo", color: "var(--brand-light)" },
];

interface AddNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (description: string, result: ActivityResult) => Promise<void>;
}

export default function AddNoteModal({ isOpen, onClose, onSubmit }: AddNoteModalProps) {
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<ActivityResult>("neutro");
  const [submitting, setSubmitting] = useState(false);

  const handle = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    await onSubmit(description.trim(), result);
    setDescription("");
    setResult("neutro");
    setSubmitting(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Agregar nota">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="¿Qué pasó con este lead?"
          rows={3}
          style={{
            width: "100%",
            padding: "10px 12px",
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            color: "var(--text-primary)",
            fontSize: 14,
            outline: "none",
            resize: "none",
          }}
        />

        <div>
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: 8,
            }}
          >
            Resultado
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            {RESULTS.map((r) => (
              <button
                key={r.value}
                onClick={() => setResult(r.value)}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  background: result === r.value ? r.color : "var(--surface-2)",
                  color: result === r.value ? "#fff" : "var(--text-secondary)",
                  border:
                    result === r.value
                      ? `1px solid ${r.color}`
                      : "1px solid var(--border)",
                  transition: "all 0.15s",
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "12px",
              background: "var(--surface-2)",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-secondary)",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handle}
            disabled={!description.trim() || submitting}
            style={{
              flex: 2,
              padding: "12px",
              background:
                !description.trim() || submitting
                  ? "var(--surface-3)"
                  : "var(--brand)",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              color:
                !description.trim() || submitting ? "var(--text-tertiary)" : "#fff",
              cursor: !description.trim() || submitting ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {submitting ? "Guardando..." : "Guardar nota"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
