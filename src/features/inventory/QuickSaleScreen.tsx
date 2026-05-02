import { useState, useEffect, useRef } from "react";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useUIStore } from "../../store/uiStore";
import { useBusinessStore } from "../../store/businessStore";
import { useAuthStore } from "../../store/authStore";
import { getTemplateImageUrl, allProductImages } from "../../lib/templates/productImageMap";
import { customersDb } from "../../lib/db/customers";
import { catalogDb } from "../../lib/db/catalog";
import { salesDb } from "../../lib/db/sales";
import {
  getCategories, getFamilies, getModels, getColorsForModel, getStorageForColor,
  resolveVariant, getAvailableIMEIsForVariant, markStockItemSoldWithSale,
  type ProductCategory, type ProductFamily, type ProductModel, type ProductVariant,
  type ColorOption, type AvailableUnit, type PreSelectedUnit, type ModelWithContext,
} from "../../lib/db/quickStock";
import { useDebounce } from "../../lib/hooks";
import Select from "../../components/ui/Select";
import type { Customer } from "../../lib/db/types";

type SaleStep = "category" | "family" | "model" | "variant" | "imei-select" | "sale-data" | "done";

const PAYMENT_METHODS = [
  { value: "efectivo_usd", label: "Efectivo USD" },
  { value: "efectivo_ars", label: "Efectivo ARS" },
  { value: "transferencia", label: "Transferencia" },
  { value: "usdt", label: "USDT" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "otro", label: "Otro" },
];

export interface QuickSaleScreenProps {
  onDone?: () => void;
  preSelectedUnit?: PreSelectedUnit;
  preSelection?: ModelWithContext;
}

function ProductImg({ path, size, alt }: { path: string | null | undefined; size: number; alt: string }) {
  const url = path ? (getTemplateImageUrl(path) ?? allProductImages[path] ?? null) : null;
  const [err, setErr] = useState(false);
  if (url && !err) {
    return <img src={url} alt={alt} onError={() => setErr(true)} style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: 8, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, flexShrink: 0 }}>
      📱
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────

