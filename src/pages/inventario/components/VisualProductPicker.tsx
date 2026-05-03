import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ArrowLeft, Check, Pencil } from "lucide-react";
import { Modal } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import {
  getCategories,
  getFamilies,
  getModels,
  getColorsForModel,
  getStorageForColor,
  resolveVariant,
  type ProductCategory,
  type ProductFamily,
  type ProductModel,
} from "../../../lib/db/quickStock";
import { catalogDb } from "../../../lib/db/catalog";
import { pricingDb } from "../../../lib/db/pricing";
import { settingsDb } from "../../../lib/db/settings";
import { ensurePricingSchema } from "../../../lib/db/ensureSchema";
import { useUIStore } from "../../../store/uiStore";
import { getTemplateImageUrl, categoryEmoji } from "../../../lib/templates/productImageMap";
import { color, radius, space, text, weight } from "../../../tokens";
import type { CatalogItemWithImeis } from "../../../lib/db/types";

interface Props {
  open: boolean;
  onClose: () => void;
  wid: string;
  onCreated?: (item: CatalogItemWithImeis) => void;
  /** Permite iniciar en modo manual (texto libre) */
  onSwitchToManual?: () => void;
}

type Step = "category" | "family" | "model" | "color" | "storage" | "confirm";

interface Picked {
  category?: ProductCategory;
  family?: ProductFamily;
  model?: ProductModel;
  color?: string;
  colorHex?: string | null;
  storage?: string | null;
  /** image del variante seleccionado (cae al modelo si no existe) */
  variantImage?: string | null;
}

