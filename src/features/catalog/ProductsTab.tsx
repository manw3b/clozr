import { useState, useCallback, useEffect } from "react";
import { Edit2, Hash, Trash2, Package } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { catalogDb } from "../../lib/db/catalog";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useUIStore } from "../../store/uiStore";
import { formatCurrency } from "../../lib/hooks";
import { resolveImageUrl } from "../../lib/images";
import { categoryEmoji } from "../../lib/templates/productImageMap";
import type { CatalogItemWithImeis } from "../../lib/db/types";

interface Props {
  onEdit: (item: CatalogItemWithImeis) => void;
  onAddImeis: (item: CatalogItemWithImeis) => void;
  onAdjust: (item: CatalogItemWithImeis) => void;
}

function ProductThumbnail({ imagePath, category }: { imagePath: string | null | undefined; category: string | null | undefined }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imagePath) { setUrl(null); return; }
    resolveImageUrl(imagePath).then(setUrl).catch(() => setUrl(null));
  }, [imagePath]);

  return (
    <div style={{
      width: 40, height: 40, borderRadius: 6,
      overflow: "hidden", flexShrink: 0,
      background: "var(--surface-2)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {url ? (
        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
      ) : category ? (
        <span style={{ fontSize: 18 }}>{categoryEmoji(category)}</span>
      ) : (
        <Package size={16} color="var(--text-dim)" />
      )}
    </div>
  );
}

function ConditionBadge({ item }: { item: CatalogItemWithImeis }) {
  const condition = item.condition ?? "new";
  if (condition === "new") {
    return (
      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "rgba(48,209,88,0.15)", color: "var(--success)" }}>
        Nuevo
      </span>
    );
  }
  if (condition === "refurbished") {
    return (
      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "rgba(10,132,255,0.15)", color: "var(--info)" }}>
        Reacond.
      </span>
    );
  }
  const grade = item.conditionDetails?.grade;
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "rgba(255,214,10,0.15)", color: "var(--warning)" }}>
      {grade ? `Usado - Grado ${grade}` : "Usado"}
    </span>
  );
}

