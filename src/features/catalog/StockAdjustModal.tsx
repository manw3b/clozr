import { useState } from "react";
import { catalogDb } from "../../lib/db/catalog";
import { useUIStore } from "../../store/uiStore";
import type { CatalogItemWithImeis } from "../../lib/db/types";

interface Props {
  item: CatalogItemWithImeis;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function StockAdjustModal({ item, onSuccess, onCancel }: Props) {
  const { showToast } = useUIStore();
  const [type, setType] = useState<"entrada" | "salida">("entrada");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const qty = Math.max(0, parseInt(quantity) || 0);
  const preview = type === "entrada" ? item.stock + qty : Math.max(0, item.stock - qty);

  const handleConfirm = async () => {
    if (!qty) return;
    setIsSubmitting(true);
    try {
      const delta = type === "entrada" ? qty : -qty;
      await catalogDb.adjustStock(item.id, delta);
      showToast(
        `Stock actualizado: ${type === "entrada" ? "+" : "-"}${qty} unidades`,
        "success",
      );
      onSuccess();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al ajustar el stock");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    background: "var(--surface-2)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div>
      {/* Product info */}
      <div style={{ padding: "12px 14px", background: "var(--surface-2)", borderRadius: 8, marginBottom: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
          {item.name}
        </p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Stock actual: <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{item.stock}</span>
        </p>
      </div>

      {/* Type selector */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { value: "entrada" as const, label: "+ Entrada", color: "var(--green)" },
          { value: "salida" as const, label: "- Salida", color: "var(--brand)" },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setType(opt.value)}
            style={{
              padding: "10px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              border: `2px solid ${type === opt.value ? opt.color : "var(--border)"}`,
              background: type === opt.value ? `${opt.color}18` : "var(--surface-2)",
              color: type === opt.value ? opt.color : "var(--text-secondary)",
              transition: "all 0.15s",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
        {/* Quantity */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
            Cantidad
          </label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            style={inputStyle}
            autoFocus
          />
        </div>

        {/* Reason */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
            Motivo (opcional)
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Recepción de mercadería"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Stock preview */}
      {qty > 0 && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, marginBottom: 16,
          background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
        }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Stock resultante:{" "}
            <span style={{ fontWeight: 700, fontSize: 15, color: preview === 0 ? "var(--brand)" : "var(--text-primary)" }}>
              {preview}
            </span>
          </p>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <button
          onClick={onCancel}
          style={{ padding: "8px 16px", background: "var(--surface-2)", borderRadius: 8, fontSize: 13, color: "var(--text-secondary)" }}
        >
          Cancelar
        </button>
        <button
          onClick={handleConfirm}
          disabled={!qty || isSubmitting}
          style={{
            padding: "8px 18px", background: "var(--brand)", borderRadius: 8,
            fontSize: 13, fontWeight: 600, color: "#fff",
            opacity: !qty || isSubmitting ? 0.5 : 1,
          }}
        >
          {isSubmitting ? "Ajustando..." : "Confirmar ajuste"}
        </button>
      </div>
    </div>
  );
}
