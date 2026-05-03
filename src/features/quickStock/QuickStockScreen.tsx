import { useState, useEffect, useRef } from "react";
import { Layers, CheckCircle, AlertCircle, XCircle, ArrowLeft, ChevronDown } from "lucide-react";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useUIStore } from "../../store/uiStore";
import { useBusinessStore } from "../../store/businessStore";
import { cashDb } from "../../lib/db/cash";
import Select from "../../components/ui/Select";
import { getTemplateImageUrl, allProductImages } from "../../lib/templates/productImageMap";
import {
  getCategories,
  getFamilies,
  getModels,
  getColorsForModel,
  getStorageForColor,
  resolveVariant,
  validateIMEI,
  checkIMEIDuplicate,
  createStockItem,
  deleteStockItem,
  type ProductCategory,
  type ProductFamily,
  type ProductModel,
  type ProductVariant,
  type ColorOption,
  type ModelWithContext,
} from "../../lib/db/quickStock";

type Step = "category" | "family" | "model" | "variant" | "imei";

export interface QuickStockScreenProps {
  onViewStock?: () => void;
  preSelection?: ModelWithContext;
}

interface SessionItem {
  id: string;
  imei: string;
  color: string;
  color_hex: string | null;
  storage: string | null;
  model_name: string;
  image_path: string | null;
}

// ─── Sub-components ──────────────────────────────────────────────

function ProductImage({
  path,
  size,
  alt,
}: {
  path: string | null | undefined;
  size: number;
  alt: string;
}) {
  const url = path ? getTemplateImageUrl(path) : null;
  const [errored, setErrored] = useState(false);

  if (!url || errored) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          background: "var(--surface-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.4,
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
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        flexShrink: 0,
      }}
    />
  );
}

// ─── Image resolution helpers ────────────────────────────────────

function resolveModelImage(model: ProductModel): string | null {
  if (!model.image_path) return null;
  return allProductImages[model.image_path] ?? null;
}

/**
 * Finds the best-matching image for a given model + color combination.
 *
 * Strategy: derive a "model prefix" from the model's default image_path by
 * progressively removing trailing filename parts (the default color), then
 * search for files sharing that prefix that also contain the selected color
 * keywords. A discriminator check prevents "iPhone 17 Pro" from matching
 * "iPhone 17 Pro Max" files, and "iPhone 12" from matching "iPhone 12 Mini".
 */