export function VisualProductPicker({ open, onClose, wid, onCreated, onSwitchToManual }: Props) {
  const qc = useQueryClient();
  const { showToast } = useUIStore();

  const [step, setStep] = useState<Step>("category");
  const [picked, setPicked] = useState<Picked>({});
  const [costUsd, setCostUsd] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [imeis, setImeis] = useState<string[]>([""]);
  const [prices, setPrices] = useState<Record<string, string>>({}); // customer_type_id -> price USD string
  const [pricesOpen, setPricesOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("category");
      setPicked({});
      setCostUsd("");
      setQuantity(1);
      setImeis([""]);
      setPrices({});
      setPricesOpen(false);
    }
  }, [open]);

  // Cargar tipos de cliente cuando llegamos al confirm
  const customerTypesQ = useQuery({
    queryKey: ["customer-types", wid],
    queryFn: () => settingsDb.getCustomerTypes(wid),
    enabled: open && !!wid,
  });

  // Cuando cambia la cantidad, ajusto el array de IMEIs
  useEffect(() => {
    setImeis((arr) => {
      if (quantity > arr.length) {
        return [...arr, ...Array(quantity - arr.length).fill("")];
      }
      return arr.slice(0, quantity);
    });
  }, [quantity]);

  const categoriesQ = useQuery({
    queryKey: ["picker-categories"],
    queryFn: getCategories,
    enabled: open,
  });

  const familiesQ = useQuery({
    queryKey: ["picker-families", picked.category?.id],
    queryFn: () => (picked.category ? getFamilies(picked.category.id) : Promise.resolve([])),
    enabled: open && !!picked.category,
  });

  const modelsQ = useQuery({
    queryKey: ["picker-models", picked.family?.id],
    queryFn: () => (picked.family ? getModels(picked.family.id) : Promise.resolve([])),
    enabled: open && !!picked.family,
  });

  const colorsQ = useQuery({
    queryKey: ["picker-colors", picked.model?.id],
    queryFn: () => (picked.model ? getColorsForModel(picked.model.id) : Promise.resolve([])),
    enabled: open && !!picked.model,
  });

  const storagesQ = useQuery({
    queryKey: ["picker-storages", picked.model?.id, picked.color],
    queryFn: () =>
      picked.model && picked.color
        ? getStorageForColor(picked.model.id, picked.color)
        : Promise.resolve([]),
    enabled: open && !!picked.model && !!picked.color,
  });

  const finalName = useMemo(() => {
    if (!picked.model) return "";
    const parts = [picked.model.name];
    if (picked.storage) parts.push(picked.storage);
    if (picked.color) parts.push(picked.color);
    return parts.join(" ");
  }, [picked]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!picked.category || !picked.model) throw new Error("Faltan datos");
      await ensurePricingSchema();
      const finalImage = picked.variantImage ?? picked.model.image_path ?? undefined;
      const item = await catalogDb.create(wid, {
        name: finalName,
        category: picked.category.name,
        track_stock: true,
        currency: "ARS",
        image_path: finalImage,
      });

      // 1) Costo USD (opcional)
      const cost = parseFloat(costUsd);
      if (Number.isFinite(cost) && cost > 0) {
        await pricingDb.setCatalogCost(item.id, cost);
      }

      // 2) Precios sugeridos por tipo de cliente (opcional)
      for (const t of customerTypesQ.data ?? []) {
        const v = prices[t.id];
        if (!v) continue;
        const num = parseFloat(v);
        if (Number.isFinite(num) && num > 0) {
          await pricingDb.setCatalogPrice(item.id, t.id, num);
        }
      }

      // 3) IMEIs (filtramos vacíos)
      const cleanImeis = imeis.map((i) => i.trim()).filter(Boolean);
      let added = 0;
      if (cleanImeis.length > 0) {
        const res = await catalogDb.addImeis(item.id, cleanImeis);
        added = res.added;
      }

      return { item, addedImeis: added };
    },
    onSuccess: ({ item, addedImeis }) => {
      qc.invalidateQueries({ queryKey: ["inventario"] });
      qc.invalidateQueries({ queryKey: ["catalog"] });
      qc.invalidateQueries({ queryKey: ["catalog-item-imeis", item.id] });
      const msg = addedImeis > 0
        ? `Producto creado · ${addedImeis} ${addedImeis === 1 ? "unidad cargada" : "unidades cargadas"}`
        : "Producto creado";
      showToast(msg, "success");
      const withImeis: CatalogItemWithImeis = {
        ...item,
        cost_usd: parseFloat(costUsd) || 0,
        available_imeis: addedImeis,
        total_imeis: addedImeis,
      } as CatalogItemWithImeis;
      onCreated?.(withImeis);
      onClose();
    },
  });

  // ─── Navegación ────────────────────────────────────────────
  const goBack = () => {
    if (step === "confirm") {
      // Si no hay storage, volvemos a color
      setStep(storagesQ.data && storagesQ.data.length > 0 ? "storage" : "color");
    } else if (step === "storage") setStep("color");
    else if (step === "color") setStep("model");
    else if (step === "model") setStep("family");
    else if (step === "family") setStep("category");
  };

  const pickCategory = (c: ProductCategory) => {
    setPicked({ category: c });
    setStep("family");
  };
  const pickFamily = (f: ProductFamily) => {
    setPicked((p) => ({ category: p.category, family: f }));
    setStep("model");
  };
  const pickModel = (m: ProductModel) => {
    setPicked((p) => ({ category: p.category, family: p.family, model: m }));
    setStep("color");
  };
  const pickColor = (color_: string, color_hex: string | null) => {
    setPicked((p) => ({ ...p, color: color_, colorHex: color_hex, storage: undefined }));
    setStep("storage");
  };
  const pickStorage = async (s: string | null) => {
    setPicked((p) => ({ ...p, storage: s }));
    // Resolver el variant para obtener su image_path (si existe)
    if (picked.model && picked.color) {
      try {
        const v = await resolveVariant(picked.model.id, picked.color, s);
        setPicked((p) => ({ ...p, variantImage: v?.image_path ?? null }));
      } catch {
        /* ignore */
      }
    }
    setStep("confirm");
  };

  // Si el modelo no tiene storages, saltamos directo a confirm
  useEffect(() => {
    if (step === "storage" && storagesQ.data && storagesQ.data.length === 0 && picked.color) {
      setPicked((p) => ({ ...p, storage: null }));
      setStep("confirm");
    }
  }, [step, storagesQ.data, picked.color]);

  if (!open) return null;

  // ─── Render por step ───────────────────────────────────────
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Agregar producto"
      subtitle={subtitleForStep(step)}
      maxWidth={780}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
          <button
            onClick={onSwitchToManual}
            style={{
              fontSize: text.xs,
              color: color.textMuted,
              textDecoration: "underline",
              background: "transparent",
            }}
          >
            <Pencil size={11} style={{ display: "inline", marginRight: 4 }} />
            Cargar manualmente
          </button>
          <div style={{ display: "flex", gap: space[2] }}>
            {step !== "category" && (
              <Button variant="ghost" iconLeft={<ArrowLeft size={14} />} onClick={goBack}>
                Atrás
              </Button>
            )}
            {step === "confirm" ? (
              <Button
                variant="primary"
                iconLeft={<Check size={14} />}
                onClick={() => createMut.mutate()}
                loading={createMut.isPending}
              >
                {(() => {
                  const filledImeis = imeis.filter((i) => i.trim()).length;
                  if (filledImeis === 0) return "Crear producto";
                  return `Crear y cargar ${filledImeis} ${filledImeis === 1 ? "unidad" : "unidades"}`;
                })()}
              </Button>
            ) : (
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
            )}
          </div>
        </div>
      }
    >
      {/* Breadcrumbs */}
      <Breadcrumbs picked={picked} step={step} />

      {step === "category" && (
        <CategoryGrid
          categories={categoriesQ.data ?? []}
          loading={categoriesQ.isLoading}
          onPick={pickCategory}
        />
      )}

      {step === "family" && (
        <FamilyGrid
          families={familiesQ.data ?? []}
          loading={familiesQ.isLoading}
          onPick={pickFamily}
        />
      )}

      {step === "model" && (
        <ModelGrid
          models={modelsQ.data ?? []}
          loading={modelsQ.isLoading}
          onPick={pickModel}
        />
      )}

      {step === "color" && picked.model && (
        <ColorGrid
          model={picked.model}
          colors={colorsQ.data ?? []}
          loading={colorsQ.isLoading}
          onPick={pickColor}
        />
      )}

      {step === "storage" && (
        <StorageGrid
          storages={storagesQ.data ?? []}
          loading={storagesQ.isLoading}
          onPick={pickStorage}
        />
      )}

      {step === "confirm" && picked.model && (
        <ConfirmPanel
          name={finalName}
          model={picked.model}
          colorHex={picked.colorHex ?? null}
          variantImage={picked.variantImage ?? null}
          costUsd={costUsd}
          onCostChange={setCostUsd}
          quantity={quantity}
          onQuantityChange={setQuantity}
          imeis={imeis}
          onImeiChange={(idx, v) =>
            setImeis((arr) => arr.map((x, i) => (i === idx ? v : x)))
          }
          customerTypes={customerTypesQ.data ?? []}
          prices={prices}
          onPriceChange={(typeId, v) => setPrices((p) => ({ ...p, [typeId]: v }))}
          pricesOpen={pricesOpen}
          onTogglePrices={() => setPricesOpen((o) => !o)}
        />
      )}
    </Modal>
  );
}

