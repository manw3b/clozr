import { useState, useEffect, useCallback } from "react";
import { Package, Search, CheckCircle, Trash2, Plus } from "lucide-react";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useUIStore } from "../../store/uiStore";
import { getTemplateImageUrl } from "../../lib/templates/productImageMap";
import {
  getStockItems,
  getStockSummary,
  markStockItemSold,
  deleteStockItem,
  type StockItemWithDetails,
  type StockSummary,
  type PreSelectedUnit,
} from "../../lib/db/quickStock";

type StatusFilter = "all" | "available" | "sold";

function ProductThumb({ path, alt }: { path: string | null | undefined; alt: string }) {
  const url = path ? getTemplateImageUrl(path) : null;
  const [errored, setErrored] = useState(false);
  if (!url || errored) {
    return (
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 6,
          background: "var(--surface-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          flexShrink: 0,
        }}
      >
        📱
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      onError={() => setErrored(true)}
      style={{ width: 36, height: 36, objectFit: "contain", flexShrink: 0 }}
    />
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "14px 18px",
        flex: 1,
      }}
    >
      <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}
      </p>
      <p style={{ fontSize: 24, fontWeight: 800, color }}>{value}</p>
    </div>
  );
}

export interface StockListScreenProps {
  onQuickLoad?: () => void;
  modelFilter?: string;
  onSellUnit?: (unit: PreSelectedUnit) => void;
}

