import { useState, useEffect, useCallback, useRef } from "react";
import { Archive, Plus, Search, Pencil, Trash2, ChevronRight, Package } from "lucide-react";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useUIStore } from "../../store/uiStore";
import { catalogDb } from "../../lib/db/catalog";
import { findModelForItem } from "../../lib/db/quickStock";
import { getTemplateImageUrl, categoryEmoji } from "../../lib/templates/productImageMap";
import QuickStockScreen from "../quickStock/QuickStockScreen";
import StockListScreen from "../quickStock/StockListScreen";
import QuickSaleScreen from "./QuickSaleScreen";
import AddProductModal from "./AddProductModal";
import ItemFormModal from "../catalog/ItemFormModal";
import { Modal } from "../../components/Modal";
import type { CatalogItemWithImeis, InventorySummary } from "../../lib/db/types";
import type { ModelWithContext, PreSelectedUnit } from "../../lib/db/quickStock";

type Tab = "products" | "units";
type ProductFilter = "all" | "in-stock" | "out-of-stock" | "no-tracking";
type UnitsMode = "list" | "load" | "sale";

// ─── Helpers ──────────────────────────────────────────────────────

function resolveProductImage(item: CatalogItemWithImeis): string | null {
  if (!item.image_path) return null;
  return getTemplateImageUrl(item.image_path) ?? null;
}

function ProductImg({ item, size = 40 }: { item: CatalogItemWithImeis; size?: number }) {
  const url = resolveProductImage(item);
  const [err, setErr] = useState(false);
  if (url && !err) {
    return (
      <img
        src={url}
        alt={item.name}
        onError={() => setErr(true)}
        style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: 8, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.5, flexShrink: 0 }}>
      {categoryEmoji(item.category)}
    </div>
  );
}

function SummaryCard({ label, value, color, sub }: { label: string; value: number | string; color?: string; sub?: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, flex: 1 }}>
      <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, color: color ?? "var(--text-primary)" }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{sub}</p>}
    </div>
  );
}

// ─── Inline price cell ────────────────────────────────────────────

function PriceCell({ item, wid, onSaved }: { item: CatalogItemWithImeis; wid: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(item.price !== null ? String(item.price) : "");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    try {
      await catalogDb.update(wid, item.id, { price: val ? parseFloat(val) : null });
      setStatus("saved");
      setEditing(false);
      onSaved();
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
    }
  };

  const cancel = () => {
    setVal(item.price !== null ? String(item.price) : "");
    setEditing(false);
    setStatus("idle");
  };

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
        style={{
          width: 90, padding: "4px 8px", background: "var(--surface-2)",
          border: "1.5px solid var(--brand)", borderRadius: 6,
          color: "var(--text-primary)", fontSize: 13, outline: "none",
        }}
      />
    );
  }

  return (
    <span
      onDoubleClick={() => setEditing(true)}
      title="Doble click para editar"
      style={{
        fontSize: 13, fontWeight: 600,
        color: status === "saved" ? "var(--green, #22c55e)" : status === "error" ? "var(--red, #ef4444)" : item.price ? "var(--text-primary)" : "var(--text-secondary)",
        cursor: "text",
        padding: "3px 6px",
        borderRadius: 4,
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => ((e.target as HTMLElement).style.background = "var(--surface-2)")}
      onMouseLeave={(e) => ((e.target as HTMLElement).style.background = "transparent")}
    >
      {status === "saved" ? "✓ Guardado" : item.price !== null ? `${item.currency ?? "ARS"} ${item.price.toLocaleString()}` : "— Sin precio"}
    </span>
  );
}

// ─── Product detail panel ─────────────────────────────────────────