export default function QuickSaleScreen({ onDone, preSelectedUnit, preSelection }: QuickSaleScreenProps) {
  const { activeWorkspace } = useWorkspaceStore();
  const { showToast, setActiveScreen } = useUIStore();
  const { activeBusiness } = useBusinessStore();
  const { userId, userName } = useAuthStore();

  const [step, setStep] = useState<SaleStep>("category");

  // Navigation state
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | null>(null);
  const [selectedFamily, setSelectedFamily] = useState<ProductFamily | null>(null);
  const [selectedModel, setSelectedModel] = useState<ProductModel | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedColorHex, setSelectedColorHex] = useState<string | null>(null);
  const [selectedStorage, setSelectedStorage] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [families, setFamilies] = useState<ProductFamily[]>([]);
  const [models, setModels] = useState<ProductModel[]>([]);
  const [colors, setColors] = useState<ColorOption[]>([]);
  const [storages, setStorages] = useState<string[]>([]);
  const [hoveredColor, setHoveredColor] = useState<string | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  // imei-select state
  const [availableUnits, setAvailableUnits] = useState<AvailableUnit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<AvailableUnit | null>(null);
  const [freeSell, setFreeSell] = useState(false);

  // sale-data state
  const [price, setPrice] = useState("");
  const [priceCurrency, setPriceCurrency] = useState("USD");
  const [paymentMethod, setPaymentMethod] = useState("efectivo_usd");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [isDeposit, setIsDeposit] = useState(false);
  const [catalogItemId, setCatalogItemId] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saleDone, setSaleDone] = useState<{ saleId: string; customerName: string | null } | null>(null);

  // Pre-selected unit from "Vender" button in table
  const [directUnit, setDirectUnit] = useState<PreSelectedUnit | null>(null);

  const customerRef = useRef<HTMLDivElement>(null);
  const debouncedCustomer = useDebounce(customerQuery, 200);

  // Handle preSelectedUnit → skip to sale-data
  useEffect(() => {
    if (!preSelectedUnit) return;
    setDirectUnit(preSelectedUnit);
    setStep("sale-data");
  }, [preSelectedUnit?.stockItemId]);

  // Handle preSelection (model pre-select for load flow reuse)
  useEffect(() => {
    if (!preSelection) return;
    setSelectedCategory(preSelection.category);
    setSelectedFamily(preSelection.family);
    setSelectedModel(preSelection.model);
    setCategories([preSelection.category]);
    setFamilies([preSelection.family]);
    setModels([preSelection.model]);
    setStep("variant");
  }, [preSelection?.model?.id]);

  // Load categories
  useEffect(() => {
    if (preSelection || preSelectedUnit) return;
    getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedCategory) return;
    getFamilies(selectedCategory.id).then(setFamilies).catch(() => {});
  }, [selectedCategory?.id]);

  useEffect(() => {
    if (!selectedFamily) return;
    getModels(selectedFamily.id).then(setModels).catch(() => {});
  }, [selectedFamily?.id]);

  useEffect(() => {
    if (!selectedModel) return;
    setSelectedColor(null); setSelectedColorHex(null); setSelectedStorage(null); setStorages([]); setCurrentImageUrl(null);
    getColorsForModel(selectedModel.id).then(setColors).catch(() => {});
  }, [selectedModel?.id]);

  useEffect(() => {
    if (!selectedColor || !selectedModel) return;
    setSelectedStorage(null);
    getStorageForColor(selectedModel.id, selectedColor).then((rawStorages) => {
      const real = (rawStorages as (string | null)[]).filter((s): s is string => s !== null && s !== "");
      setStorages(real);
      if (real.length === 0) setSelectedStorage("__none__");
      else if (real.length === 1) setSelectedStorage(real[0]);
    }).catch(() => {});
  }, [selectedColor, selectedModel?.id]);

  // Load available units when entering imei-select
  useEffect(() => {
    if (step !== "imei-select" || !selectedVariant || !activeWorkspace?.id) return;
    setSelectedUnit(null);
    setFreeSell(false);
    getAvailableIMEIsForVariant(activeWorkspace.id, selectedVariant.id).then(setAvailableUnits).catch(() => {});
  }, [step, selectedVariant?.id]);

  // Lookup catalog item + price when entering sale-data
  useEffect(() => {
    if (step !== "sale-data" || !activeWorkspace?.id) return;
    const modelName = directUnit?.modelName ?? selectedModel?.name;
    const color = directUnit?.color ?? selectedColor;
    if (!modelName) return;
    const q = color ? `${modelName} ${color}` : modelName;
    catalogDb.search(activeWorkspace.id, q).then((items) => {
      if (items[0]) {
        setCatalogItemId(items[0].id);
        if (items[0].price && !price) setPrice(String(items[0].price));
      }
    }).catch(() => {});
  }, [step]);

  // Sync payment amount with price
  useEffect(() => {
    if (price && !paymentAmount) setPaymentAmount(price);
  }, [price]);

  // Customer search
  useEffect(() => {
    const q = debouncedCustomer.trim();
    if (!q || !activeWorkspace?.id) { setCustomerResults([]); return; }
    customersDb.search(activeWorkspace.id, { query: q }).then(setCustomerResults).catch(() => {});
  }, [debouncedCustomer]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) setShowCustomerDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleContinue = async () => {
    if (!selectedColor || !selectedModel || selectedStorage === null) return;
    setResolving(true);
    try {
      const storageParam = selectedStorage === "__none__" ? null : selectedStorage;
      const v = await resolveVariant(selectedModel.id, selectedColor, storageParam);
      if (v) { setSelectedVariant(v); setStep("imei-select"); }
    } catch { showToast("Error al resolver variante"); }
    finally { setResolving(false); }
  };

  const handleConfirmSale = async () => {
    if (!activeWorkspace?.id || !price || parseFloat(price) <= 0) {
      showToast("Ingresá un precio válido"); return;
    }
    setSubmitting(true);
    try {
      const unit = directUnit ?? (selectedUnit ? { imei: selectedUnit.imei, stockItemId: selectedUnit.id } : null);
      const imeiToUse = unit?.imei;
      const modelName = directUnit?.modelName ?? selectedModel?.name ?? "";
      const color = directUnit?.color ?? selectedColor ?? "";
      const storage = directUnit?.storage ?? (selectedStorage === "__none__" ? null : selectedStorage);
      const desc = [modelName, color, storage].filter(Boolean).join(" ");
      const customerName = selectedCustomer?.name ?? (customerQuery.trim() || null);
      const customerId = selectedCustomer?.id ?? null;

      const sale = await salesDb.createSale(activeWorkspace.id, {
        business_id: activeBusiness?.id ?? undefined,
        customer_id: customerId ?? undefined,
        customer_name: customerName ?? undefined,
        seller_id: userId ?? undefined,
        seller_name: userName ?? undefined,
        items: [{
          catalog_item_id: catalogItemId ?? undefined,
          description: desc,
          quantity: 1,
          unit_price: parseFloat(price),
          imei: imeiToUse,
          from_stock: !!unit,
        }],
        payments: [{
          method: paymentMethod,
          currency: priceCurrency,
          amount: parseFloat(paymentAmount || price),
          is_deposit: isDeposit,
        }],
      });

      // Mark stock item as sold
      if (unit?.imei) {
        await markStockItemSoldWithSale(unit.imei, activeWorkspace.id, sale.id, customerName).catch(() => {});
      }

      setSaleDone({ saleId: sale.id, customerName });
      setStep("done");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al registrar venta");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Breadcrumb ───────────────────────────────────────────────

  const crumbs: { label: string; onClick: () => void }[] = [];
  if (selectedCategory) crumbs.push({ label: selectedCategory.name, onClick: () => { setStep("family"); setSelectedFamily(null); setSelectedModel(null); setSelectedColor(null); setSelectedStorage(null); setSelectedVariant(null); } });
  if (selectedFamily) crumbs.push({ label: selectedFamily.name, onClick: () => { setStep("model"); setSelectedModel(null); setSelectedColor(null); setSelectedStorage(null); setSelectedVariant(null); } });
  if (selectedModel) crumbs.push({ label: selectedModel.name, onClick: () => { setStep("variant"); setSelectedColor(null); setSelectedStorage(null); setSelectedVariant(null); } });

  const stepTitle: Record<SaleStep, string> = {
    category: "Seleccionar categoría",
    family: "Seleccionar familia",
    model: "Seleccionar modelo",
    variant: "Seleccionar variante",
    "imei-select": "Seleccionar unidad",
    "sale-data": "Datos de venta",
    done: "Venta registrada",
  };

  const goBack = () => {
    if (step === "family") setStep("category");
    else if (step === "model") setStep("family");
    else if (step === "variant") setStep("model");
    else if (step === "imei-select") { setStep("variant"); setSelectedVariant(null); }
    else if (step === "sale-data" && !directUnit) setStep("imei-select");
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", background: "var(--surface-2)",
    border: "1px solid var(--border-strong)", borderRadius: 8,
    color: "var(--text-primary)", fontSize: 14, outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6,
    display: "block", textTransform: "uppercase", letterSpacing: "0.04em",
  };

  // ─── Steps ────────────────────────────────────────────────────

  const renderStep = () => {
    // Category
    if (step === "category") return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {categories.map((cat) => (
          <button key={cat.id} onClick={() => { setSelectedCategory(cat); setStep("family"); }}
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: cat.id === "cat-iphone" ? "24px 16px" : "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--brand)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
          >
            <span style={{ fontSize: cat.id === "cat-iphone" ? 48 : 36 }}>{cat.emoji}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{cat.name}</span>
          </button>
        ))}
      </div>
    );

    // Family
    if (step === "family") return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {families.map((fam) => (
          <button key={fam.id} onClick={() => { setSelectedFamily(fam); setStep("model"); }}
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", textAlign: "left" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--brand)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{fam.name}</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>›</span>
          </button>
        ))}
      </div>
    );

    // Model
    if (step === "model") return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {models.map((model) => (
          <button key={model.id} onClick={() => { setSelectedModel(model); setStep("variant"); }}
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--brand)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
          >
            <ProductImg path={model.image_path} size={120} alt={model.name} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", textAlign: "center" }}>{model.name}</span>
          </button>
        ))}
      </div>
    );

    // Variant
    if (step === "variant") {
      const displayUrl = currentImageUrl ?? (selectedModel ? (getTemplateImageUrl(selectedModel.image_path) ?? null) : null);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            {displayUrl ? (
              <img key={displayUrl} src={displayUrl} alt={selectedModel?.name ?? ""} onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }} style={{ width: 200, height: 200, objectFit: "contain", transition: "opacity 0.2s" }} />
            ) : <div style={{ width: 200, height: 200, borderRadius: 12, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 80 }}>📱</div>}
            <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", textAlign: "center" }}>{selectedModel?.name}</p>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Color</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {colors.map((c) => {
                const sel = selectedColor === c.color;
                const hov = hoveredColor === c.color;
                return (
                  <div key={c.color} style={{ position: "relative" }}>
                    <button onClick={() => { setSelectedColor(c.color); setSelectedColorHex(c.color_hex); setSelectedStorage(null); if (selectedModel) { const url = (getTemplateImageUrl(selectedModel.image_path) ?? null); setCurrentImageUrl(url); } }}
                      onMouseEnter={() => setHoveredColor(c.color)} onMouseLeave={() => setHoveredColor(null)} title={c.color}
                      style={{ width: 28, height: 28, borderRadius: "50%", background: c.color_hex ?? "#888", border: sel ? "2px solid var(--brand)" : "2px solid var(--border)", transform: sel ? "scale(1.25)" : hov ? "scale(1.1)" : "scale(1)", transition: "transform 0.15s, border-color 0.15s", cursor: "pointer", boxShadow: sel ? "0 0 0 2px var(--bg), 0 0 0 4px var(--brand)" : "none" }}
                    />
                    {hov && <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", background: "var(--text-primary)", color: "var(--bg)", fontSize: 11, fontWeight: 500, padding: "4px 8px", borderRadius: 5, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 10 }}>{c.color}</div>}
                  </div>
                );
              })}
            </div>
            {selectedColor && <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)" }}>{selectedColor}</p>}
          </div>
          {selectedColor && storages.length > 0 && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Capacidad</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {storages.map((s) => {
                  const sel = selectedStorage === s;
                  return <button key={s} onClick={() => setSelectedStorage(s)} style={{ padding: "7px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, background: sel ? "var(--brand)" : "var(--surface-2)", color: sel ? "#fff" : "var(--text-primary)", border: sel ? "1.5px solid var(--brand)" : "1.5px solid var(--border)", cursor: "pointer" }}>{s}</button>;
                })}
              </div>
            </div>
          )}
          {selectedColor && selectedStorage !== null && (
            <button onClick={handleContinue} disabled={resolving}
              style={{ width: "100%", padding: "13px", background: "var(--green, #22c55e)", color: "#fff", borderRadius: 10, fontSize: 14, fontWeight: 700, opacity: resolving ? 0.5 : 1, cursor: resolving ? "default" : "pointer", marginTop: 4 }}
            >
              {resolving ? "Buscando unidades..." : "Ver unidades disponibles →"}
            </button>
          )}
        </div>
      );
    }

    // IMEI select
    if (step === "imei-select") return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px", display: "flex", alignItems: "center", gap: 12 }}>
          <ProductImg path={selectedModel?.image_path} size={60} alt={selectedModel?.name ?? ""} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{selectedModel?.name}</p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{selectedColor}{selectedStorage && selectedStorage !== "__none__" ? ` · ${selectedStorage}` : ""}</p>
          </div>
        </div>

        {availableUnits.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {availableUnits.length} unidad{availableUnits.length !== 1 ? "es" : ""} disponible{availableUnits.length !== 1 ? "s" : ""}
            </p>
            {availableUnits.map((unit) => {
              const sel = selectedUnit?.id === unit.id;
              return (
                <button key={unit.id} onClick={() => { setSelectedUnit(unit); setFreeSell(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: sel ? "rgba(34,197,94,0.1)" : "var(--surface)", border: sel ? "2px solid var(--green, #22c55e)" : "1px solid var(--border)", borderRadius: 10, cursor: "pointer", textAlign: "left", transition: "border-color 0.15s" }}
                >
                  <div style={{ width: 16, height: 16, borderRadius: "50%", border: sel ? "5px solid var(--green, #22c55e)" : "2px solid var(--border)", background: sel ? "var(--green, #22c55e)" : "transparent", flexShrink: 0, transition: "all 0.15s" }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "0.05em" }}>{unit.imei}</p>
                    <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Cargado {unit.created_at?.slice(0, 10)}</p>
                  </div>
                  {sel && <CheckCircle size={16} color="var(--green, #22c55e)" />}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: "20px", background: "var(--surface-2)", borderRadius: 10, textAlign: "center" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Sin unidades disponibles</p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>No tenés este modelo en stock</p>
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <button onClick={() => { setFreeSell(true); setSelectedUnit(null); }}
            style={{ width: "100%", padding: "10px", background: freeSell ? "var(--surface-2)" : "none", border: freeSell ? "2px solid var(--brand)" : "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: freeSell ? "var(--brand)" : "var(--text-secondary)", cursor: "pointer", fontWeight: freeSell ? 600 : 400 }}
          >
            {freeSell ? "✓ " : ""}Vender sin stock registrado
          </button>
        </div>

        {(selectedUnit || freeSell) && (
          <button onClick={() => setStep("sale-data")}
            style={{ width: "100%", padding: "13px", background: "var(--green, #22c55e)", color: "#fff", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            Continuar →
          </button>
        )}
      </div>
    );

    // Sale data
    if (step === "sale-data") {
      const unit = directUnit ?? (selectedUnit ? { imei: selectedUnit.imei, modelName: selectedModel?.name ?? "", color: selectedColor ?? "", storage: selectedStorage === "__none__" ? null : selectedStorage, colorHex: selectedColorHex, imagePath: selectedModel?.image_path ?? null } : null);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Header */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px", display: "flex", alignItems: "center", gap: 12 }}>
            <ProductImg path={unit?.imagePath} size={64} alt={unit?.modelName ?? ""} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{unit?.modelName}</p>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{unit?.color}{unit?.storage ? ` · ${unit.storage}` : ""}</p>
              {unit?.imei && <p style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-secondary)", marginTop: 2 }}>IMEI: {unit.imei}</p>}
            </div>
          </div>

          {/* Price */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 10 }}>
            <div>
              <label style={labelStyle}>Precio de venta *</label>
              <input type="number" value={price} onChange={(e) => { setPrice(e.target.value); setPaymentAmount(e.target.value); }} placeholder="0" autoFocus style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Moneda</label>
              <Select value={priceCurrency} onChange={(v) => { setPriceCurrency(v); setPaymentMethod(v === "USD" ? "efectivo_usd" : "efectivo_ars"); }} options={[{ value: "USD", label: "USD" }, { value: "ARS", label: "ARS" }]} />
            </div>
          </div>

          {/* Customer */}
          <div ref={customerRef} style={{ position: "relative" }}>
            <label style={labelStyle}>Cliente (opcional)</label>
            {selectedCustomer ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{selectedCustomer.name}</span>
                {selectedCustomer.phone && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{selectedCustomer.phone}</span>}
                <button onClick={() => { setSelectedCustomer(null); setCustomerQuery(""); }} style={{ color: "var(--text-secondary)", fontSize: 16, cursor: "pointer", background: "none" }}>×</button>
              </div>
            ) : (
              <input value={customerQuery} onChange={(e) => { setCustomerQuery(e.target.value); setShowCustomerDrop(true); }} onFocus={() => customerQuery && setShowCustomerDrop(true)} placeholder="Buscar cliente..." style={inputStyle} />
            )}
            {showCustomerDrop && customerResults.length > 0 && !selectedCustomer && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20, background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.4)", maxHeight: 200, overflowY: "auto" }}>
                {customerResults.map((c) => (
                  <button key={c.id} onMouseDown={() => { setSelectedCustomer(c); setCustomerQuery(c.name); setShowCustomerDrop(false); }}
                    style={{ width: "100%", textAlign: "left", padding: "9px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{c.name}</span>
                    {c.phone && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Payment */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Forma de pago</label>
              <Select value={paymentMethod} onChange={setPaymentMethod} options={PAYMENT_METHODS} />
            </div>
            <div>
              <label style={labelStyle}>Monto</label>
              <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
            <input type="checkbox" checked={isDeposit} onChange={(e) => setIsDeposit(e.target.checked)} />
            Es seña (pago parcial)
          </label>

          <button onClick={handleConfirmSale} disabled={submitting || !price || parseFloat(price) <= 0}
            style={{ width: "100%", padding: "14px", background: "var(--green, #22c55e)", color: "#fff", borderRadius: 10, fontSize: 14, fontWeight: 700, opacity: submitting || !price || parseFloat(price) <= 0 ? 0.4 : 1, cursor: submitting || !price ? "default" : "pointer" }}
          >
            {submitting ? "Registrando..." : "Confirmar venta"}
          </button>
        </div>
      );
    }

    // Done
    if (step === "done") return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "20px 0", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(34,197,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CheckCircle size={32} color="var(--green, #22c55e)" />
        </div>
        <div>
          <p style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Venta registrada</p>
          {saleDone?.customerName && <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 6 }}>Vendido a {saleDone.customerName}</p>}
        </div>
        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          <button onClick={() => { setStep("category"); setDirectUnit(null); setSelectedModel(null); setSelectedColor(null); setSelectedStorage(null); setSelectedVariant(null); setSelectedUnit(null); setPrice(""); setPaymentAmount(""); setSelectedCustomer(null); setCustomerQuery(""); setSaleDone(null); setFreeSell(false); }}
            style={{ flex: 1, padding: "10px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer" }}
          >
            Nueva venta
          </button>
          <button onClick={() => setActiveScreen("sales")}
            style={{ flex: 1, padding: "10px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer" }}
          >
            Ver en Ventas
          </button>
          {onDone && (
            <button onClick={onDone}
              style={{ flex: 1, padding: "10px", background: "var(--brand)", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" }}
            >
              Volver
            </button>
          )}
        </div>
      </div>
    );

    return null;
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ padding: "18px 28px 14px", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          {step !== "category" && step !== "done" && !directUnit && (
            <button onClick={goBack} style={{ color: "var(--text-secondary)", cursor: "pointer", background: "none", padding: 2, display: "flex", alignItems: "center" }}>
              <ArrowLeft size={16} />
            </button>
          )}
          <h1 style={{ fontSize: 17, fontWeight: 700, color: "var(--green, #22c55e)" }}>⚡ {stepTitle[step]}</h1>
        </div>
        {crumbs.length > 0 && !directUnit && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {crumbs.map((p, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>/</span>}
                <button onClick={p.onClick} style={{ fontSize: 12, color: i === crumbs.length - 1 ? "var(--text-primary)" : "var(--brand)", fontWeight: i === crumbs.length - 1 ? 600 : 400, background: "none", cursor: "pointer" }}>{p.label}</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
        {renderStep()}
      </div>
    </div>
  );
}
