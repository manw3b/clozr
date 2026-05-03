import { useState, useEffect, useRef } from "react";
import { Search, X, ArrowLeft, CheckCircle } from "lucide-react";
import { catalogDb } from "../../lib/db/catalog";
import { productTemplatesDb } from "../../lib/db/productTemplates";
import { getTemplateImageUrl } from "../../lib/templates/productImageMap";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useDebounce } from "../../lib/hooks";
import Select from "../../components/ui/Select";
import type { ProductTemplate, CreateCatalogItemInput } from "../../lib/db/types";

type Mode = "catalog-search" | "catalog-price" | "manual";
type Condition = "new" | "used" | "refurbished";

const CURRENCY_OPTIONS = [
  { value: "ARS", label: "ARS" },
  { value: "USD", label: "USD" },
];

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AddProductModal({ onSuccess, onCancel }: Props) {
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";

  const [mode, setMode] = useState<Mode>("catalog-search");
  const [selectedTpl, setSelectedTpl] = useState<ProductTemplate | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductTemplate[]>([]);
  const [showResults, setShowResults] = useState(false);
  const debouncedQuery = useDebounce(query, 200);
  const searchRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("ARS");
  const [trackStock, setTrackStock] = useState(true);
  const [condition, setCondition] = useState<Condition>("new");

  const [manualName, setManualName] = useState("");
  const [manualCategory, setManualCategory] = useState("");
  const [manualEmoji, setManualEmoji] = useState("📦");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) { setResults([]); return; }
    productTemplatesDb.search(debouncedQuery).then(setResults).catch(() => {});
  }, [debouncedQuery]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const applyTemplate = (tpl: ProductTemplate) => {
    setSelectedTpl(tpl);
    const isApplePhone = tpl.category === "iPhone" || tpl.category === "iPad";
    setTrackStock(isApplePhone);
    setMode("catalog-price");
    setTimeout(() => priceRef.current?.focus(), 80);
  };

  const handleSubmit = async () => {
    setError("");
    if (mode === "manual" && !manualName.trim()) { setError("El nombre es obligatorio"); return; }
    setSubmitting(true);
    try {
      let data: CreateCatalogItemInput;
      if (mode !== "manual" && selectedTpl) {
        data = {
          name: selectedTpl.name,
          category: selectedTpl.category,
          subcategory: selectedTpl.subcategory,
          price: price ? parseFloat(price) : null,
          currency,
          track_stock: trackStock,
          image_path: selectedTpl.image_path,
          condition,
        };
      } else {
        data = {
          name: manualName.trim(),
          category: manualCategory.trim() || null,
          subcategory: null,
          price: price ? parseFloat(price) : null,
          currency,
          track_stock: trackStock,
          image_path: null,
          condition,
        };
      }
      await catalogDb.create(wid, data);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    background: "var(--surface-2)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    color: "var(--text)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    marginBottom: 6,
    display: "block",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };

  const condBtn = (val: Condition, color: string, label: string) => (
    <button
      type="button"
      onClick={() => setCondition(val)}
      style={{
        flex: 1,
        padding: "8px 0",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        border: condition === val ? `2px solid ${color}` : "2px solid transparent",
        background: condition === val ? `${color}22` : "var(--surface-2)",
        color: condition === val ? color : "var(--text-muted)",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );

  // ─── Step: catalog search ────────────────────────────────────────

  if (mode === "catalog-search") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div ref={searchRef} style={{ position: "relative" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Search size={16} color="var(--text-muted)" style={{ position: "absolute", left: 12, pointerEvents: "none" }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
              onFocus={() => query.length >= 2 && setShowResults(true)}
              placeholder="Buscar modelo... (ej: iPhone 16 Pro, AirPods Pro)"
              style={{ ...inputStyle, paddingLeft: 40, fontSize: 15, padding: "12px 12px 12px 40px" }}
            />
          </div>
          {showResults && results.length > 0 && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
              background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 10,
              overflow: "hidden", boxShadow: "0 16px 40px rgba(0,0,0,0.45)", maxHeight: 320, overflowY: "auto",
            }}>
              {results.map((tpl) => {
                const imgUrl = getTemplateImageUrl(tpl.image_path);
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onMouseDown={() => applyTemplate(tpl)}
                    style={{ width: "100%", textAlign: "left", padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ width: 48, height: 48, borderRadius: 8, background: "var(--surface-2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {imgUrl
                        ? <img src={imgUrl} alt="" width={48} height={48} style={{ objectFit: "contain" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                        : <span style={{ fontSize: 24 }}>📱</span>
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tpl.name}</p>
                      <div style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
                        {tpl.storage && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "var(--surface-2)", color: "var(--text-muted)" }}>{tpl.storage}</span>}
                        {tpl.color && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "var(--surface-2)", color: "var(--text-muted)" }}>{tpl.color}</span>}
                        {tpl.year && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "var(--surface-2)", color: "var(--text-muted)" }}>{tpl.year}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {showResults && query.length >= 2 && results.length === 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20, background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "12px 14px" }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Sin resultados</p>
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", paddingTop: 8 }}>
          <button
            type="button"
            onClick={() => setMode("manual")}
            style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "underline", cursor: "pointer", background: "none" }}
          >
            No encuentro lo que busco → Crear manualmente
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 4, borderTop: "1px solid var(--border)" }}>
          <button type="button" onClick={onCancel} style={{ padding: "9px 16px", background: "var(--surface-2)", borderRadius: 8, fontSize: 13, color: "var(--text-muted)" }}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ─── Step: catalog price ─────────────────────────────────────────

  if (mode === "catalog-price" && selectedTpl) {
    const imgUrl = getTemplateImageUrl(selectedTpl.image_path);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Product card */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px", background: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)" }}>
          <div style={{ width: 72, height: 72, borderRadius: 10, background: "var(--surface)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {imgUrl
              ? <img src={imgUrl} alt="" width={72} height={72} style={{ objectFit: "contain" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
              : <span style={{ fontSize: 36 }}>📱</span>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selectedTpl.name}
            </p>
            {(selectedTpl.color || selectedTpl.storage) && (
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                {[selectedTpl.color, selectedTpl.storage].filter(Boolean).join(" · ")}
              </p>
            )}
            <p style={{ fontSize: 11, color: "var(--primary)", marginTop: 4 }}>
              ✓ Imagen asignada automáticamente
            </p>
          </div>
          <button
            onClick={() => { setSelectedTpl(null); setMode("catalog-search"); }}
            style={{ color: "var(--text-muted)", cursor: "pointer", background: "none", display: "flex" }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Price */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
          <div>
            <label style={labelStyle}>Precio</label>
            <input
              ref={priceRef}
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="0"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Moneda</label>
            <Select value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} />
          </div>
        </div>

        {/* Condition */}
        <div>
          <label style={labelStyle}>Condición</label>
          <div style={{ display: "flex", gap: 8 }}>
            {condBtn("new", "var(--success)", "Nuevo")}
            {condBtn("used", "var(--warning)", "Usado")}
            {condBtn("refurbished", "var(--info)", "Reacond.")}
          </div>
        </div>

        {/* Track stock */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--surface-2)", borderRadius: 8 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Controla unidades por IMEI</p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Registra cada unidad individualmente</p>
          </div>
          <button
            type="button"
            onClick={() => setTrackStock((v) => !v)}
            style={{ width: 42, height: 24, borderRadius: 12, background: trackStock ? "var(--primary)" : "var(--surface-2)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
          >
            <span style={{ position: "absolute", top: 3, left: trackStock ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
          </button>
        </div>

        {error && <p style={{ fontSize: 12, color: "var(--primary)", padding: "8px 12px", background: "rgba(232,0,29,0.1)", borderRadius: 6 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, paddingTop: 4, borderTop: "1px solid var(--border)" }}>
          <button
            type="button"
            onClick={() => setMode("catalog-search")}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "9px 14px", background: "var(--surface-2)", borderRadius: 8, fontSize: 13, color: "var(--text-muted)" }}
          >
            <ArrowLeft size={13} /> Volver
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 18px", background: "var(--primary)", borderRadius: 8, fontSize: 13, fontWeight: 700, color: "#fff", opacity: submitting ? 0.5 : 1 }}
          >
            {submitting ? "Guardando..." : <><CheckCircle size={14} /> Agregar al inventario</>}
          </button>
        </div>
      </div>
    );
  }

  // ─── Step: manual form ───────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <label style={labelStyle}>Nombre *</label>
        <input
          autoFocus
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          placeholder="Ej: iPhone 15 Pro, Cable USB-C..."
          style={inputStyle}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 12 }}>
        <div>
          <label style={labelStyle}>Categoría</label>
          <input
            value={manualCategory}
            onChange={(e) => setManualCategory(e.target.value)}
            placeholder="Ej: Celulares, Accesorios..."
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Emoji</label>
          <input
            value={manualEmoji}
            onChange={(e) => setManualEmoji(e.target.value)}
            maxLength={2}
            style={{ ...inputStyle, textAlign: "center", fontSize: 22, padding: "6px 8px" }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
        <div>
          <label style={labelStyle}>Precio</label>
          <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Moneda</label>
          <Select value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Condición</label>
        <div style={{ display: "flex", gap: 8 }}>
          {condBtn("new", "var(--success)", "Nuevo")}
          {condBtn("used", "var(--warning)", "Usado")}
          {condBtn("refurbished", "var(--info)", "Reacond.")}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--surface-2)", borderRadius: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Controla stock</p>
        <button
          type="button"
          onClick={() => setTrackStock((v) => !v)}
          style={{ width: 42, height: 24, borderRadius: 12, background: trackStock ? "var(--primary)" : "var(--surface-2)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
        >
          <span style={{ position: "absolute", top: 3, left: trackStock ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
        </button>
      </div>

      {error && <p style={{ fontSize: 12, color: "var(--primary)", padding: "8px 12px", background: "rgba(232,0,29,0.1)", borderRadius: 6 }}>{error}</p>}

      <div style={{ display: "flex", gap: 10, paddingTop: 4, borderTop: "1px solid var(--border)" }}>
        <button
          type="button"
          onClick={() => setMode("catalog-search")}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "9px 14px", background: "var(--surface-2)", borderRadius: 8, fontSize: 13, color: "var(--text-muted)" }}
        >
          <ArrowLeft size={13} /> Volver
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !manualName.trim()}
          style={{ flex: 1, padding: "9px 18px", background: "var(--primary)", borderRadius: 8, fontSize: 13, fontWeight: 700, color: "#fff", opacity: submitting || !manualName.trim() ? 0.5 : 1 }}
        >
          {submitting ? "Guardando..." : "Crear producto"}
        </button>
      </div>
    </div>
  );
}
