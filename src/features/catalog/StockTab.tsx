import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { catalogDb } from "../../lib/db/catalog";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useUIStore } from "../../store/uiStore";
import { formatDate } from "../../lib/hooks";
import type { StockViewItem } from "../../lib/db/types";

type StockFilter = "all" | "in" | "out" | "untracked";

const FILTERS: Array<{ value: StockFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "in", label: "Con stock" },
  { value: "out", label: "Sin stock" },
  { value: "untracked", label: "Sin control" },
];

interface Props {
  onAdjust: (item: StockViewItem) => void;
}

export default function StockTab({ onAdjust }: Props) {
  const { activeWorkspace } = useWorkspaceStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const wid = activeWorkspace?.id ?? "";

  const [filter, setFilter] = useState<StockFilter>("all");
  const [editingMinId, setEditingMinId] = useState<string | null>(null);
  const [editMinValue, setEditMinValue] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["catalog-stock", wid],
    queryFn: () => catalogDb.getStockView(wid),
    enabled: !!wid,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("catalog") });
  }, [queryClient]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof catalogDb.update>[2] }) =>
      catalogDb.update(wid, id, data),
    onSuccess: () => invalidate(),
    onError: () => showToast("Error al actualizar"),
  });

  const handleMinSave = (item: StockViewItem) => {
    const val = parseInt(editMinValue);
    if (!isNaN(val) && val !== item.stock_min) {
      updateMutation.mutate({ id: item.id, data: { stock_min: Math.max(0, val) } });
    }
    setEditingMinId(null);
  };

  const filtered = items.filter((item) => {
    if (filter === "in") return item.track_stock === 1 && item.stock > 0;
    if (filter === "out") return item.track_stock === 1 && item.stock === 0;
    if (filter === "untracked") return item.track_stock === 0;
    return true;
  });

  const stockStatus = (item: StockViewItem) => {
    if (item.track_stock === 0) return { label: "Sin control", color: "var(--text-dim)", bg: "rgba(99,99,102,0.15)" };
    if (item.stock === 0) return { label: "Sin stock", color: "var(--primary)", bg: "rgba(232,0,29,0.12)" };
    if (item.stock <= item.stock_min) return { label: "Bajo", color: "var(--warning)", bg: "rgba(255,214,10,0.12)" };
    return { label: "OK", color: "var(--success)", bg: "rgba(48,209,88,0.12)" };
  };

  const TH: React.CSSProperties = {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-dim)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    background: "var(--bg)",
    zIndex: 1,
  };

  const TD: React.CSSProperties = {
    padding: "11px 14px",
    fontSize: 13,
    color: "var(--text)",
    borderBottom: "1px solid var(--border)",
    verticalAlign: "middle",
  };

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 12,
              fontWeight: filter === f.value ? 600 : 400,
              background: filter === f.value ? "var(--primary)" : "var(--surface)",
              color: filter === f.value ? "#fff" : "var(--text-muted)",
              border: `1px solid ${filter === f.value ? "var(--primary)" : "var(--border)"}`,
              transition: "all 0.12s",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ padding: 24, color: "var(--text-dim)", fontSize: 13 }}>Cargando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-dim)", fontSize: 14 }}>
          No hay items en esta categoría
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Nombre", "Categoría", "Stock actual", "Stock mínimo", "Estado", "Última venta", ""].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const status = stockStatus(item);
                const isEditingMin = editingMinId === item.id;

                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={TD}>
                      <p style={{ fontWeight: 500 }}>{item.name}</p>
                      {item.subcategory && (
                        <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>{item.subcategory}</p>
                      )}
                    </td>
                    <td style={{ ...TD, color: "var(--text-muted)" }}>
                      {item.category ?? "—"}
                    </td>
                    <td style={{ ...TD, fontWeight: 600 }}>
                      {item.track_stock === 1 ? (
                        <span style={{ color: item.stock === 0 ? "var(--primary)" : "var(--text)" }}>
                          {item.total_imeis > 0 ? item.available_imeis : item.stock}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-dim)" }}>—</span>
                      )}
                    </td>
                    <td style={TD}>
                      {item.track_stock === 1 ? (
                        isEditingMin ? (
                          <input
                            type="number"
                            value={editMinValue}
                            onChange={(e) => setEditMinValue(e.target.value)}
                            onBlur={() => handleMinSave(item)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleMinSave(item);
                              if (e.key === "Escape") setEditingMinId(null);
                            }}
                            autoFocus
                            style={{
                              width: 64, padding: "4px 8px",
                              background: "var(--surface-2)", border: "1px solid var(--primary)",
                              borderRadius: 6, color: "var(--text)", fontSize: 13, outline: "none",
                            }}
                          />
                        ) : (
                          <span
                            onClick={() => { setEditingMinId(item.id); setEditMinValue(String(item.stock_min)); }}
                            title="Click para editar"
                            style={{ cursor: "pointer", color: "var(--text-muted)" }}
                          >
                            {item.stock_min}
                          </span>
                        )
                      ) : (
                        <span style={{ color: "var(--text-dim)" }}>—</span>
                      )}
                    </td>
                    <td style={TD}>
                      <span style={{
                        display: "inline-block", padding: "3px 9px",
                        background: status.bg, color: status.color,
                        borderRadius: 20, fontSize: 11, fontWeight: 600,
                      }}>
                        {status.label}
                      </span>
                    </td>
                    <td style={{ ...TD, color: "var(--text-dim)", fontSize: 12 }}>
                      {item.last_sale_date ? formatDate(item.last_sale_date) : "—"}
                    </td>
                    <td style={TD}>
                      {(item.track_stock === 1 || item.track_stock as unknown === true) && (item.total_imeis === 0 || item.total_imeis === null) && (
                        <button
                          onClick={() => onAdjust(item)}
                          title="Ajuste de stock"
                          style={{
                            padding: "5px 10px", borderRadius: 6,
                            background: "var(--surface-2)", border: "1px solid var(--border)",
                            fontSize: 12, color: "var(--text-muted)", fontWeight: 500,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Ajustar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
