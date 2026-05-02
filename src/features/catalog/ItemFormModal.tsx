import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { catalogDb } from "../../lib/db/catalog";
import { catalogFieldsDb } from "../../lib/db/catalog_fields";
import { productTemplatesDb } from "../../lib/db/productTemplates";
import { getTemplateImageUrl } from "../../lib/templates/productImageMap";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useDebounce } from "../../lib/hooks";
import Select from "../../components/ui/Select";
import ImageUpload from "../../components/ui/ImageUpload";
import type {
  CatalogItemWithImeis,
  CreateCatalogItemInput,
  CatalogFieldTemplate,
  ProductConditionDetails,
  ProductTemplate,
} from "../../lib/db/types";

interface Props {
  item: CatalogItemWithImeis | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const CURRENCY_OPTIONS = [
  { value: "ARS", label: "ARS" },
  { value: "USD", label: "USD" },
];

const STORAGE_OPTIONS = [
  { value: "", label: "Sin especificar" },
  { value: "64GB", label: "64GB" },
  { value: "128GB", label: "128GB" },
  { value: "256GB", label: "256GB" },
  { value: "512GB", label: "512GB" },
  { value: "1TB", label: "1TB" },
  { value: "Otro", label: "Otro" },
];

const GRADES = [
  { value: "A+", label: "A+", desc: "Como nuevo, mínimas marcas" },
  { value: "A", label: "A", desc: "Buen estado, marcas leves" },
  { value: "B", label: "B", desc: "Estado regular, marcas visibles" },
  { value: "C", label: "C", desc: "Funcional, daños estéticos" },
];

const COLOR_SWATCHES = [
  { label: "Negro", hex: "#1c1c1e" },
  { label: "Blanco", hex: "#f5f5f7" },
  { label: "Azul", hex: "#0a84ff" },
  { label: "Rojo", hex: "#e8001d" },
  { label: "Verde", hex: "#30d158" },
  { label: "Amarillo", hex: "#ffd60a" },
  { label: "Morado", hex: "#bf5af2" },
  { label: "Rosa", hex: "#ff375f" },
  { label: "Gris", hex: "#8e8e93" },
  { label: "Dorado", hex: "#c9a84c" },
];

type Condition = "new" | "used" | "refurbished";

function CustomField({
  template,
  value,
  onChange,
}: {
  template: CatalogFieldTemplate;
  value: string;
  onChange: (val: string) => void;
}) {
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

  if (template.field_type === "select") {
    let options: Array<{ value: string; label: string }> = [];
    try {
      const raw: string[] = JSON.parse(template.options_json ?? "[]");
      options = raw.map((o) => ({ value: o, label: o }));
    } catch {
      options = [];
    }
    return (
      <Select
        value={value}
        onChange={onChange}
        options={[{ value: "", label: "Sin seleccionar" }, ...options]}
      />
    );
  }

  if (template.field_type === "imei") {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="IMEI de 15 dígitos (separar con coma para varios)"
        pattern="[\d,\s]+"
        style={inputStyle}
      />
    );
  }

  if (template.field_type === "number") {
    return (
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    );
  }

  if (template.field_type === "date") {
    return (
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    );
  }

  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
  );
}

