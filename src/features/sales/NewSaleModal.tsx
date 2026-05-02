import { useState, useEffect } from "react";
import { X, Plus, Minus, Search } from "lucide-react";
import { salesDb } from "../../lib/db/sales";
import { customersDb } from "../../lib/db/customers";
import { catalogDb } from "../../lib/db/catalog";
import { useDebounce, formatCurrency } from "../../lib/hooks";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useAuthStore } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import Select from "../../components/ui/Select";
import { useBusinessStore } from "../../store/businessStore";
import { resolveImageUrl } from "../../lib/images";
import { categoryEmoji } from "../../lib/templates/productImageMap";
import type { Customer, CatalogItemWithImeis } from "../../lib/db/types";

interface SaleItemDraft {
  _id: string;
  catalog_item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  base_price: number | null;
  imei: string | null;
  from_stock: boolean;
  condition?: string;
  condition_grade?: string;
  condition_battery?: number;
  imagePath?: string | null;
  category?: string | null;
}

function SaleItemThumb({ imagePath, category }: { imagePath?: string | null; category?: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!imagePath) { setUrl(null); return; }
    resolveImageUrl(imagePath).then(setUrl).catch(() => setUrl(null));
  }, [imagePath]);
  return (
    <div style={{ width: 32, height: 32, borderRadius: 5, background: "var(--surface-2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {url ? (
        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
      ) : (
        <span style={{ fontSize: 16 }}>{categoryEmoji(category)}</span>
      )}
    </div>
  );
}

interface PaymentDraft {
  _id: string;
  method: string;
  currency: string;
  amount: string;
  is_deposit: boolean;
}

const PAYMENT_METHODS = [
  { value: "efectivo_usd", label: "Efectivo USD" },
  { value: "efectivo_ars", label: "Efectivo ARS" },
  { value: "transferencia", label: "Transferencia" },
  { value: "usdt", label: "USDT" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "cuotas", label: "Cuotas" },
  { value: "otro", label: "Otro" },
];

function applyPricingPolicy(price: number, policyJson: string | null): number {
  if (!policyJson) return price;
  try {
    const policy = JSON.parse(policyJson) as Record<string, unknown>;
    if (typeof policy.discount === "number" && policy.discount > 0) {
      return Math.round(price * (1 - policy.discount / 100));
    }
  } catch {
    // ignore malformed JSON
  }
  return price;
}