function subtitleForStep(step: Step) {
  switch (step) {
    case "category": return "Elegí la categoría del producto.";
    case "family": return "¿Qué línea?";
    case "model": return "Elegí el modelo.";
    case "color": return "Elegí el color.";
    case "storage": return "Elegí el almacenamiento.";
    case "confirm": return "Revisá y confirmá.";
  }
}

// ─── Sub-components ─────────────────────────────────────────────────

function Breadcrumbs({ picked, step }: { picked: Picked; step: Step }) {
  const items: string[] = [];
  if (picked.category) items.push(`${categoryEmoji(picked.category.name)} ${picked.category.name}`);
  if (picked.family) items.push(picked.family.name);
  if (picked.model) items.push(picked.model.name);
  if (picked.color) items.push(picked.color);
  if (picked.storage) items.push(picked.storage);

  if (items.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: space[1],
        marginBottom: space[4],
        fontSize: text.xs,
        color: color.textMuted,
      }}
    >
      {items.map((it, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {i > 0 && <ChevronRight size={11} />}
          <span style={{ color: i === items.length - 1 ? color.text : color.textMuted, fontWeight: i === items.length - 1 ? weight.semibold : weight.medium }}>
            {it}
          </span>
        </span>
      ))}
      {step !== "confirm" && items.length > 0 && (
        <span style={{ color: color.textDim }}>
          <ChevronRight size={11} style={{ display: "inline", verticalAlign: "middle" }} /> ...
        </span>
      )}
    </div>
  );
}

function gridStyle(min = 140): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
    gap: space[3],
  };
}

function PickCard({
  onClick,
  children,
  height = 140,
  featured = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  height?: number;
  featured?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative",
        background: color.surface,
        border: `1px solid ${featured ? color.primary : color.border}`,
        borderRadius: radius.md,
        padding: space[3],
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: space[2],
        cursor: "pointer",
        transition: "all 120ms",
        textAlign: "center",
        boxShadow: featured ? `0 0 0 3px rgba(225, 29, 72, 0.15)` : "none",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = color.primary;
        e.currentTarget.style.background = color.surfaceHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = featured ? color.primary : color.border;
        e.currentTarget.style.background = color.surface;
      }}
    >
      {children}
    </button>
  );
}

function CategoryGrid({
  categories,
  loading,
  onPick,
}: {
  categories: ProductCategory[];
  loading: boolean;
  onPick: (c: ProductCategory) => void;
}) {
  if (loading) return <Loading />;
  if (categories.length === 0) return <Empty msg="No hay categorías. Probá 'Cargar manualmente'." />;
  return (
    <div style={gridStyle(150)}>
      {categories.map((c) => (
        <PickCard key={c.id} onClick={() => onPick(c)} height={130}>
          <span style={{ fontSize: 36 }}>{c.emoji ?? categoryEmoji(c.name)}</span>
          <span style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
            {c.name}
          </span>
        </PickCard>
      ))}
    </div>
  );
}