function resolveColorImage(model: ProductModel, color: string): string | null {
  if (!color || !model.image_path) return null;

  // Normalize color: "(PRODUCT)RED" → ["red"], "Natural Titanium" → ["natural","titanium"]
  const colorParts = color
    .toLowerCase()
    .split(/[\s_()\-]+/)
    .filter((p) => p.length > 0 && p !== "product");

  if (colorParts.length === 0) return null;

  const dir = model.image_path.substring(0, model.image_path.lastIndexOf("/"));
  const defaultBase = (model.image_path.split("/").pop() ?? "").replace(/\.(jpe?g|png|webp)$/i, "");
  const defaultParts = defaultBase.split("_");
  // Words that distinguish sub-variants. If one immediately follows the derived
  // prefix but was NOT in the original filename, it's a false positive for a
  // different model (e.g. "max" → Pro Max ≠ Pro, "15" → MBA 15" ≠ MBA 13").
  const variantDiscriminators = new Set(["max", "mini", "plus", "15"]);

  const seen = new Set<string>();
  const candidates: Array<{ path: string; score: number }> = [];

  for (let cut = 1; cut <= Math.min(4, defaultParts.length - 1); cut++) {
    const prefixParts = defaultParts.slice(0, defaultParts.length - cut);
    const prefix = prefixParts.join("_").toLowerCase();
    if (!prefix) continue;
    const prefixSet = new Set(prefixParts.map((p) => p.toLowerCase()));

    for (const path of Object.keys(allProductImages)) {
      if (seen.has(path)) continue;
      const pathDir = path.substring(0, path.lastIndexOf("/"));
      if (pathDir !== dir) continue;

      const file = (path.split("/").pop() ?? "").replace(/\.(jpe?g|png|webp)$/i, "").toLowerCase();
      if (!file.startsWith(prefix + "_") && file !== prefix) continue;

      // Reject if the first word after the prefix is a variant discriminator
      // that wasn't part of the model's own prefix (e.g. rejects Pro Max files
      // when matching Pro, rejects Mini files when matching base model).
      const suffix = file.substring(prefix.length + 1); // strip "prefix_"
      const firstSuffixWord = suffix.split("_")[0];
      if (firstSuffixWord && variantDiscriminators.has(firstSuffixWord) && !prefixSet.has(firstSuffixWord)) {
        continue;
      }

      const matched = colorParts.filter((p) => file.includes(p)).length;
      if (matched === 0) continue;

      seen.add(path);
      // score: more color parts matched wins; among ties prefer longer prefix (more specific)
      candidates.push({ path, score: matched * 10 + prefixParts.length });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return allProductImages[candidates[0].path];
}

// ─── Main component ───────────────────────────────────────────────

export default function QuickStockScreen({ onViewStock, preSelection }: QuickStockScreenProps = {}) {
  const { activeWorkspace } = useWorkspaceStore();
  const { showToast, setActiveScreen } = useUIStore();
  const { activeBusiness } = useBusinessStore();

  const [step, setStep] = useState<Step>("category");
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

  const [imeiInput, setImeiInput] = useState("");
  const [imeiValid, setImeiValid] = useState(false);
  const [imeiError, setImeiError] = useState<string | null>(null);
  const [imeiSuccess, setImeiSuccess] = useState(false);
  const [adding, setAdding] = useState(false);
  const [lastAdded, setLastAdded] = useState<SessionItem[]>([]);
  const [hoveredColor, setHoveredColor] = useState<string | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [showCost, setShowCost] = useState(false);
  const [costAmount, setCostAmount] = useState("");
  const [costCurrency, setCostCurrency] = useState("USD");

  const imeiRef = useRef<HTMLInputElement>(null);

  // Apply pre-selection when provided
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

  // Load categories on mount (skip if pre-selection)
  useEffect(() => {
    if (preSelection) return;
    getCategories().then(setCategories).catch(() => {});
  }, []);

  // Load families when category changes
  useEffect(() => {
    if (!selectedCategory) return;
    getFamilies(selectedCategory.id).then(setFamilies).catch(() => {});
  }, [selectedCategory?.id]);

  // Load models when family changes
  useEffect(() => {
    if (!selectedFamily) return;
    getModels(selectedFamily.id).then(setModels).catch(() => {});
  }, [selectedFamily?.id]);

  // Load colors when model changes; reset color-specific image
  useEffect(() => {
    if (!selectedModel) return;
    setSelectedColor(null);
    setSelectedColorHex(null);
    setSelectedStorage(null);
    setStorages([]);
    setCurrentImageUrl(null);
    getColorsForModel(selectedModel.id).then(setColors).catch(() => {});
  }, [selectedModel?.id]);

  // Load storages when color changes
  useEffect(() => {
    if (!selectedColor || !selectedModel) return;
    setSelectedStorage(null);
    getStorageForColor(selectedModel.id, selectedColor).then((rawStorages) => {
      // Filter out SQL NULLs — products without storage (AirPods) return [null]
      const real = (rawStorages as (string | null)[]).filter((s): s is string => s !== null && s !== "");
      setStorages(real);
      if (real.length === 0) {
        // No storage field for this product — use sentinel so Continuar activates
        setSelectedStorage("__none__");
      } else if (real.length === 1) {
        // Pre-select the only option, but DON'T auto-advance (user clicks Continuar)
        setSelectedStorage(real[0]);
      }
    }).catch(() => {});
  }, [selectedColor, selectedModel?.id]);

  // Focus IMEI input when entering that step
  useEffect(() => {
    if (step === "imei") {
      setTimeout(() => imeiRef.current?.focus(), 100);
    }
  }, [step]);

  // Validate IMEI in real time
  useEffect(() => {
    const clean = imeiInput.replace(/\s/g, "");
    if (clean.length < 15) {
      setImeiValid(false);
      setImeiError(null);
      return;
    }
    if (!validateIMEI(clean)) {
      setImeiValid(false);
      setImeiError(null);
      return;
    }
    if (!activeWorkspace?.id) return;
    checkIMEIDuplicate(activeWorkspace.id, clean)
      .then((dup) => {
        if (dup) {
          setImeiValid(false);
          setImeiError("IMEI ya registrado");
        } else {
          setImeiValid(true);
          setImeiError(null);
        }
      })
      .catch(() => {});
  }, [imeiInput, activeWorkspace?.id]);

  const handleIMEIChange = (raw: string) => {
    const clean = raw.replace(/\D/g, "").slice(0, 15);
    setImeiInput(clean);
    setImeiSuccess(false);
  };

  const handleIMEIPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 15);
    setImeiInput(pasted);
    setImeiSuccess(false);
  };

  const handleAddIMEI = async () => {
    if (!imeiValid || !selectedVariant || !activeWorkspace?.id) return;
    setAdding(true);
    try {
      const id = await createStockItem(activeWorkspace.id, selectedVariant.id, imeiInput);
      // Optional: register purchase cost as cash outflow
      if (showCost && costAmount && parseFloat(costAmount) > 0 && activeBusiness?.id) {
        const desc = `Compra: ${selectedModel!.name} ${selectedColor ?? ""} ${selectedStorage && selectedStorage !== "__none__" ? selectedStorage : ""}`.trim();
        await cashDb.createMovement(activeWorkspace.id, activeBusiness.id, {
          type: "compra",
          direction: "out",
          amount: parseFloat(costAmount),
          currency: costCurrency,
          description: desc,
        }).catch(() => {});
      }
      setLastAdded((prev) => [
        {
          id,
          imei: imeiInput,
          color: selectedColor!,
          color_hex: selectedColorHex,
          storage: selectedStorage! === "__none__" ? null : selectedStorage,
          model_name: selectedModel!.name,
          image_path: selectedModel!.image_path,
        },
        ...prev,
      ]);
      setImeiInput("");
      setImeiValid(false);
      setImeiSuccess(true);
      setTimeout(() => setImeiSuccess(false), 1500);
    } catch {
      showToast("Error al registrar ingreso");
    } finally {
      setAdding(false);
    }
  };

  const handleContinue = async () => {
    if (!selectedColor || !selectedModel || selectedStorage === null) return;
    setResolving(true);
    try {
      const storageParam = selectedStorage === "__none__" ? null : selectedStorage;
      const v = await resolveVariant(selectedModel.id, selectedColor, storageParam);
      if (v) {
        setSelectedVariant(v);
        setStep("imei");
      }
    } catch {
      showToast("Error al resolver variante");
    } finally {
      setResolving(false);
    }
  };

  const handleRemoveSession = async (id: string) => {
    try {
      await deleteStockItem(id);
      setLastAdded((prev) => prev.filter((i) => i.id !== id));
    } catch {
      showToast("Error al eliminar");
    }
  };

  const resetAll = () => {
    setStep("category");
    setSelectedCategory(null);
    setSelectedFamily(null);
    setSelectedModel(null);
    setSelectedColor(null);
    setSelectedColorHex(null);
    setSelectedStorage(null);
    setSelectedVariant(null);
    setImeiInput("");
    setImeiValid(false);
    setImeiError(null);
    setLastAdded([]);
  };

  // ─── Breadcrumb ──────────────────────────────────────────────

  const renderBreadcrumb = () => {
    const parts: { label: string; onClick: () => void }[] = [];
    if (selectedCategory) {
      parts.push({
        label: selectedCategory.name,
        onClick: () => {
          setStep("family");
          setSelectedFamily(null);
          setSelectedModel(null);
          setSelectedColor(null);
          setSelectedStorage(null);
          setSelectedVariant(null);
        },
      });
    }
    if (selectedFamily) {
      parts.push({
        label: selectedFamily.name,
        onClick: () => {
          setStep("model");
          setSelectedModel(null);
          setSelectedColor(null);
          setSelectedStorage(null);
          setSelectedVariant(null);
        },
      });
    }
    if (selectedModel) {
      parts.push({
        label: selectedModel.name,
        onClick: () => {
          setStep("variant");
          setSelectedColor(null);
          setSelectedStorage(null);
          setSelectedVariant(null);
        },
      });
    }
    if (parts.length === 0) return null;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {parts.map((p, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <span style={{ color: "var(--text-muted)", fontSize: 12 }}>/</span>}
            <button
              onClick={p.onClick}
              style={{
                fontSize: 12,
                color: i === parts.length - 1 ? "var(--text)" : "var(--primary)",
                fontWeight: i === parts.length - 1 ? 600 : 400,
                background: "none",
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          </span>
        ))}
      </div>
    );
  };

  const stepTitles: Record<Step, string> = {
    category: "Seleccionar categoría",
    family: "Seleccionar familia",
    model: "Seleccionar modelo",
    variant: "Seleccionar variante",
    imei: "Cargar mercadería",
  };

  // ─── Steps ───────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {
      case "category":
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCategory(cat);
                  setStep("family");
                }}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: cat.id === "cat-iphone" ? "24px 16px" : "20px 16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  transition: "border-color 0.15s, transform 0.1s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--primary)";
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                }}
              >
                <span style={{ fontSize: cat.id === "cat-iphone" ? 48 : 36 }}>
                  {cat.emoji}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                  {cat.name}
                </span>
              </button>
            ))}
          </div>
        );

      case "family":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {families.map((fam) => (
              <button
                key={fam.id}
                onClick={() => {
                  setSelectedFamily(fam);
                  setStep("model");
                }}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  transition: "border-color 0.15s, background 0.15s",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--primary)";
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--surface)";
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                  {fam.name}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>›</span>
              </button>
            ))}
          </div>
        );

      case "model":
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {models.map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  setSelectedModel(model);
                  setStep("variant");
                }}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  transition: "border-color 0.15s, transform 0.1s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--primary)";
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                }}
              >
                <ProductImage path={model.image_path} size={120} alt={model.name} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", textAlign: "center" }}>
                  {model.name}
                </span>
              </button>
            ))}
          </div>
        );

      case "variant": {
        const variantDisplayUrl = currentImageUrl
          ?? (selectedModel ? resolveModelImage(selectedModel) : null);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Model header — image updates with color selection */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              {variantDisplayUrl ? (
                <img
                  key={variantDisplayUrl}
                  src={variantDisplayUrl}
                  alt={selectedModel?.name ?? ""}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }}
                  style={{ width: 200, height: 200, objectFit: "contain", transition: "opacity 0.2s ease" }}
                />
              ) : (
                <div style={{ width: 200, height: 200, borderRadius: 12, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 80 }}>
                  📱
                </div>
              )}
              <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", textAlign: "center" }}>
                {selectedModel?.name}
              </p>
            </div>

            {/* Color */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Color
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {colors.map((c) => {
                  const selected = selectedColor === c.color;
                  const hovered = hoveredColor === c.color;
                  return (
                    <div key={c.color} style={{ position: "relative" }}>
                      <button
                        onClick={() => {
                          setSelectedColor(c.color);
                          setSelectedColorHex(c.color_hex);
                          setSelectedStorage(null);
                          if (selectedModel) {
                            const url = resolveColorImage(selectedModel, c.color);
                            setCurrentImageUrl(url);
                          }
                        }}
                        onMouseEnter={() => setHoveredColor(c.color)}
                        onMouseLeave={() => setHoveredColor(null)}
                        title={c.color}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: c.color_hex ?? "#888",
                          border: selected
                            ? "2px solid var(--primary)"
                            : "2px solid var(--border)",
                          transform: selected ? "scale(1.25)" : hovered ? "scale(1.1)" : "scale(1)",
                          transition: "transform 0.15s, border-color 0.15s",
                          cursor: "pointer",
                          boxShadow: selected ? "0 0 0 2px var(--bg), 0 0 0 4px var(--primary)" : "none",
                        }}
                      />
                      {hovered && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: "calc(100% + 6px)",
                            left: "50%",
                            transform: "translateX(-50%)",
                            background: "var(--text)",
                            color: "var(--bg)",
                            fontSize: 11,
                            fontWeight: 500,
                            padding: "4px 8px",
                            borderRadius: 5,
                            whiteSpace: "nowrap",
                            pointerEvents: "none",
                            zIndex: 10,
                          }}
                        >
                          {c.color}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {selectedColor && (
                <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
                  {selectedColor}
                </p>
              )}
            </div>

            {/* Storage chips — only when there are real (non-null) options */}
            {selectedColor && storages.length > 0 && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Capacidad
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {storages.map((s) => {
                    const sel = selectedStorage === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setSelectedStorage(s)}
                        style={{
                          padding: "7px 16px",
                          borderRadius: 20,
                          fontSize: 13,
                          fontWeight: 600,
                          background: sel ? "var(--primary)" : "var(--surface-2)",
                          color: sel ? "#fff" : "var(--text)",
                          border: sel ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                          cursor: "pointer",
                          transition: "background 0.15s, color 0.15s",
                        }}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Continuar — visible when color selected AND storage resolved (or not needed) */}
            {selectedColor && selectedStorage !== null && (
              <button
                onClick={handleContinue}
                disabled={resolving}
                style={{
                  width: "100%",
                  padding: "13px",
                  background: "var(--primary)",
                  color: "#fff",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  opacity: resolving ? 0.5 : 1,
                  cursor: resolving ? "default" : "pointer",
                  transition: "opacity 0.15s",
                  marginTop: 4,
                }}
              >
                {resolving ? "Cargando..." : "Continuar →"}
              </button>
            )}
          </div>
        );
      }

      case "imei":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Confirmation header */}
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "16px",
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              {(() => {
                const imeiImgUrl = currentImageUrl ?? (selectedModel ? resolveModelImage(selectedModel) : null);
                return imeiImgUrl ? (
                  <img
                    src={imeiImgUrl}
                    alt={selectedModel?.name ?? ""}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }}
                    style={{ width: 72, height: 72, objectFit: "contain", flexShrink: 0 }}
                  />
                ) : (
                  <div style={{ width: 72, height: 72, borderRadius: 8, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, flexShrink: 0 }}>📱</div>
                );
              })()}
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                  {selectedModel?.name}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  {selectedColorHex && (
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: selectedColorHex,
                        border: "1px solid var(--border)",
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    {selectedColor} · {selectedStorage}
                  </span>
                </div>
              </div>
            </div>

            {/* IMEI Input */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                IMEI
              </label>
              <div style={{ position: "relative" }}>
                <input
                  ref={imeiRef}
                  type="text"
                  inputMode="numeric"
                  value={imeiInput}
                  maxLength={15}
                  onChange={(e) => handleIMEIChange(e.target.value)}
                  onPaste={handleIMEIPaste}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && imeiValid) handleAddIMEI();
                  }}
                  placeholder="Ingresar IMEI (15 dígitos)"
                  style={{
                    width: "100%",
                    padding: "12px 44px 12px 14px",
                    background: "var(--surface-2)",
                    border: `1.5px solid ${
                      imeiError ? "var(--red, #ef4444)" : imeiValid ? "var(--green, #22c55e)" : "var(--border-strong)"
                    }`,
                    borderRadius: 10,
                    color: "var(--text)",
                    fontSize: 16,
                    fontFamily: "monospace",
                    letterSpacing: "0.1em",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.15s",
                  }}
                />
                <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>
                  {imeiValid && <CheckCircle size={18} color="var(--green, #22c55e)" />}
                  {imeiError && <AlertCircle size={18} color="var(--red, #ef4444)" />}
                </div>
              </div>
              {imeiError && (
                <p style={{ fontSize: 12, color: "var(--red, #ef4444)", marginTop: 6 }}>
                  {imeiError}
                </p>
              )}
              {imeiSuccess && (
                <p style={{ fontSize: 12, color: "var(--green, #22c55e)", marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                  <CheckCircle size={13} /> Ingreso registrado correctamente
                </p>
              )}
            </div>

            {/* Optional cost recording */}
            <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <button
                onClick={() => setShowCost((v) => !v)}
                style={{
                  width: "100%", padding: "10px 14px", textAlign: "left",
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 13, color: "var(--text-muted)", background: "none",
                }}
              >
                <ChevronDown size={14} style={{ transform: showCost ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
                Registrar costo de compra <span style={{ fontSize: 11, opacity: 0.6 }}>(opcional)</span>
              </button>
              {showCost && (
                <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>Precio pagado</p>
                    <input
                      type="number"
                      value={costAmount}
                      onChange={(e) => setCostAmount(e.target.value)}
                      placeholder="0"
                      style={{ width: "100%", padding: "8px 10px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 7, color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <div style={{ width: 90 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>Moneda</p>
                    <Select value={costCurrency} onChange={setCostCurrency} options={[{ value: "USD", label: "USD" }, { value: "ARS", label: "ARS" }]} />
                  </div>
                </div>
              )}
            </div>

            {/* Register button */}
            <button
              onClick={handleAddIMEI}
              disabled={!imeiValid || adding}
              style={{
                width: "100%",
                padding: "13px",
                background: "var(--primary)",
                color: "#fff",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                opacity: !imeiValid || adding ? 0.4 : 1,
                cursor: !imeiValid || adding ? "default" : "pointer",
                transition: "opacity 0.15s",
              }}
            >
              {adding ? "Registrando..." : "Registrar ingreso"}
            </button>

            {/* Session list */}
            {lastAdded.length > 0 && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Cargados en esta sesión ({lastAdded.length})
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {lastAdded.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "10px 12px",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
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
                      <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: "var(--text)", flex: 1 }}>
                        {item.imei}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {item.color} · {item.storage}
                      </span>
                      <button
                        onClick={() => handleRemoveSession(item.id)}
                        style={{ color: "var(--text-muted)", cursor: "pointer", background: "none", padding: 2 }}
                        title="Eliminar"
                      >
                        <XCircle size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Nav buttons */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  setStep("model");
                  setSelectedColor(null);
                  setSelectedColorHex(null);
                  setSelectedStorage(null);
                  setSelectedVariant(null);
                }}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                Cambiar modelo
              </button>
              <button
                onClick={resetAll}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                Nuevo ingreso
              </button>
              <button
                onClick={() => onViewStock ? onViewStock() : setActiveScreen("stock-list")}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "var(--primary)",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Ver stock
              </button>
            </div>
          </div>
        );
    }
  };

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* Fixed header */}
      <div
        style={{
          padding: "20px 28px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          {step !== "category" && (
            <button
              onClick={() => {
                if (step === "family") { setStep("category"); setSelectedFamily(null); }
                else if (step === "model") { setStep("family"); setSelectedModel(null); }
                else if (step === "variant") { setStep("model"); setSelectedColor(null); setSelectedStorage(null); }
                else if (step === "imei") { setStep("variant"); setSelectedVariant(null); }
              }}
              style={{ color: "var(--text-muted)", cursor: "pointer", background: "none", padding: 2, display: "flex", alignItems: "center" }}
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <Layers size={18} color="var(--primary)" />
          <h1 style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>
            {stepTitles[step]}
          </h1>
        </div>
        {renderBreadcrumb()}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
        {renderStep()}
      </div>
    </div>
  );
}