function ProductPanel({
  item,
  wid,
  onClose,
  onEdit,
  onDelete,
  onLoadUnits,
}: {
  item: CatalogItemWithImeis;
  wid: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onLoadUnits: () => void;
}) {
  const [sales, setSales] = useState<Array<{ sale_id: string; sale_date: string; customer_name: string | null; unit_price: number; quantity: number }>>([]);

  useEffect(() => {
    catalogDb.getRecentSalesForProduct(wid, item.id).then(setSales).catch(() => {});
  }, [item.id, wid]);

  const url = resolveProductImage(item);
  const [imgErr, setImgErr] = useState(false);

  const unitCount = (item.available_imeis ?? 0) + (item.stock ?? 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Detalle</p>
        <button onClick={onClose} style={{ color: "var(--text-secondary)", cursor: "pointer", background: "none", fontSize: 18, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>
        {/* Image + name */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 20 }}>
          {url && !imgErr
            ? <img src={url} alt={item.name} onError={() => setImgErr(true)} style={{ width: 120, height: 120, objectFit: "contain" }} />
            : <div style={{ width: 120, height: 120, borderRadius: 12, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56 }}>{categoryEmoji(item.category)}</div>
          }
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", textAlign: "center" }}>{item.name}</p>
          {item.conditionDetails?.color && <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.conditionDetails.color}{item.conditionDetails.storage ? ` · ${item.conditionDetails.storage}` : ""}</p>}
        </div>

        {/* Price */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Precio</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            {item.price !== null ? `${item.currency ?? "ARS"} ${item.price.toLocaleString()}` : "—"}
          </span>
        </div>

        {/* Units */}
        <div style={{ padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Unidades disponibles</p>
            <span style={{ fontSize: 13, fontWeight: 700, color: unitCount > 0 ? "var(--green, #22c55e)" : "var(--text-secondary)" }}>{unitCount}</span>
          </div>
          <button
            onClick={onLoadUnits}
            style={{
              width: "100%", padding: "9px", background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: 8, fontSize: 13, fontWeight: 600, color: "var(--brand)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <Plus size={13} /> Cargar unidades
          </button>
        </div>

        {/* Sale history */}
        {sales.length > 0 && (
          <div style={{ paddingTop: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
              Ventas recientes
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sales.map((s) => (
                <div key={s.sale_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)" }}>
                  <span>{s.customer_name ?? "—"}</span>
                  <span>{s.sale_date?.slice(0, 10)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
        <button onClick={onEdit} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer" }}>
          <Pencil size={12} /> Editar
        </button>
        <button onClick={onDelete} style={{ padding: "8px 10px", background: "none", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", cursor: "pointer" }}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────

export default function InventoryScreen() {
  const { activeWorkspace } = useWorkspaceStore();
  const { showToast, inventoryOpenSale, setInventoryOpenSale } = useUIStore();
  const wid = activeWorkspace?.id ?? "";

  const [tab, setTab] = useState<Tab>("products");

  // Products tab state
  const [products, setProducts] = useState<CatalogItemWithImeis[]>([]);
  const [summary, setSummary] = useState<InventorySummary>({ total_items: 0, in_stock: 0, out_of_stock: 0, total_value: 0 });
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<CatalogItemWithImeis | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogItemWithImeis | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Units tab state
  const [unitsMode, setUnitsMode] = useState<UnitsMode>("list");
  const [unitsPreSelection, setUnitsPreSelection] = useState<ModelWithContext | undefined>(undefined);
  const [unitsModelFilter, setUnitsModelFilter] = useState<string | undefined>(undefined);
  const [salePreUnit, setSalePreUnit] = useState<PreSelectedUnit | undefined>(undefined);

  // Watch inventoryOpenSale from uiStore (triggered from Topbar)
  useEffect(() => {
    if (inventoryOpenSale) {
      setTab("units");
      setUnitsMode("sale");
      setSalePreUnit(undefined);
      setInventoryOpenSale(false);
    }
  }, [inventoryOpenSale]);

  const loadProducts = useCallback(async () => {
    if (!wid) return;
    const [items, inv] = await Promise.all([
      catalogDb.getWithUnitCount(wid),
      catalogDb.getInventorySummary(wid),
    ]).catch(() => [[], { total_items: 0, in_stock: 0, out_of_stock: 0, total_value: 0 }] as [CatalogItemWithImeis[], InventorySummary]);
    setProducts(items);
    setSummary(inv);
  }, [wid]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const filteredProducts = products.filter((item) => {
    const units = (item.available_imeis ?? 0) + (item.stock ?? 0);
    if (productFilter === "in-stock" && units === 0) return false;
    if (productFilter === "out-of-stock" && (units > 0 || !item.track_stock)) return false;
    if (productFilter === "no-tracking" && item.track_stock) return false;
    if (productSearch) {
      const q = productSearch.toLowerCase();
      if (!item.name.toLowerCase().includes(q) && !(item.category ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const handleLoadUnitsForProduct = async (item: CatalogItemWithImeis) => {
    const hint = item.subcategory ?? item.name;
    const found = await findModelForItem(hint).catch(() => null);
    setUnitsPreSelection(found ?? undefined);
    setUnitsModelFilter(item.subcategory ?? item.name);
    setUnitsMode("load");
    setTab("units");
    setSelectedProduct(null);
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await catalogDb.softDelete(wid, id);
      setConfirmDelete(null);
      setSelectedProduct(null);
      loadProducts();
    } catch {
      showToast("Error al eliminar producto");
    }
  };

  const filterBtn = (val: ProductFilter, label: string) => (
    <button
      key={val}
      onClick={() => setProductFilter(val)}
      style={{
        height: 32, padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
        background: productFilter === val ? "var(--brand)" : "transparent",
        color: productFilter === val ? "#fff" : "var(--text-secondary)",
        border: productFilter === val ? "1px solid var(--brand)" : "1px solid var(--border)",
        cursor: "pointer", transition: "background 0.12s ease",
      }}
    >
      {label}
    </button>
  );

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 20px",
    fontSize: 13.5,
    fontWeight: active ? 600 : 400,
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    background: "none",
    borderBottom: active ? "2px solid var(--brand)" : "2px solid transparent",
    cursor: "pointer",
    transition: "background 0.12s ease",
    whiteSpace: "nowrap",
  });

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>

      {/* Header */}
      <div style={{ padding: "24px 28px 0", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Archive size={20} color="var(--brand)" />
            <h1 style={{ fontSize: 25, fontWeight: 700, letterSpacing: -0.5, color: "var(--text-primary)" }}>Inventario</h1>
          </div>
          {tab === "products" && (
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                height: 34, padding: "7px 14px", background: "var(--brand)", borderRadius: 8,
                fontSize: 12.5, fontWeight: 600, color: "#fff", cursor: "pointer",
                transition: "background 0.12s ease",
              }}
            >
              <Plus size={14} /> Agregar producto
            </button>
          )}
          {tab === "units" && unitsMode === "list" && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { setUnitsPreSelection(undefined); setUnitsModelFilter(undefined); setUnitsMode("load"); }}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "7px 14px", background: "var(--brand)", borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: "#fff", cursor: "pointer", transition: "background 0.12s ease" }}
              >
                <Plus size={14} /> Cargar mercadería
              </button>
              <button
                onClick={() => { setSalePreUnit(undefined); setUnitsMode("sale"); }}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "7px 14px", background: "rgba(34,197,94,0.12)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: "var(--green, #22c55e)", cursor: "pointer", transition: "background 0.12s ease" }}
              >
                ⚡ Venta rápida
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0 }}>
          <button onClick={() => setTab("products")} style={tabStyle(tab === "products")}>Productos</button>
          <button onClick={() => { setTab("units"); setUnitsMode("list"); setUnitsPreSelection(undefined); setUnitsModelFilter(undefined); }} style={tabStyle(tab === "units")}>Unidades</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>

        {/* Products tab */}
        {tab === "products" && (
          <>
            {/* Main content */}
            <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
              {/* Summary cards */}
              <div style={{ display: "flex", gap: 12, padding: "24px 28px 0" }}>
                <SummaryCard label="Total productos" value={summary.total_items} />
                <SummaryCard label="Con unidades" value={summary.in_stock} color="var(--green, #22c55e)" />
                <SummaryCard label="Sin unidades" value={summary.out_of_stock} color="var(--amber, #f59e0b)" />
                <SummaryCard
                  label="Valor total"
                  value={summary.total_value > 0 ? `$${summary.total_value.toLocaleString("es-AR", { maximumFractionDigits: 0 })}` : "—"}
                />
              </div>

              {/* Filters */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 28px" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Buscar producto..."
                    style={{ width: "100%", height: 34, padding: "7px 12px 7px 30px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13.5, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {filterBtn("all", "Todos")}
                  {filterBtn("in-stock", "Con stock")}
                  {filterBtn("out-of-stock", "Sin stock")}
                  {filterBtn("no-tracking", "Sin unidades")}
                </div>
              </div>

              {/* Table */}
              {filteredProducts.length === 0 ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 40 }}>
                  <Package size={40} color="var(--text-secondary)" />
                  <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
                    {productSearch || productFilter !== "all" ? "Sin resultados" : "Inventario vacío"}
                  </p>
                  {!productSearch && productFilter === "all" && (
                    <button onClick={() => setShowAddModal(true)} style={{ padding: "9px 18px", background: "var(--brand)", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      Agregar producto
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ flex: 1, overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        {["", "Nombre", "Variante", "Precio", "Unidades", ""].map((h, i) => (
                          <th key={i} style={{ padding: "10px 16px", textAlign: "left", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", background: "var(--surface)", position: "sticky", top: 0, zIndex: 1 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((item) => {
                        const units = (item.available_imeis ?? 0) + (item.stock ?? 0);
                        const isSelected = selectedProduct?.id === item.id;
                        return (
                          <tr
                            key={item.id}
                            onClick={() => setSelectedProduct(isSelected ? null : item)}
                            style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: isSelected ? "var(--surface)" : "transparent", transition: "background 0.12s ease" }}
                            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--surface)"; }}
                            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                          >
                            <td style={{ padding: "10px 16px" }}>
                              <ProductImg item={item} size={40} />
                            </td>
                            <td style={{ padding: "10px 16px" }}>
                              <p style={{ fontWeight: 600, color: "var(--text-primary)" }}>{item.name}</p>
                              {item.category && <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{item.category}</p>}
                            </td>
                            <td style={{ padding: "10px 16px", color: "var(--text-secondary)" }}>
                              {item.conditionDetails?.color && (
                                <span>{item.conditionDetails.color}{item.conditionDetails.storage ? ` · ${item.conditionDetails.storage}` : ""}</span>
                              )}
                            </td>
                            <td style={{ padding: "10px 16px" }}>
                              <PriceCell item={item} wid={wid} onSaved={loadProducts} />
                            </td>
                            <td style={{ padding: "10px 16px" }}>
                              {item.track_stock ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleLoadUnitsForProduct(item); }}
                                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: units > 0 ? "rgba(34,197,94,0.15)" : "rgba(148,163,184,0.15)", color: units > 0 ? "var(--green, #22c55e)" : "var(--text-secondary)", cursor: "pointer" }}
                                >
                                  {units} <ChevronRight size={10} />
                                </button>
                              ) : (
                                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Sin control</span>
                              )}
                            </td>
                            <td style={{ padding: "10px 16px" }}>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditingProduct(item); }}
                                  title="Editar"
                                  style={{ padding: "5px", color: "var(--text-secondary)", background: "none", cursor: "pointer", borderRadius: 4 }}
                                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--surface-2)")}
                                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "none")}
                                >
                                  <Pencil size={13} />
                                </button>
                                {confirmDelete === item.id ? (
                                  <div style={{ display: "flex", gap: 4 }}>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteProduct(item.id); }} style={{ padding: "4px 8px", background: "rgba(239,68,68,0.12)", color: "var(--red, #ef4444)", borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>Sí</button>
                                    <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }} style={{ padding: "4px 8px", background: "var(--surface-2)", color: "var(--text-secondary)", borderRadius: 5, fontSize: 10, cursor: "pointer" }}>No</button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(item.id); }}
                                    title="Eliminar"
                                    style={{ padding: "5px", color: "var(--text-secondary)", background: "none", cursor: "pointer", borderRadius: 4 }}
                                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--surface-2)")}
                                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "none")}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right panel */}
            {selectedProduct && (
              <div style={{ width: 320, flexShrink: 0, borderLeft: "1px solid var(--border)", background: "var(--surface)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <ProductPanel
                  item={selectedProduct}
                  wid={wid}
                  onClose={() => setSelectedProduct(null)}
                  onEdit={() => { setEditingProduct(selectedProduct); setSelectedProduct(null); }}
                  onDelete={() => { setConfirmDelete(selectedProduct.id); setSelectedProduct(null); }}
                  onLoadUnits={() => handleLoadUnitsForProduct(selectedProduct)}
                />
              </div>
            )}
          </>
        )}

        {/* Units tab */}
        {tab === "units" && (
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {unitsMode === "load" ? (
              <QuickStockScreen
                onViewStock={() => { setUnitsMode("list"); setUnitsPreSelection(undefined); }}
                preSelection={unitsPreSelection}
              />
            ) : unitsMode === "sale" ? (
              <QuickSaleScreen
                preSelectedUnit={salePreUnit}
                onDone={() => { setUnitsMode("list"); setSalePreUnit(undefined); }}
              />
            ) : (
              <StockListScreen
                onQuickLoad={() => { setUnitsPreSelection(undefined); setUnitsModelFilter(undefined); setUnitsMode("load"); }}
                modelFilter={unitsModelFilter}
                onSellUnit={(unit) => { setSalePreUnit(unit); setUnitsMode("sale"); }}
              />
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Agregar producto" maxWidth={480}>
        <AddProductModal onSuccess={() => { setShowAddModal(false); loadProducts(); }} onCancel={() => setShowAddModal(false)} />
      </Modal>

      <Modal isOpen={!!editingProduct} onClose={() => setEditingProduct(null)} title="Editar producto" maxWidth={560}>
        {editingProduct && (
          <ItemFormModal
            item={editingProduct}
            onSuccess={() => { setEditingProduct(null); loadProducts(); }}
            onCancel={() => setEditingProduct(null)}
          />
        )}
      </Modal>
    </div>
  );
}