function FamilyGrid({
  families,
  loading,
  onPick,
}: {
  families: ProductFamily[];
  loading: boolean;
  onPick: (f: ProductFamily) => void;
}) {
  if (loading) return <Loading />;
  if (families.length === 0) return <Empty msg="Sin líneas para esta categoría." />;
  return (
    <div style={gridStyle(160)}>
      {families.map((f) => (
        <PickCard key={f.id} onClick={() => onPick(f)} height={90}>
          <span style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
            {f.name}
          </span>
        </PickCard>
      ))}
    </div>
  );
}

function ModelGrid({
  models,
  loading,
  onPick,
}: {
  models: ProductModel[];
  loading: boolean;
  onPick: (m: ProductModel) => void;
}) {
  if (loading) return <Loading />;
  if (models.length === 0) return <Empty msg="Sin modelos." />;
  return (
    <div style={gridStyle(180)}>
      {models.map((m, idx) => {
        const img = getTemplateImageUrl(m.image_path);
        const featured = idx === 0; // primero por sort_order = más reciente/tendencia
        return (
          <PickCard key={m.id} onClick={() => onPick(m)} height={196} featured={featured}>
            {featured && (
              <span
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  fontSize: 10,
                  fontWeight: weight.bold,
                  color: color.primary,
                  background: color.surface,
                  border: `1px solid ${color.primary}`,
                  borderRadius: radius.sm,
                  padding: "2px 6px",
                  letterSpacing: "0.4px",
                  textTransform: "uppercase",
                }}
              >
                Tendencia
              </span>
            )}
            <div
              style={{
                flex: 1,
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: color.surface2,
                borderRadius: radius.sm,
              }}
            >
              {img ? (
                <img src={img} alt={m.name} style={{ maxWidth: "85%", maxHeight: 100, objectFit: "contain" }} />
              ) : (
                <span style={{ fontSize: 32 }}>📦</span>
              )}
            </div>
            <span style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
              {m.name}
            </span>
          </PickCard>
        );
      })}
    </div>
  );
}

function ColorGrid({
  model,
  colors,
  loading,
  onPick,
}: {
  model: ProductModel;
  colors: { color: string; color_hex: string | null }[];
  loading: boolean;
  onPick: (c: string, hex: string | null) => void;
}) {
  if (loading) return <Loading />;
  if (colors.length === 0) {
    // Si no hay colores, salteamos el paso (raro pero defensivo)
    return <Empty msg="Sin colores definidos." />;
  }
  const img = getTemplateImageUrl(model.image_path);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space[4] }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        {img && <img src={img} alt={model.name} style={{ maxHeight: 140, objectFit: "contain" }} />}
      </div>
      <div style={gridStyle(140)}>
        {colors.map((c) => (
          <PickCard key={c.color} onClick={() => onPick(c.color, c.color_hex)} height={110}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: c.color_hex ?? color.surface2,
                border: `1px solid ${color.border}`,
              }}
            />
            <span style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
              {c.color}
            </span>
          </PickCard>
        ))}
      </div>
    </div>
  );
}

function StorageGrid({
  storages,
  loading,
  onPick,
}: {
  storages: string[];
  loading: boolean;
  onPick: (s: string | null) => void;
}) {
  if (loading) return <Loading />;
  if (storages.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: space[5] }}>
        <p style={{ fontSize: text.sm, color: color.textMuted, marginBottom: space[3] }}>
          Este producto no tiene variantes de almacenamiento.
        </p>
        <Button variant="primary" onClick={() => onPick(null)}>
          Continuar
        </Button>
      </div>
    );
  }
  return (
    <div style={gridStyle(120)}>
      {storages.map((s) => (
        <PickCard key={s} onClick={() => onPick(s)} height={90}>
          <span style={{ fontSize: text.lg, fontWeight: weight.bold, color: color.text }}>{s}</span>
        </PickCard>
      ))}
    </div>
  );
}