export default function StockListScreen({ onQuickLoad, modelFilter, onSellUnit }: StockListScreenProps = {}) {
  const { activeWorkspace } = useWorkspaceStore();
  const { showToast, setActiveScreen } = useUIStore();

  const [items, setItems] = useState<StockItemWithDetails[]>([]);
  const [summary, setSummary] = useState<StockSummary>({ total: 0, available: 0, sold: 0 });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspace?.id) return;
    setLoading(true);
    try {
      const effectiveSearch = modelFilter && !search.trim() ? modelFilter : (search.trim() || undefined);
      const [fetchedItems, fetchedSummary] = await Promise.all([
        getStockItems(activeWorkspace.id, {
          status: statusFilter === "all" ? undefined : statusFilter,
          search: effectiveSearch,
        }),
        getStockSummary(activeWorkspace.id),
      ]);
      setItems(fetchedItems);
      setSummary(fetchedSummary);
    } catch {
      showToast("Error al cargar stock");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace?.id, statusFilter, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load]);

  const handleMarkSold = async (id: string) => {
    try {
      await markStockItemSold(id);
      load();
    } catch {
      showToast("Error al marcar como vendido");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteStockItem(id);
      setConfirmDelete(null);
      load();
    } catch {
      showToast("Error al eliminar");
    }
  };

  const filterTabStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px",
    borderRadius: 20,
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    background: active ? "var(--primary)" : "transparent",
    color: active ? "#fff" : "var(--text-muted)",
    cursor: "pointer",
    border: active ? "none" : "1px solid var(--border)",
    transition: "background 0.15s, color 0.15s",
  });

  const statusBadge = (status: string) => {
    const isAvail = status === "available";
    return (
      <span
        style={{
          padding: "3px 10px",
          borderRadius: 12,
          fontSize: 11,
          fontWeight: 600,
          background: isAvail ? "rgba(34,197,94,0.15)" : "rgba(148,163,184,0.15)",
          color: isAvail ? "var(--green, #22c55e)" : "var(--text-muted)",
        }}
      >
        {isAvail ? "Disponible" : "Vendido"}
      </span>
    );
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* Header */}
      <div style={{ padding: "20px 28px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Package size={18} color="var(--primary)" />
            <h1 style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>Stock</h1>
          </div>
          <button
            onClick={() => onQuickLoad ? onQuickLoad() : setActiveScreen("stock")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              background: "var(--primary)",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            <Plus size={14} />
            Carga rápida
          </button>
        </div>

        {/* Summary cards */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <SummaryCard label="Total en stock" value={summary.total} color="var(--text)" />
          <SummaryCard label="Disponibles" value={summary.available} color="var(--green, #22c55e)" />
          <SummaryCard label="Vendidos" value={summary.sold} color="var(--text-muted)" />
        </div>

        {/* Filters row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {(["all", "available", "sold"] as StatusFilter[]).map((f) => (
              <button key={f} onClick={() => setStatusFilter(f)} style={filterTabStyle(statusFilter === f)}>
                {f === "all" ? "Todos" : f === "available" ? "Disponibles" : "Vendidos"}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por IMEI o modelo..."
              style={{
                width: "100%",
                padding: "7px 12px 7px 32px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text)",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
            Cargando...
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center" }}>
            <Package size={40} color="var(--text-muted)" style={{ margin: "0 auto 12px" }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
              {search || statusFilter !== "all" ? "Sin resultados" : "Stock vacío"}
            </p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
              {search || statusFilter !== "all"
                ? "Probá ajustando los filtros"
                : "Usá la carga rápida para agregar equipos"}
            </p>
            {statusFilter === "all" && !search && (
              <button
                onClick={() => onQuickLoad ? onQuickLoad() : setActiveScreen("stock")}
                style={{
                  padding: "10px 20px",
                  background: "var(--primary)",
                  color: "#fff",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Carga rápida
              </button>
            )}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["", "Modelo", "Color", "Capacidad", "IMEI", "Estado", "Fecha", ""].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      background: "var(--surface)",
                      position: "sticky",
                      top: 0,
                      zIndex: 1,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  style={{ borderBottom: "1px solid var(--border)", transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "10px 16px" }}>
                    <ProductThumb path={item.image_path} alt={item.model_name} />
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <p style={{ fontWeight: 600, color: "var(--text)" }}>{item.model_name}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{item.category_name}</p>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {item.color_hex && (
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: item.color_hex,
                            border: "1px solid var(--border)",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span style={{ color: "var(--text)" }}>{item.color}</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 16px", color: "var(--text)" }}>{item.storage}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--text)", letterSpacing: "0.05em" }}>
                      {item.imei}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px" }}>{statusBadge(item.status)}</td>
                  <td style={{ padding: "10px 16px", color: "var(--text-muted)", fontSize: 12 }}>
                    {item.created_at?.slice(0, 10)}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {item.status === "available" && onSellUnit && (
                        <button
                          onClick={() => onSellUnit({
                            stockItemId: item.id,
                            imei: item.imei,
                            variantId: item.variant_id,
                            modelName: item.model_name,
                            color: item.color,
                            storage: item.storage || null,
                            colorHex: item.color_hex || null,
                            imagePath: item.image_path || null,
                          })}
                          title="Vender esta unidad"
                          style={{ padding: "5px 10px", background: "rgba(34,197,94,0.12)", color: "var(--green, #22c55e)", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                        >
                          ⚡ Vender
                        </button>
                      )}
                      {item.status === "available" && !onSellUnit && (
                        <button
                          onClick={() => handleMarkSold(item.id)}
                          title="Marcar como vendido"
                          style={{ padding: "5px 10px", background: "rgba(34,197,94,0.12)", color: "var(--green, #22c55e)", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                        >
                          <CheckCircle size={12} />
                          Vendido
                        </button>
                      )}
                      {confirmDelete === item.id ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            onClick={() => handleDelete(item.id)}
                            style={{
                              padding: "5px 8px",
                              background: "rgba(239,68,68,0.12)",
                              color: "var(--red, #ef4444)",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            style={{
                              padding: "5px 8px",
                              background: "var(--surface-2)",
                              color: "var(--text-muted)",
                              borderRadius: 6,
                              fontSize: 11,
                              cursor: "pointer",
                            }}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(item.id)}
                          title="Eliminar"
                          style={{
                            padding: "5px 7px",
                            color: "var(--text-muted)",
                            background: "none",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