export default function ProductsTab({ onEdit, onAddImeis, onAdjust }: Props) {
  const { activeWorkspace } = useWorkspaceStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const wid = activeWorkspace?.id ?? "";

  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [editStockValue, setEditStockValue] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["catalog", wid],
    queryFn: () => catalogDb.getAll(wid),
    enabled: !!wid,
  });

  const { data: summary } = useQuery({
    queryKey: ["catalog-summary", wid],
    queryFn: () => catalogDb.getInventorySummary(wid),
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => catalogDb.softDelete(wid, id),
    onSuccess: () => { invalidate(); showToast("Producto eliminado", "success"); },
    onError: () => showToast("Error al eliminar el producto"),
  });

  const handleStockSave = (item: CatalogItemWithImeis) => {
    const val = parseInt(editStockValue);
    if (!isNaN(val) && val !== item.stock) {
      updateMutation.mutate({ id: item.id, data: { stock: Math.max(0, val) } });
    }
    setEditingStockId(null);
  };

  const handleToggleTrackStock = (item: CatalogItemWithImeis) => {
    updateMutation.mutate({ id: item.id, data: { track_stock: item.track_stock === 0 } });
  };

  const handleDelete = (item: CatalogItemWithImeis) => {
    if (!confirm(`¿Eliminar "${item.name}"? Esta acción no se puede deshacer.`)) return;
    deleteMutation.mutate(item.id);
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

  const summaryCards = [
    { label: "Total items", value: String(summary?.total_items ?? 0) },
    { label: "Con stock", value: String(summary?.in_stock ?? 0), color: "var(--success)" },
    { label: "Sin stock", value: String(summary?.out_of_stock ?? 0), color: (summary?.out_of_stock ?? 0) > 0 ? "var(--primary)" : undefined },
    { label: "Valor inventario", value: formatCurrency(summary?.total_value ?? 0) },
  ];

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {summaryCards.map((card) => (
          <div key={card.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
            <p style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
              {card.label}
            </p>
            <p style={{ fontSize: 20, fontWeight: 700, color: card.color ?? "var(--text)", letterSpacing: -0.5 }}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: 24, color: "var(--text-dim)", fontSize: 13 }}>Cargando...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-dim)", fontSize: 14 }}>
          No hay productos en el catálogo
        </div>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["", "Nombre", "Condición", "Categoría", "Precio", "Moneda", "Stock", "Ctrl. stock", "Acciones"].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ProductRow
                  key={item.id}
                  item={item}
                  editingStockId={editingStockId}
                  editStockValue={editStockValue}
                  onStockFocus={() => { setEditingStockId(item.id); setEditStockValue(String(item.stock)); }}
                  onStockChange={setEditStockValue}
                  onStockBlur={() => handleStockSave(item)}
                  onStockKeyDown={(e) => { if (e.key === "Enter") handleStockSave(item); if (e.key === "Escape") setEditingStockId(null); }}
                  onToggleTrack={() => handleToggleTrackStock(item)}
                  onEdit={() => onEdit(item)}
                  onAddImeis={() => onAddImeis(item)}
                  onAdjust={() => onAdjust(item)}
                  onDelete={() => handleDelete(item)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProductRow({
  item,
  editingStockId,
  editStockValue,
  onStockFocus,
  onStockChange,
  onStockBlur,
  onStockKeyDown,
  onToggleTrack,
  onEdit,
  onAddImeis,
  onAdjust,
  onDelete,
}: {
  item: CatalogItemWithImeis;
  editingStockId: string | null;
  editStockValue: string;
  onStockFocus: () => void;
  onStockChange: (v: string) => void;
  onStockBlur: () => void;
  onStockKeyDown: (e: React.KeyboardEvent) => void;
  onToggleTrack: () => void;
  onEdit: () => void;
  onAddImeis: () => void;
  onAdjust: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isEditingStock = editingStockId === item.id;
  const noStock = item.track_stock === 1 && item.stock === 0;
  const hasImeis = item.total_imeis > 0;

  const TD: React.CSSProperties = {
    padding: "11px 14px",
    fontSize: 13,
    color: "var(--text)",
    borderBottom: "1px solid var(--border)",
    verticalAlign: "middle",
  };

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? "rgba(255,255,255,0.02)" : "transparent", transition: "background 0.1s" }}
    >
      {/* Thumbnail */}
      <td style={{ ...TD, padding: "8px 10px 8px 14px", width: 56 }}>
        <ProductThumbnail imagePath={item.image_path} category={item.category} />
      </td>

      {/* Name */}
      <td style={TD}>
        <p style={{ fontWeight: 500 }}>{item.name}</p>
        {item.subcategory && (
          <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>{item.subcategory}</p>
        )}
      </td>

      {/* Condition */}
      <td style={TD}>
        <ConditionBadge item={item} />
      </td>

      {/* Category */}
      <td style={{ ...TD, color: "var(--text-muted)" }}>
        {item.category ?? <span style={{ color: "var(--text-dim)" }}>—</span>}
      </td>

      {/* Price */}
      <td style={{ ...TD, fontWeight: item.price !== null ? 600 : 400, color: item.price !== null ? "var(--text)" : "var(--text-dim)" }}>
        {item.price !== null ? formatCurrency(item.price, item.currency) : "—"}
      </td>

      {/* Currency */}
      <td style={{ ...TD, color: "var(--text-dim)" }}>{item.currency}</td>

      {/* Stock */}
      <td style={TD}>
        {item.track_stock === 1 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isEditingStock ? (
              <input
                type="number"
                value={editStockValue}
                onChange={(e) => onStockChange(e.target.value)}
                onBlur={onStockBlur}
                onKeyDown={onStockKeyDown}
                autoFocus
                style={{
                  width: 64, padding: "4px 8px",
                  background: "var(--surface-2)", border: "1px solid var(--primary)",
                  borderRadius: 6, color: "var(--text)", fontSize: 13, outline: "none",
                }}
              />
            ) : (
              <span
                onClick={onStockFocus}
                title="Click para editar"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "3px 9px",
                  background: noStock ? "rgba(232,0,29,0.15)" : "rgba(48,209,88,0.15)",
                  color: noStock ? "var(--primary)" : "var(--success)",
                  borderRadius: 20, fontSize: 11, fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {hasImeis ? item.available_imeis : item.stock}
                {noStock && " · Sin stock"}
              </span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>—</span>
        )}
      </td>

      {/* Track stock toggle */}
      <td style={TD}>
        <button
          onClick={onToggleTrack}
          style={{
            width: 36, height: 20, borderRadius: 10,
            background: item.track_stock === 1 ? "var(--primary)" : "var(--surface-2)",
            position: "relative", transition: "background 0.2s",
          }}
        >
          <span style={{
            position: "absolute", top: 2, left: item.track_stock === 1 ? 17 : 2,
            width: 16, height: 16, borderRadius: "50%",
            background: "#fff", transition: "left 0.2s",
          }} />
        </button>
      </td>

      {/* Actions */}
      <td style={{ ...TD, whiteSpace: "nowrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          <ActionBtn title="Editar" onClick={onEdit} icon={<Edit2 size={13} />} />
          <ActionBtn title="Gestionar IMEIs" onClick={onAddImeis} icon={<Hash size={13} />} />
          {item.track_stock === 1 && !hasImeis && (
            <ActionBtn title="Ajuste de stock" onClick={onAdjust} label="±" />
          )}
          <ActionBtn title="Eliminar" onClick={onDelete} icon={<Trash2 size={13} />} danger />
        </div>
      </td>
    </tr>
  );
}

function ActionBtn({
  title, onClick, icon, label, danger,
}: {
  title: string;
  onClick: () => void;
  icon?: React.ReactNode;
  label?: string;
  danger?: boolean;
}) {
  const [h, setH] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 28, height: 28, borderRadius: 6,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: h ? (danger ? "rgba(232,0,29,0.15)" : "var(--surface-2)") : "transparent",
        color: danger ? "var(--primary)" : "var(--text-dim)",
        fontSize: 12, fontWeight: 700,
        transition: "background 0.1s",
      }}
    >
      {icon ?? label}
    </button>
  );
}