function ConfirmPanel({
  name,
  model,
  colorHex,
  variantImage,
  costUsd,
  onCostChange,
  quantity,
  onQuantityChange,
  imeis,
  onImeiChange,
  customerTypes,
  prices,
  onPriceChange,
  pricesOpen,
  onTogglePrices,
}: {
  name: string;
  model: ProductModel;
  colorHex: string | null;
  variantImage: string | null;
  costUsd: string;
  onCostChange: (v: string) => void;
  quantity: number;
  onQuantityChange: (n: number) => void;
  imeis: string[];
  onImeiChange: (idx: number, v: string) => void;
  customerTypes: { id: string; name: string }[];
  prices: Record<string, string>;
  onPriceChange: (typeId: string, v: string) => void;
  pricesOpen: boolean;
  onTogglePrices: () => void;
}) {
  const img = getTemplateImageUrl(variantImage) ?? getTemplateImageUrl(model.image_path);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space[4] }}>
      {/* Hero: producto seleccionado */}
      <div
        style={{
          display: "flex",
          gap: space[4],
          alignItems: "center",
          background: color.surface2,
          border: `1px solid ${color.border}`,
          borderRadius: radius.md,
          padding: space[4],
        }}
      >
        <div
          style={{
            width: 84,
            height: 84,
            background: color.surface,
            borderRadius: radius.md,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {img ? (
            <img src={img} alt={name} style={{ width: "85%", height: "85%", objectFit: "contain" }} />
          ) : (
            <span style={{ fontSize: 40 }}>📦</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: text.md, fontWeight: weight.bold, color: color.text }}>{name}</div>
          {colorHex && (
            <div style={{ display: "flex", alignItems: "center", gap: space[2], marginTop: space[1] }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: colorHex,
                  border: `1px solid ${color.border}`,
                }}
              />
              <span style={{ fontSize: text.xs, color: color.textMuted }}>{model.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Costo + Cantidad */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: space[3] }}>
        <div>
          <label style={SectionLabel}>Costo (USD) — opcional</label>
          <Input
            type="number"
            step="0.01"
            value={costUsd}
            onChange={(e) => onCostChange(e.target.value)}
            placeholder="Ej: 850"
          />
        </div>
        <div>
          <label style={SectionLabel}>Cantidad</label>
          <Input
            type="number"
            min="1"
            step="1"
            value={String(quantity)}
            onChange={(e) => onQuantityChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
        </div>
      </div>

      {/* IMEIs */}
      <div>
        <label style={SectionLabel}>
          IMEI / Serie por unidad — opcional
        </label>
        <p style={{ fontSize: text.xs, color: color.textMuted, marginTop: 2, marginBottom: space[2] }}>
          Las unidades sin IMEI se pueden completar después desde el detalle del producto.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: space[2], maxHeight: 200, overflowY: "auto" }}>
          {imeis.map((imei, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: space[2] }}>
              <span
                style={{
                  fontSize: 11,
                  color: color.textMuted,
                  width: 28,
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                #{idx + 1}
              </span>
              <Input
                value={imei}
                onChange={(e) => onImeiChange(idx, e.target.value)}
                placeholder="35XXXXXXXXXXXXX"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Precios sugeridos (collapsible) */}
      <div style={{ background: color.surface2, border: `1px solid ${color.border}`, borderRadius: radius.md }}>
        <button
          onClick={onTogglePrices}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: space[3],
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: color.text,
          }}
        >
          <span style={{ fontSize: text.sm, fontWeight: weight.semibold }}>
            Precios sugeridos por tipo de cliente
          </span>
          <span style={{ fontSize: text.xs, color: color.textMuted }}>
            {pricesOpen ? "Ocultar" : "Opcional · cargar"}
          </span>
        </button>
        {pricesOpen && (
          <div style={{ padding: `0 ${space[3]} ${space[3]}`, display: "flex", flexDirection: "column", gap: space[2] }}>
            {customerTypes.length === 0 ? (
              <p style={{ fontSize: text.xs, color: color.textMuted, margin: 0 }}>
                Definí tipos de cliente en Ajustes → Tipos de cliente.
              </p>
            ) : (
              customerTypes.map((t) => (
                <div key={t.id} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: space[2], alignItems: "center" }}>
                  <span style={{ fontSize: text.sm, color: color.text, fontWeight: weight.medium }}>{t.name}</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={prices[t.id] ?? ""}
                    onChange={(e) => onPriceChange(t.id, e.target.value)}
                    placeholder="USD"
                  />
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const SectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: weight.semibold,
  color: color.textDim,
  textTransform: "uppercase",
  letterSpacing: "0.6px",
  display: "block",
  marginBottom: space[2],
};

function Loading() {
  return (
    <div style={{ padding: space[5], textAlign: "center", color: color.textMuted, fontSize: text.sm }}>
      Cargando…
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div style={{ padding: space[5], textAlign: "center", color: color.textMuted, fontSize: text.sm }}>
      {msg}
    </div>
  );
}