function newPayment(): PaymentDraft {
  return {
    _id: crypto.randomUUID(),
    method: "efectivo_ars",
    currency: "ARS",
    amount: "",
    is_deposit: false,
  };
}

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function NewSaleModal({ onSuccess, onCancel }: Props) {
  const { activeWorkspace } = useWorkspaceStore();
  const { activeBusiness } = useBusinessStore();
  const { userId, userName } = useAuthStore();
  const { showToast } = useUIStore();
  const wid = activeWorkspace?.id ?? "";
  const bid = activeBusiness?.id ?? null;

  // Step
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 — customer
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  // Step 2 — products
  const [productMode, setProductMode] = useState<"stock" | "quick">("stock");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogResults, setCatalogResults] = useState<CatalogItemWithImeis[]>([]);
  const [pendingItem, setPendingItem] = useState<{ item: CatalogItemWithImeis; imeis: string[] } | null>(null);
  const [selectedImei, setSelectedImei] = useState("");
  const [items, setItems] = useState<SaleItemDraft[]>([]);
  // quick sale fields
  const [quickDesc, setQuickDesc] = useState("");
  const [quickPrice, setQuickPrice] = useState("");
  const [quickCurrency, setQuickCurrency] = useState("ARS");
  const [quickQty, setQuickQty] = useState(1);

  // Step 3 — payment
  const [payments, setPayments] = useState<PaymentDraft[]>([newPayment()]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const debouncedCustomerSearch = useDebounce(customerSearch, 250);
  const debouncedCatalogSearch = useDebounce(catalogSearch, 250);

  // Customer search
  useEffect(() => {
    if (!debouncedCustomerSearch || !wid) {
      setCustomerResults([]);
      return;
    }
    customersDb.search(wid, { query: debouncedCustomerSearch })
      .then(setCustomerResults)
      .catch(() => {});
  }, [debouncedCustomerSearch, wid]);

  // Catalog search
  useEffect(() => {
    if (!debouncedCatalogSearch || !wid) {
      setCatalogResults([]);
      return;
    }
    catalogDb.search(wid, debouncedCatalogSearch)
      .then(setCatalogResults)
      .catch(() => {});
  }, [debouncedCatalogSearch, wid]);

  // Totals
  const total = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const balance = total - totalPaid;

  // Quick create customer
  const handleQuickCreate = async () => {
    if (!quickName.trim()) return;
    setIsCreatingCustomer(true);
    try {
      const customer = await customersDb.create(wid, {
        name: quickName.trim(),
        phone: quickPhone.trim() || null,
        type: "final",
        status: "activo",
        created_by: userId ?? null,
      });
      setSelectedCustomer(customer);
      setShowQuickCreate(false);
      setQuickName("");
      setQuickPhone("");
      setCustomerSearch("");
      setCustomerResults([]);
    } catch {
      showToast("Error al crear el cliente");
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  // Add stock item
  const handleSelectCatalogItem = async (item: CatalogItemWithImeis) => {
    setCatalogSearch("");
    setCatalogResults([]);
    const imeis = await catalogDb.getAvailableImeis(item.id).catch(() => []);
    if (imeis.length > 0) {
      setPendingItem({ item, imeis: imeis.map((i) => i.imei) });
      setSelectedImei(imeis[0].imei);
    } else {
      addCatalogItemToList(item, null);
    }
  };

  const addCatalogItemToList = (item: CatalogItemWithImeis, imei: string | null) => {
    const basePrice = item.price ?? 0;
    const unitPrice = applyPricingPolicy(basePrice, selectedCustomer?.pricing_policy_json ?? null);
    let conditionGrade: string | undefined;
    let conditionBattery: number | undefined;
    if (item.condition_details_json) {
      try {
        const d = JSON.parse(item.condition_details_json);
        conditionGrade = d.grade;
        conditionBattery = d.battery_percent;
      } catch { /* ignore */ }
    }
    setItems((prev) => [
      ...prev,
      {
        _id: crypto.randomUUID(),
        catalog_item_id: item.id,
        description: item.name,
        quantity: 1,
        unit_price: unitPrice,
        base_price: unitPrice !== basePrice ? basePrice : null,
        imei,
        from_stock: true,
        condition: item.condition !== "new" ? item.condition : undefined,
        condition_grade: conditionGrade,
        condition_battery: conditionBattery,
        imagePath: item.image_path ?? null,
        category: item.category ?? null,
      },
    ]);
    setPendingItem(null);
  };

  // Add quick item
  const handleAddQuickItem = () => {
    if (!quickDesc.trim() || !quickPrice) return;
    setItems((prev) => [
      ...prev,
      {
        _id: crypto.randomUUID(),
        catalog_item_id: null,
        description: quickDesc.trim(),
        quantity: quickQty,
        unit_price: parseFloat(quickPrice) || 0,
        base_price: null,
        imei: null,
        from_stock: false,
      },
    ]);
    setQuickDesc("");
    setQuickPrice("");
    setQuickQty(1);
  };

  const updateItemQty = (id: string, delta: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i._id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i,
      ),
    );
  };

  const updateItemPrice = (id: string, value: string) => {
    const price = parseFloat(value) || 0;
    setItems((prev) =>
      prev.map((i) => (i._id === id ? { ...i, unit_price: price } : i)),
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i._id !== id));
  };

  const updatePayment = (idx: number, field: keyof PaymentDraft, value: string | boolean) => {
    setPayments((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)),
    );
  };

  const removePayment = (idx: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleConfirm = async () => {
    if (items.length === 0) { showToast("Agregá al menos un producto"); return; }
    if (payments.every((p) => !parseFloat(p.amount))) { showToast("Ingresá al menos un pago"); return; }
    setIsSubmitting(true);
    try {
      await salesDb.createSale(wid, {
        customer_id: selectedCustomer?.id ?? null,
        customer_name: selectedCustomer?.name ?? null,
        seller_id: userId ?? null,
        seller_name: userName ?? null,
        notes: notes.trim() || null,
        business_id: bid,
        items: items.map((item) => ({
          catalog_item_id: item.catalog_item_id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          base_price: item.base_price,
          imei: item.imei,
          from_stock: item.from_stock,
        })),
        payments: payments
          .filter((p) => parseFloat(p.amount) > 0)
          .map((p) => ({
            method: p.method,
            currency: p.currency,
            amount: parseFloat(p.amount),
            is_deposit: p.is_deposit,
          })),
      });
      onSuccess();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al crear la venta");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Styles
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    background: "var(--surface-2)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box" as const,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: 6,
    display: "block",
  };

  return (
    <div>
      {/* Step indicator */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
        {[
          { num: 1, label: "Cliente" },
          { num: 2, label: "Productos" },
          { num: 3, label: "Pago" },
        ].map((s, i, arr) => (
          <div key={s.num} style={{ display: "flex", alignItems: "center", flex: i < arr.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700,
                background: step >= s.num ? "var(--brand)" : "var(--surface-2)",
                color: step >= s.num ? "#fff" : "var(--text-tertiary)",
                transition: "background 0.2s",
              }}>
                {s.num}
              </div>
              <span style={{
                fontSize: 13,
                fontWeight: step === s.num ? 600 : 400,
                color: step === s.num ? "var(--text-primary)" : "var(--text-tertiary)",
              }}>
                {s.label}
              </span>
            </div>
            {i < arr.length - 1 && (
              <div style={{ flex: 1, height: 1, background: "var(--border)", margin: "0 12px" }} />
            )}
          </div>
        ))}
      </div>

      {/* ── STEP 1: CLIENTE ── */}
      {step === 1 && (
        <div>
          <label style={labelStyle}>Cliente (opcional)</label>

          {selectedCustomer ? (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "6px 12px",
              background: "var(--surface-2)",
              border: "1px solid var(--border-strong)",
              borderRadius: 20,
              fontSize: 13, color: "var(--text-primary)",
            }}>
              {selectedCustomer.name}
              <button
                onClick={() => setSelectedCustomer(null)}
                style={{ color: "var(--text-tertiary)", display: "flex", alignItems: "center" }}
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
                <input
                  value={customerSearch}
                  onChange={(e) => { setCustomerSearch(e.target.value); setShowQuickCreate(false); }}
                  placeholder="Buscar cliente por nombre o teléfono..."
                  style={{ ...inputStyle, paddingLeft: 32 }}
                />
              </div>

              {customerResults.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0,
                  background: "var(--surface)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: 8, zIndex: 10, overflow: "hidden",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                  marginTop: 4,
                }}>
                  {customerResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedCustomer(c); setCustomerSearch(""); setCustomerResults([]); }}
                      style={{
                        width: "100%", textAlign: "left", padding: "10px 14px",
                        borderBottom: "1px solid var(--border)",
                        fontSize: 13, color: "var(--text-primary)",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}
                    >
                      <span>{c.name}</span>
                      {c.phone && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{c.phone}</span>}
                    </button>
                  ))}
                  <button
                    onClick={() => { setShowQuickCreate(true); setCustomerResults([]); }}
                    style={{
                      width: "100%", textAlign: "left", padding: "10px 14px",
                      fontSize: 13, color: "var(--brand)", fontWeight: 500,
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <Plus size={13} />
                    Crear cliente rápido "{customerSearch}"
                  </button>
                </div>
              )}

              {!showQuickCreate && customerSearch && customerResults.length === 0 && (
                <div style={{ marginTop: 6 }}>
                  <button
                    onClick={() => setShowQuickCreate(true)}
                    style={{ fontSize: 13, color: "var(--brand)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Plus size={13} />
                    Crear cliente rápido
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quick create form */}
          {showQuickCreate && (
            <div style={{
              marginTop: 12, padding: 14,
              background: "var(--surface-2)",
              border: "1px solid var(--border-strong)",
              borderRadius: 8,
            }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>
                Nuevo cliente
              </p>
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <input
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    placeholder="Nombre *"
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    value={quickPhone}
                    onChange={(e) => setQuickPhone(e.target.value)}
                    placeholder="Teléfono"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleQuickCreate}
                  disabled={!quickName.trim() || isCreatingCustomer}
                  style={{
                    padding: "7px 14px", background: "var(--brand)", borderRadius: 6,
                    fontSize: 12, fontWeight: 600, color: "#fff",
                    opacity: !quickName.trim() || isCreatingCustomer ? 0.5 : 1,
                  }}
                >
                  {isCreatingCustomer ? "Creando..." : "Crear"}
                </button>
                <button
                  onClick={() => setShowQuickCreate(false)}
                  style={{ padding: "7px 14px", background: "var(--surface-3)", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)" }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-tertiary)" }}>
            Podés continuar sin seleccionar un cliente.
          </p>
        </div>
      )}

      {/* ── STEP 2: PRODUCTOS ── */}
      {step === 2 && (
        <div>
          {/* Mode tabs */}
          <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
            {[
              { value: "stock" as const, label: "Del stock" },
              { value: "quick" as const, label: "Venta rápida" },
            ].map((m) => (
              <button
                key={m.value}
                onClick={() => setProductMode(m.value)}
                style={{
                  padding: "7px 14px", fontSize: 13,
                  fontWeight: productMode === m.value ? 600 : 400,
                  color: productMode === m.value ? "var(--brand)" : "var(--text-secondary)",
                  borderBottom: productMode === m.value ? "2px solid var(--brand)" : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Stock mode */}
          {productMode === "stock" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ position: "relative", marginBottom: 8 }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
                <input
                  value={catalogSearch}
                  onChange={(e) => { setCatalogSearch(e.target.value); setPendingItem(null); }}
                  placeholder="Buscar en catálogo..."
                  style={{ ...inputStyle, paddingLeft: 32 }}
                />
              </div>

              {catalogResults.length > 0 && (
                <div style={{
                  border: "1px solid var(--border-strong)", borderRadius: 8,
                  overflow: "hidden", marginBottom: 8,
                }}>
                  {catalogResults.map((item) => {
                    const noStock = item.track_stock === 1 && item.stock <= 0;
                    return (
                      <button
                        key={item.id}
                        onClick={() => !noStock && handleSelectCatalogItem(item)}
                        disabled={noStock}
                        style={{
                          width: "100%", textAlign: "left", padding: "10px 14px",
                          borderBottom: "1px solid var(--border)",
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          opacity: noStock ? 0.5 : 1,
                          cursor: noStock ? "not-allowed" : "pointer",
                        }}
                      >
                        <div>
                          <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{item.name}</span>
                          {noStock && (
                            <span style={{
                              marginLeft: 8, fontSize: 10, padding: "1px 6px",
                              background: "rgba(255,255,255,0.08)", color: "var(--text-tertiary)",
                              borderRadius: 10,
                            }}>
                              Sin stock
                            </span>
                          )}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                          {item.price !== null && (
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                              {formatCurrency(item.price, item.currency)}
                            </span>
                          )}
                          {item.track_stock === 1 && (
                            <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: 8 }}>
                              Stock: {item.stock}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* IMEI selector */}
              {pendingItem && (
                <div style={{
                  padding: 12, background: "var(--surface-2)",
                  border: "1px solid var(--border-strong)", borderRadius: 8, marginBottom: 8,
                }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
                    IMEI para: {pendingItem.item.name}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Select
                      value={selectedImei}
                      onChange={setSelectedImei}
                      options={pendingItem.imeis.map((imei) => ({ value: imei, label: imei }))}
                      style={{ flex: 1 }}
                    />
                  </div>
                  <button
                    onClick={() => addCatalogItemToList(pendingItem.item, selectedImei)}
                    style={{
                      padding: "7px 14px", background: "var(--brand)", borderRadius: 6,
                      fontSize: 12, fontWeight: 600, color: "#fff", marginRight: 6,
                    }}
                  >
                    Agregar
                  </button>
                  <button
                    onClick={() => setPendingItem(null)}
                    style={{ padding: "7px 14px", background: "var(--surface-3)", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)" }}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quick sale mode */}
          {productMode === "quick" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, alignItems: "end", marginBottom: 8 }}>
                <div>
                  <label style={labelStyle}>Descripción</label>
                  <input
                    value={quickDesc}
                    onChange={(e) => setQuickDesc(e.target.value)}
                    placeholder="Ej: Servicio técnico"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Precio</label>
                  <input
                    type="number"
                    value={quickPrice}
                    onChange={(e) => setQuickPrice(e.target.value)}
                    placeholder="0"
                    style={{ ...inputStyle, width: 100 }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Moneda</label>
                  <Select
                    value={quickCurrency}
                    onChange={setQuickCurrency}
                    options={[{ value: "ARS", label: "ARS" }, { value: "USD", label: "USD" }]}
                    style={{ width: 80 }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Cant.</label>
                  <input
                    type="number"
                    min={1}
                    value={quickQty}
                    onChange={(e) => setQuickQty(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{ ...inputStyle, width: 64 }}
                  />
                </div>
              </div>
              <button
                onClick={handleAddQuickItem}
                disabled={!quickDesc.trim() || !quickPrice}
                style={{
                  padding: "7px 14px", background: "var(--brand)", borderRadius: 6,
                  fontSize: 12, fontWeight: 600, color: "#fff",
                  display: "flex", alignItems: "center", gap: 6,
                  opacity: !quickDesc.trim() || !quickPrice ? 0.5 : 1,
                }}
              >
                <Plus size={13} />
                Agregar ítem
              </button>
            </div>
          )}

          {/* Items list */}
          {items.length > 0 && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {items.map((item) => (
                <div
                  key={item._id}
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex", alignItems: "center", gap: 10,
                  }}
                >
                  <SaleItemThumb imagePath={item.imagePath} category={item.category} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
                      {item.description}
                    </p>
                    {item.condition && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 3,
                          background: item.condition === "refurbished" ? "rgba(10,132,255,0.15)" : "rgba(255,214,10,0.15)",
                          color: item.condition === "refurbished" ? "var(--blue)" : "var(--amber)",
                        }}>
                          {item.condition === "refurbished" ? "Reacond." : item.condition_grade ? `Grado ${item.condition_grade}` : "Usado"}
                        </span>
                        {item.condition_battery !== undefined && (
                          <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                            🔋 {item.condition_battery}%
                          </span>
                        )}
                      </div>
                    )}
                    {item.imei && (
                      <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                        IMEI: {item.imei}
                      </p>
                    )}
                  </div>

                  {/* Quantity */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => updateItemQty(item._id, -1)}
                      style={{
                        width: 22, height: 22, borderRadius: 4, background: "var(--surface-2)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      <Minus size={11} />
                    </button>
                    <span style={{ fontSize: 13, minWidth: 20, textAlign: "center", color: "var(--text-primary)" }}>
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateItemQty(item._id, 1)}
                      style={{
                        width: 22, height: 22, borderRadius: 4, background: "var(--surface-2)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      <Plus size={11} />
                    </button>
                  </div>

                  {/* Unit price */}
                  <div style={{ flexShrink: 0 }}>
                    {item.base_price !== null && item.base_price !== item.unit_price && (
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)", textDecoration: "line-through", marginRight: 4 }}>
                        {formatCurrency(item.base_price)}
                      </span>
                    )}
                    <input
                      type="number"
                      value={item.unit_price}
                      onChange={(e) => updateItemPrice(item._id, e.target.value)}
                      style={{ ...inputStyle, width: 90, textAlign: "right" as const }}
                    />
                  </div>

                  {/* Subtotal */}
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", minWidth: 80, textAlign: "right" as const, flexShrink: 0 }}>
                    {formatCurrency(item.unit_price * item.quantity)}
                  </span>

                  {/* Remove */}
                  <button
                    onClick={() => removeItem(item._id)}
                    style={{ color: "var(--text-tertiary)", display: "flex", alignItems: "center", flexShrink: 0 }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <div style={{ padding: "10px 12px", display: "flex", justifyContent: "flex-end" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                  Total: {formatCurrency(total)}
                </span>
              </div>
            </div>
          )}

          {items.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", textAlign: "center", padding: "20px 0" }}>
              {productMode === "stock" ? "Buscá productos en el catálogo" : "Completá el formulario y agregá ítems"}
            </p>
          )}
        </div>
      )}

      {/* ── STEP 3: PAGO ── */}
      {step === 3 && (
        <div>
          {/* Total summary */}
          <div style={{
            padding: "12px 14px", background: "var(--surface-2)", borderRadius: 8, marginBottom: 16,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
              Total a cobrar
            </span>
            <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
              {formatCurrency(total)}
            </span>
          </div>

          {/* Payments */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
            {payments.map((payment, idx) => (
              <div key={payment._id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Select
                  value={payment.method}
                  onChange={(v) => updatePayment(idx, "method", v)}
                  options={PAYMENT_METHODS}
                  style={{ flex: "0 0 160px" }}
                />
                <Select
                  value={payment.currency}
                  onChange={(v) => updatePayment(idx, "currency", v)}
                  options={[{ value: "ARS", label: "ARS" }, { value: "USD", label: "USD" }]}
                  style={{ flex: "0 0 80px" }}
                />
                <input
                  type="number"
                  value={payment.amount}
                  onChange={(e) => updatePayment(idx, "amount", e.target.value)}
                  placeholder="Monto"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", flexShrink: 0, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={payment.is_deposit}
                    onChange={(e) => updatePayment(idx, "is_deposit", e.target.checked)}
                    style={{ accentColor: "var(--brand)" }}
                  />
                  Seña
                </label>
                {payments.length > 1 && (
                  <button
                    onClick={() => removePayment(idx)}
                    style={{ color: "var(--text-tertiary)", display: "flex", alignItems: "center", flexShrink: 0 }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => setPayments((prev) => [...prev, newPayment()])}
            style={{
              fontSize: 13, color: "var(--brand)", fontWeight: 500,
              display: "flex", alignItems: "center", gap: 6, marginBottom: 16,
            }}
          >
            <Plus size={13} />
            Agregar otro medio de pago
          </button>

          {/* Live indicator */}
          <div style={{
            padding: "10px 14px", borderRadius: 8,
            background: balance <= 0 ? "rgba(48,209,88,0.1)" : "rgba(255,214,10,0.1)",
            border: `1px solid ${balance <= 0 ? "rgba(48,209,88,0.25)" : "rgba(255,214,10,0.25)"}`,
            marginBottom: 16,
            display: "flex", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 8,
          }}>
            {[
              { label: "Total", value: formatCurrency(total) },
              { label: "Pagado", value: formatCurrency(totalPaid) },
              { label: "Saldo", value: formatCurrency(Math.max(0, balance)), highlight: balance > 0 },
            ].map(({ label, value, highlight }) => (
              <span key={label} style={{ fontSize: 13 }}>
                <span style={{ color: "var(--text-tertiary)" }}>{label}: </span>
                <span style={{ fontWeight: 600, color: highlight ? "var(--amber)" : "var(--green)" }}>
                  {value}
                </span>
              </span>
            ))}
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones sobre la venta..."
              rows={3}
              style={{ ...inputStyle, resize: "none" as const, lineHeight: 1.5 }}
            />
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)",
      }}>
        <button
          onClick={step === 1 ? onCancel : () => setStep((s) => (s - 1) as 1 | 2 | 3)}
          style={{
            padding: "8px 16px", background: "var(--surface-2)", borderRadius: 8,
            fontSize: 13, color: "var(--text-secondary)",
          }}
        >
          {step === 1 ? "Cancelar" : "← Atrás"}
        </button>

        {step < 3 ? (
          <button
            onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
            style={{
              padding: "8px 18px", background: "var(--brand)", borderRadius: 8,
              fontSize: 13, fontWeight: 600, color: "#fff",
            }}
          >
            Siguiente →
          </button>
        ) : (
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || items.length === 0}
            style={{
              padding: "8px 18px", background: "var(--brand)", borderRadius: 8,
              fontSize: 13, fontWeight: 600, color: "#fff",
              opacity: isSubmitting || items.length === 0 ? 0.5 : 1,
              cursor: isSubmitting || items.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Guardando..." : "Confirmar venta"}
          </button>
        )}
      </div>
    </div>
  );
}