function BatteryBar({ percent }: { percent: number }) {
  const color = percent > 80 ? "var(--green)" : percent > 60 ? "var(--amber)" : "var(--brand)";
  return (
    <div style={{ height: 6, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden", marginTop: 4 }}>
      <div style={{ height: "100%", width: `${percent}%`, background: color, borderRadius: 3, transition: "width 0.2s" }} />
    </div>
  );
}

export default function ItemFormModal({ item, onSuccess, onCancel }: Props) {
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";
  const isEdit = item !== null;

  const stableId = useRef(item?.id ?? crypto.randomUUID());

  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [subcategory, setSubcategory] = useState(item?.subcategory ?? "");
  const [price, setPrice] = useState(
    item?.price !== null && item?.price !== undefined ? String(item.price) : "",
  );
  const [currency, setCurrency] = useState(item?.currency ?? "ARS");
  const [trackStock, setTrackStock] = useState(item?.track_stock === 1);
  const [initialStock, setInitialStock] = useState(0);
  const [imagePath, setImagePath] = useState<string | null>(item?.image_path ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Template search
  const [tplQuery, setTplQuery] = useState("");
  const [tplResults, setTplResults] = useState<ProductTemplate[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<ProductTemplate | null>(null);
  const [showTplResults, setShowTplResults] = useState(false);
  const tplRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const debouncedTpl = useDebounce(tplQuery, 280);

  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [showCatSuggestions, setShowCatSuggestions] = useState(false);
  const [showSubSuggestions, setShowSubSuggestions] = useState(false);

  const [fieldTemplates, setFieldTemplates] = useState<CatalogFieldTemplate[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  // Condition
  const initialDetails: ProductConditionDetails = item?.conditionDetails ?? {};
  const [condition, setCondition] = useState<Condition>(item?.condition ?? "new");
  const [condColor, setCondColor] = useState(initialDetails.color ?? "");
  const [condStorage, setCondStorage] = useState(initialDetails.storage ?? "");
  const [condBattery, setCondBattery] = useState<string>(
    initialDetails.battery_percent !== undefined ? String(initialDetails.battery_percent) : "",
  );
  const [condCycles, setCondCycles] = useState<string>(
    initialDetails.battery_cycles !== undefined ? String(initialDetails.battery_cycles) : "",
  );
  const [condGrade, setCondGrade] = useState(initialDetails.grade ?? "");
  const [condNotes, setCondNotes] = useState(initialDetails.notes ?? "");
  const [condDate, setCondDate] = useState(initialDetails.purchase_date ?? "");

  const catRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!wid) return;
    catalogDb.getCategories(wid).then(setCategories).catch(() => {});
  }, [wid]);

  useEffect(() => {
    if (!wid || !category) {
      setSubcategories([]);
      setFieldTemplates([]);
      return;
    }
    catalogDb.getSubcategories(wid, category).then(setSubcategories).catch(() => {});
    catalogFieldsDb.getTemplates(wid, category).then((templates) => {
      setFieldTemplates(templates);
      if (item?.custom_fields_json) {
        try {
          const stored: Record<string, string> = JSON.parse(item.custom_fields_json);
          setCustomFieldValues(stored);
        } catch {
          setCustomFieldValues({});
        }
      }
    }).catch(() => {});
  }, [wid, category, item]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setShowCatSuggestions(false);
      if (subRef.current && !subRef.current.contains(e.target as Node)) setShowSubSuggestions(false);
      if (tplRef.current && !tplRef.current.contains(e.target as Node)) setShowTplResults(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (debouncedTpl.trim().length < 2) { setTplResults([]); return; }
    productTemplatesDb.search(debouncedTpl).then(setTplResults).catch(() => {});
  }, [debouncedTpl]);

  const applyTemplate = (tpl: ProductTemplate) => {
    setSelectedTpl(tpl);
    setName(tpl.name);
    setCategory(tpl.category);
    setSubcategory(tpl.subcategory);
    setTplQuery("");
    setTplResults([]);
    setShowTplResults(false);
    setTimeout(() => priceRef.current?.focus(), 50);
  };

  const clearTemplate = () => {
    setSelectedTpl(null);
    setName("");
    setCategory("");
    setSubcategory("");
  };

  const filteredCats = categories.filter((c) =>
    c.toLowerCase().includes(category.toLowerCase()),
  );
  const filteredSubs = subcategories.filter((s) =>
    s.toLowerCase().includes(subcategory.toLowerCase()),
  );

  const handleSubmit = async () => {
    if (!name.trim()) { setError("El nombre es obligatorio"); return; }
    setError("");
    setIsSubmitting(true);
    try {
      const customJson = fieldTemplates.length > 0 ? JSON.stringify(customFieldValues) : null;

      let condDetailsJson: string | null = null;
      if (condition !== "new") {
        const details: ProductConditionDetails = {};
        if (condColor.trim()) details.color = condColor.trim();
        if (condStorage) details.storage = condStorage;
        if (condBattery !== "") details.battery_percent = parseInt(condBattery) || 0;
        if (condCycles !== "") details.battery_cycles = parseInt(condCycles) || 0;
        if (condGrade) details.grade = condGrade;
        if (condNotes.trim()) details.notes = condNotes.trim();
        if (condDate) details.purchase_date = condDate;
        condDetailsJson = JSON.stringify(details);
      }

      const data: CreateCatalogItemInput = {
        name: name.trim(),
        category: category.trim() || null,
        subcategory: subcategory.trim() || null,
        price: price ? parseFloat(price) : null,
        currency,
        track_stock: trackStock,
        stock: isEdit ? undefined : (trackStock ? initialStock : 0),
        custom_fields_json: customJson,
        image_path: imagePath,
        condition,
        condition_details_json: condDetailsJson,
      };

      if (isEdit) {
        await catalogDb.update(wid, item.id, data);
      } else {
        await catalogDb.create(wid, data, stableId.current);
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
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

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: 6,
    display: "block",
  };

  const condBtnStyle = (active: boolean, color: string): React.CSSProperties => ({
    flex: 1,
    padding: "7px 0",
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 600,
    border: active ? `2px solid ${color}` : "2px solid transparent",
    background: active ? `${color}22` : "var(--surface-3)",
    color: active ? color : "var(--text-secondary)",
    transition: "all 0.15s",
    cursor: "pointer",
  });

  const batteryNum = condBattery !== "" ? parseInt(condBattery) : null;

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Template search — only on create */}
        {!isEdit && (
          <div ref={tplRef} style={{ position: "relative" }}>
            {selectedTpl ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--blue-bg)", border: "1px solid var(--blue)", borderRadius: 8 }}>
                <span style={{ fontSize: 12, color: "var(--blue)" }}>📱</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--blue)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedTpl.name}</p>
                  <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
                    {[selectedTpl.year, selectedTpl.screen_size, selectedTpl.storage].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button onClick={clearTemplate} style={{ color: "var(--text-tertiary)", display: "flex" }}><X size={14} /></button>
              </div>
            ) : (
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <Search size={14} color="var(--text-tertiary)" style={{ position: "absolute", left: 10, pointerEvents: "none" }} />
                <input
                  value={tplQuery}
                  onChange={(e) => { setTplQuery(e.target.value); setShowTplResults(true); }}
                  onFocus={() => tplQuery.length >= 2 && setShowTplResults(true)}
                  placeholder="Buscar modelo Apple (ej: iPhone 16 Pro negro)..."
                  style={{ ...inputStyle, paddingLeft: 32, fontSize: 13 }}
                />
              </div>
            )}

            {showTplResults && tplResults.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20, background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 10, overflow: "hidden", boxShadow: "0 12px 32px rgba(0,0,0,0.4)", maxHeight: 260, overflowY: "auto" }}>
                {tplResults.map((tpl) => {
                  const imgUrl = getTemplateImageUrl(tpl.image_path);
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onMouseDown={() => applyTemplate(tpl)}
                      style={{ width: "100%", textAlign: "left", padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ width: 40, height: 40, borderRadius: 6, overflow: "hidden", background: "var(--surface-3)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {imgUrl ? (
                          <img src={imgUrl} alt="" width={40} height={40} style={{ objectFit: "contain" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                        ) : (
                          <span style={{ fontSize: 20 }}>📱</span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tpl.name}</p>
                        <div style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
                          {tpl.year && <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "var(--surface-3)", color: "var(--text-tertiary)" }}>{tpl.year}</span>}
                          {tpl.storage && <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "var(--surface-3)", color: "var(--text-tertiary)" }}>{tpl.storage}</span>}
                          {tpl.screen_size && <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "var(--surface-3)", color: "var(--text-tertiary)" }}>{tpl.screen_size}</span>}
                          <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "var(--blue-bg)", color: "var(--blue)" }}>{tpl.category}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {showTplResults && tplQuery.length >= 2 && tplResults.length === 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20, background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "10px 14px" }}>
                <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No encontrado — completá los campos manualmente</p>
              </div>
            )}
          </div>
        )}

        {/* Image */}
        <div style={{ display: "flex", justifyContent: "center", paddingBottom: 4 }}>
          <ImageUpload
            category="products"
            entityId={stableId.current}
            currentPath={imagePath}
            onImageSelected={setImagePath}
            onImageRemoved={() => setImagePath(null)}
            size="lg"
            shape="square"
          />
        </div>

        {/* Name */}
        <div>
          <label style={labelStyle}>Nombre *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: iPhone 15 Pro"
            style={inputStyle}
            autoFocus
          />
        </div>

        {/* Category */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div ref={catRef} style={{ position: "relative" }}>
            <label style={labelStyle}>Categoría</label>
            <input
              value={category}
              onChange={(e) => { setCategory(e.target.value); setShowCatSuggestions(true); }}
              onFocus={() => setShowCatSuggestions(true)}
              placeholder="Ej: Celulares"
              style={inputStyle}
            />
            {showCatSuggestions && filteredCats.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                background: "var(--surface)", border: "1px solid var(--border-strong)",
                borderRadius: 8, overflow: "hidden", marginTop: 4,
                boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              }}>
                {filteredCats.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onMouseDown={() => { setCategory(c); setShowCatSuggestions(false); }}
                    style={{ width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 13, color: "var(--text-primary)", borderBottom: "1px solid var(--border)" }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div ref={subRef} style={{ position: "relative" }}>
            <label style={labelStyle}>Subcategoría</label>
            <input
              value={subcategory}
              onChange={(e) => { setSubcategory(e.target.value); setShowSubSuggestions(true); }}
              onFocus={() => setShowSubSuggestions(true)}
              placeholder="Ej: 128GB"
              style={inputStyle}
            />
            {showSubSuggestions && filteredSubs.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                background: "var(--surface)", border: "1px solid var(--border-strong)",
                borderRadius: 8, overflow: "hidden", marginTop: 4,
                boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              }}>
                {filteredSubs.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={() => { setSubcategory(s); setShowSubSuggestions(false); }}
                    style={{ width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 13, color: "var(--text-primary)", borderBottom: "1px solid var(--border)" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Price + Currency */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
          <div>
            <label style={labelStyle}>Precio</label>
            <input
              ref={priceRef}
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Moneda</label>
            <Select value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} />
          </div>
        </div>

        {/* Condition section */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Condición
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setCondition("new")} style={condBtnStyle(condition === "new", "var(--green)")}>Nuevo</button>
            <button type="button" onClick={() => setCondition("used")} style={condBtnStyle(condition === "used", "var(--amber)")}>Usado</button>
            <button type="button" onClick={() => setCondition("refurbished")} style={condBtnStyle(condition === "refurbished", "var(--blue)")}>Reacondicionado</button>
          </div>

          {condition !== "new" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
              {/* Color */}
              <div>
                <label style={labelStyle}>Color</label>
                <input
                  type="text"
                  value={condColor}
                  onChange={(e) => setCondColor(e.target.value)}
                  placeholder="Ej: Negro espacial"
                  style={inputStyle}
                />
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {COLOR_SWATCHES.map((sw) => (
                    <button
                      key={sw.label}
                      type="button"
                      title={sw.label}
                      onClick={() => setCondColor(sw.label)}
                      style={{
                        width: 22, height: 22, borderRadius: 5,
                        background: sw.hex,
                        border: condColor === sw.label ? "2px solid var(--text-primary)" : "2px solid transparent",
                        outline: condColor === sw.label ? "2px solid var(--text-tertiary)" : "none",
                        cursor: "pointer",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Storage */}
              <div>
                <label style={labelStyle}>Capacidad / Storage</label>
                <Select value={condStorage} onChange={setCondStorage} options={STORAGE_OPTIONS} />
              </div>

              {/* Battery + Cycles */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Batería %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={condBattery}
                    onChange={(e) => setCondBattery(e.target.value)}
                    placeholder="0–100"
                    style={inputStyle}
                  />
                  {batteryNum !== null && batteryNum >= 0 && batteryNum <= 100 && (
                    <BatteryBar percent={batteryNum} />
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Ciclos de carga</label>
                  <input
                    type="number"
                    min={0}
                    value={condCycles}
                    onChange={(e) => setCondCycles(e.target.value)}
                    placeholder="Ej: 120"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Grade */}
              <div>
                <label style={labelStyle}>Grado de condición</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {GRADES.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => setCondGrade(g.value)}
                      title={g.desc}
                      style={{
                        flex: 1,
                        padding: "8px 0",
                        borderRadius: 7,
                        fontSize: 13,
                        fontWeight: 700,
                        border: condGrade === g.value ? "2px solid var(--text-primary)" : "2px solid transparent",
                        background: condGrade === g.value ? "var(--surface-3)" : "var(--surface-2)",
                        color: condGrade === g.value ? "var(--text-primary)" : "var(--text-tertiary)",
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                {condGrade && (
                  <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
                    {GRADES.find((g) => g.value === condGrade)?.desc}
                  </p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label style={labelStyle}>Observaciones</label>
                <textarea
                  value={condNotes}
                  onChange={(e) => setCondNotes(e.target.value)}
                  placeholder="Ej: Rayón en la pantalla, cargador incluido..."
                  rows={2}
                  style={{ ...inputStyle, resize: "none" }}
                />
              </div>

              {/* Purchase date */}
              <div>
                <label style={labelStyle}>Fecha de adquisición</label>
                <input
                  type="date"
                  value={condDate}
                  onChange={(e) => setCondDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          )}
        </div>

        {/* Track stock toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>Controla stock</p>
            <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
              Lleva un conteo de unidades disponibles
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTrackStock((v) => !v)}
            style={{
              width: 42, height: 24, borderRadius: 12,
              background: trackStock ? "var(--brand)" : "var(--surface-3)",
              position: "relative", transition: "background 0.2s", flexShrink: 0,
            }}
          >
            <span style={{
              position: "absolute", top: 3, left: trackStock ? 21 : 3,
              width: 18, height: 18, borderRadius: "50%",
              background: "#fff", transition: "left 0.2s",
            }} />
          </button>
        </div>

        {/* Initial stock */}
        {!isEdit && trackStock && (
          <div>
            <label style={labelStyle}>Stock inicial</label>
            <input
              type="number"
              min={0}
              value={initialStock}
              onChange={(e) => setInitialStock(Math.max(0, parseInt(e.target.value) || 0))}
              style={inputStyle}
            />
          </div>
        )}

        {/* Dynamic custom fields */}
        {fieldTemplates.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Campos de {category}
            </p>
            {fieldTemplates.map((template) => (
              <div key={template.id}>
                <label style={labelStyle}>
                  {template.field_label}
                  {template.required === 1 && (
                    <span style={{ color: "var(--brand)", marginLeft: 2 }}>*</span>
                  )}
                </label>
                <CustomField
                  template={template}
                  value={customFieldValues[template.field_key] ?? ""}
                  onChange={(val) =>
                    setCustomFieldValues((prev) => ({ ...prev, [template.field_key]: val }))
                  }
                />
              </div>
            ))}
          </div>
        )}

        {error && (
          <p style={{ fontSize: 12, color: "var(--brand)", padding: "8px 12px", background: "rgba(232,0,29,0.1)", borderRadius: 6 }}>
            {error}
          </p>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: "8px 16px", background: "var(--surface-2)", borderRadius: 8, fontSize: 13, color: "var(--text-secondary)" }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !name.trim()}
          style={{
            padding: "8px 18px", background: "var(--brand)", borderRadius: 8,
            fontSize: 13, fontWeight: 600, color: "#fff",
            opacity: isSubmitting || !name.trim() ? 0.5 : 1,
          }}
        >
          {isSubmitting ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear producto"}
        </button>
      </div>
    </div>
  );
}
