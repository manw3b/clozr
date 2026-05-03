import { useState, useEffect, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsDb } from "../../lib/db/settings";
import { catalogFieldsDb } from "../../lib/db/catalog_fields";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useAuthStore } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import Select from "../../components/ui/Select";
import ImageUpload from "../../components/ui/ImageUpload";
import { PaymentMethodsSection } from "./PaymentMethodsSection";
import type {
  PipelineStage, CustomerTypeRow, CatalogCategoryRow,
  CatalogFieldTemplate, CatalogFieldType,
} from "../../lib/db/types";

// ── Shared ────────────────────────────────────────────────────────

type SectionId = "general" | "profile" | "pipeline" | "customer-types" | "payment-methods" | "catalog" | "data";

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "general", label: "General" },
  { id: "profile", label: "Tu perfil" },
  { id: "pipeline", label: "Pipeline" },
  { id: "customer-types", label: "Tipos de cliente" },
  { id: "payment-methods", label: "Métodos de pago" },
  { id: "catalog", label: "Catálogo" },
  { id: "data", label: "Datos y backup" },
];

const COLORS = [
  { id: "gray", css: "#636366" },
  { id: "blue", css: "#0A84FF" },
  { id: "green", css: "#30D158" },
  { id: "amber", css: "#FFD60A" },
  { id: "red", css: "#E8001D" },
  { id: "purple", css: "#BF5AF2" },
];

function colorCss(color: string) {
  return COLORS.find((c) => c.id === color)?.css ?? "#636366";
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", letterSpacing: -0.2 }}>{title}</h2>
      {description && (
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>{description}</p>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  background: "var(--surface-2)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-muted)",
  marginBottom: 6,
  display: "block",
};

function SaveBtn({ onSave, saving, label = "Guardar" }: { onSave: () => void; saving: boolean; label?: string }) {
  return (
    <button
      onClick={onSave}
      disabled={saving}
      style={{
        padding: "8px 18px", background: "var(--primary)", borderRadius: 8,
        fontSize: 13, fontWeight: 600, color: "#fff", opacity: saving ? 0.6 : 1,
      }}
    >
      {saving ? "Guardando..." : label}
    </button>
  );
}

// ── General section ───────────────────────────────────────────────

function GeneralSection({ wid }: { wid: string }) {
  const { activeWorkspace, updateWorkspace } = useWorkspaceStore();
  const { showToast } = useUIStore();
  const [name, setName] = useState(activeWorkspace?.name ?? "");
  const [emoji, setEmoji] = useState(activeWorkspace?.emoji ?? "🏪");
  const [color, setColor] = useState(activeWorkspace?.color ?? "#E8001D");
  const [logoPath, setLogoPath] = useState<string | null>(activeWorkspace?.logo_path ?? null);
  const [dailyGoal, setDailyGoal] = useState(String(activeWorkspace?.daily_goal ?? ""));
  const [dailyGoalCurrency, setDailyGoalCurrency] = useState(activeWorkspace?.daily_goal_currency ?? "USD");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (activeWorkspace) {
      setName(activeWorkspace.name);
      setEmoji(activeWorkspace.emoji);
      setColor(activeWorkspace.color);
      setLogoPath(activeWorkspace.logo_path ?? null);
      setDailyGoal(activeWorkspace.daily_goal ? String(activeWorkspace.daily_goal) : "");
      setDailyGoalCurrency(activeWorkspace.daily_goal_currency ?? "USD");
    }
  }, [activeWorkspace]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const goal = dailyGoal ? parseFloat(dailyGoal) : 0;
      await settingsDb.updateWorkspace(wid, {
        name: name.trim(),
        emoji: emoji.trim() || "🏪",
        color,
        logo_path: logoPath,
        daily_goal: goal,
        daily_goal_currency: dailyGoalCurrency,
      });
      updateWorkspace({
        ...activeWorkspace!,
        name: name.trim(),
        emoji: emoji.trim() || "🏪",
        color,
        logo_path: logoPath,
        daily_goal: goal,
        daily_goal_currency: dailyGoalCurrency,
      });
      showToast("Cambios guardados", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionHeader title="General" description="Personalización del negocio" />
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 480 }}>
        {/* Logo */}
        <div>
          <label style={labelStyle}>Logo del negocio</label>
          <ImageUpload
            category="workspaces"
            entityId={wid}
            currentPath={logoPath}
            onImageSelected={setLogoPath}
            onImageRemoved={() => setLogoPath(null)}
            size="lg"
            shape="square"
            placeholder={emoji || "🏪"}
          />
        </div>

        <div>
          <label style={labelStyle}>Nombre del negocio *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi negocio" style={inputStyle} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Emoji</label>
            <input
              value={emoji}
              onChange={(e) => {
                const chars = [...e.target.value];
                setEmoji(chars[chars.length - 1] ?? "");
              }}
              placeholder="🏪"
              maxLength={4}
              style={{ ...inputStyle, textAlign: "center", fontSize: 20 }}
            />
          </div>
          <div>
            <label style={labelStyle}>Color principal</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                style={{ width: 40, height: 38, borderRadius: 6, border: "1px solid var(--border-strong)", cursor: "pointer", background: "none", padding: 2 }}
              />
              <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#E8001D"
                style={{ ...inputStyle, width: 120, fontFamily: "monospace", fontSize: 12 }}
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div style={{ marginTop: 4 }}>
          <label style={labelStyle}>Preview sidebar</label>
          <div style={{
            display: "inline-flex", flexDirection: "column",
            padding: "14px 16px", background: "var(--surface)",
            border: "1px solid var(--border)", borderRadius: 10,
            gap: 6, minWidth: 160,
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -1, color: "var(--text)" }}>
              Clozr<span style={{ color }}>.</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
              {emoji || "🏪"} {name || "Mi negocio"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <div style={{ width: 20, height: 20, borderRadius: 5, background: color }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>Inicio</span>
            </div>
          </div>
        </div>

        {/* Daily goal */}
        <div>
          <label style={labelStyle}>Objetivo diario de ventas</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 10 }}>
            <input
              type="number"
              min={0}
              value={dailyGoal}
              onChange={(e) => setDailyGoal(e.target.value)}
              placeholder="Ej: 2000"
              style={inputStyle}
            />
            <Select
              value={dailyGoalCurrency}
              onChange={setDailyGoalCurrency}
              options={[{ value: "USD", label: "USD" }, { value: "ARS", label: "ARS" }]}
            />
          </div>
          <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 5 }}>
            Se muestra como barra de progreso en Mi Día
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <SaveBtn onSave={handleSave} saving={saving} />
        </div>
      </div>
    </div>
  );
}

// ── Profile section ───────────────────────────────────────────────

function ProfileSection() {
  const { userId, userName, setUser } = useAuthStore();
  const { showToast } = useUIStore();
  const [name, setName] = useState(userName ?? "");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    import("../../lib/db/index").then(({ dbSelect }) =>
      dbSelect<{ name: string; email: string }>("SELECT name, email FROM users WHERE id = ?", [userId])
        .then((rows) => {
          if (rows[0]) {
            setName(rows[0].name);
            setEmail(rows[0].email);
          }
        }),
    );
  }, [userId]);

  const handleSave = async () => {
    if (!name.trim() || !userId) return;
    setSaving(true);
    try {
      await settingsDb.updateUser(userId, { name: name.trim(), email: email.trim() });
      setUser(userId, name.trim());
      showToast("Perfil actualizado", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionHeader title="Tu perfil" description="Tus datos personales en este workspace" />
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 480 }}>
        <div>
          <label style={labelStyle}>Nombre *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <SaveBtn onSave={handleSave} saving={saving} />
        </div>
      </div>
    </div>
  );
}

// ── Pipeline stages section ───────────────────────────────────────

function PipelineSection({ wid }: { wid: string }) {
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: dbStages = [] } = useQuery({
    queryKey: ["pipeline-stages", wid],
    queryFn: () => settingsDb.getPipelineStages(wid),
    enabled: !!wid,
  });

  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setStages(dbStages);
    setIsDirty(false);
  }, [dbStages]);

  const update = (updated: PipelineStage[]) => { setStages(updated); setIsDirty(true); };

  const handleRename = (id: string, name: string) =>
    update(stages.map((s) => (s.id === id ? { ...s, name } : s)));

  const handleColor = (id: string, color: string) => {
    update(stages.map((s) => (s.id === id ? { ...s, color } : s)));
    setColorPickerId(null);
  };

  const handleMove = (idx: number, dir: -1 | 1) => {
    const arr = [...stages];
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    update(arr.map((s, i) => ({ ...s, stage_order: i })));
  };

  const handleDelete = (id: string) =>
    update(stages.filter((s) => s.id !== id).map((s, i) => ({ ...s, stage_order: i })));

  const handleAdd = () =>
    update([
      ...stages,
      {
        id: crypto.randomUUID(),
        workspace_id: wid,
        name: "Nueva etapa",
        stage_order: stages.length,
        color: "gray",
        is_won: 0,
        is_lost: 0,
        created_at: new Date().toISOString(),
      },
    ]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsDb.savePipelineStages(wid, stages);
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "pipeline-stages" });
      setIsDirty(false);
      showToast("Etapas guardadas", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <SectionHeader title="Etapas del pipeline" description="Define y ordena las etapas de tu proceso de ventas" />
        {isDirty && <SaveBtn onSave={handleSave} saving={saving} label="Guardar cambios" />}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 560 }}>
        {stages.map((stage, idx) => (
          <div key={stage.id} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 12px", background: "var(--surface)",
            border: "1px solid var(--border)", borderRadius: 8,
          }}>
            {/* Order buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
              <button onClick={() => handleMove(idx, -1)} disabled={idx === 0}
                style={{ fontSize: 11, lineHeight: 1, padding: "2px 5px", color: idx === 0 ? "var(--text-dim)" : "var(--text-muted)", borderRadius: 3 }}>
                ↑
              </button>
              <button onClick={() => handleMove(idx, 1)} disabled={idx === stages.length - 1}
                style={{ fontSize: 11, lineHeight: 1, padding: "2px 5px", color: idx === stages.length - 1 ? "var(--text-dim)" : "var(--text-muted)", borderRadius: 3 }}>
                ↓
              </button>
            </div>

            {/* Color picker */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                onClick={() => setColorPickerId(colorPickerId === stage.id ? null : stage.id)}
                title="Cambiar color"
                style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: colorCss(stage.color),
                  border: "2px solid rgba(255,255,255,0.15)",
                }}
              />
              {colorPickerId === stage.id && (
                <div style={{
                  position: "absolute", top: 24, left: 0, zIndex: 20,
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: 8, padding: 8, display: "flex", gap: 6,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                }}>
                  {COLORS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleColor(stage.id, c.id)}
                      style={{
                        width: 20, height: 20, borderRadius: "50%", background: c.css,
                        border: `2px solid ${stage.color === c.id ? "#fff" : "transparent"}`,
                        transition: "border 0.1s",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Name */}
            <input
              value={stage.name}
              onChange={(e) => handleRename(stage.id, e.target.value)}
              style={{
                flex: 1, padding: "5px 8px",
                background: "var(--surface-2)", border: "1px solid var(--border-strong)",
                borderRadius: 6, color: "var(--text)", fontSize: 13, outline: "none",
              }}
            />

            {/* Won/lost badge */}
            {(stage.is_won === 1 || stage.is_lost === 1) && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, flexShrink: 0,
                background: stage.is_won ? "rgba(48,209,88,0.15)" : "rgba(232,0,29,0.15)",
                color: stage.is_won ? "var(--success)" : "var(--primary)",
              }}>
                {stage.is_won ? "Ganado" : "Perdido"}
              </span>
            )}

            {/* Delete */}
            <button
              onClick={() => handleDelete(stage.id)}
              title="Eliminar etapa"
              style={{
                width: 24, height: 24, borderRadius: 5, display: "flex",
                alignItems: "center", justifyContent: "center",
                color: "var(--text-dim)", flexShrink: 0,
              }}
            >
              <X size={13} />
            </button>
          </div>
        ))}

        <button
          onClick={handleAdd}
          style={{
            marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "8px 12px", background: "var(--surface)",
            border: "1px dashed var(--border)", borderRadius: 8,
            fontSize: 13, color: "var(--text-muted)",
          }}
        >
          <Plus size={13} />
          Agregar etapa
        </button>
      </div>
    </div>
  );
}

// ── Customer types section ────────────────────────────────────────

function CustomerTypesSection({ wid }: { wid: string }) {
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: dbTypes = [] } = useQuery({
    queryKey: ["customer-types", wid],
    queryFn: () => settingsDb.getCustomerTypes(wid),
    enabled: !!wid,
  });

  const [types, setTypes] = useState<CustomerTypeRow[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => { setTypes(dbTypes); setIsDirty(false); }, [dbTypes]);

  const update = (updated: CustomerTypeRow[]) => { setTypes(updated); setIsDirty(true); };

  const handleMove = (idx: number, dir: -1 | 1) => {
    const arr = [...types];
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    update(arr.map((t, i) => ({ ...t, sort_order: i })));
  };

  const handleDelete = (id: string) =>
    update(types.filter((t) => t.id !== id).map((t, i) => ({ ...t, sort_order: i })));

  const handleAdd = () =>
    update([
      ...types,
      { id: crypto.randomUUID(), workspace_id: wid, name: "Nuevo tipo", description: null, color: "blue", sort_order: types.length },
    ]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsDb.saveCustomerTypes(wid, types);
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "customer-types" });
      setIsDirty(false);
      showToast("Tipos guardados", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <SectionHeader title="Tipos de cliente" description="Define las categorías de clientes de tu negocio" />
        {isDirty && <SaveBtn onSave={handleSave} saving={saving} label="Guardar cambios" />}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 560 }}>
        {types.map((t, idx) => (
          <div key={t.id} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 12px", background: "var(--surface)",
            border: "1px solid var(--border)", borderRadius: 8,
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
              <button onClick={() => handleMove(idx, -1)} disabled={idx === 0}
                style={{ fontSize: 11, padding: "2px 5px", color: idx === 0 ? "var(--text-dim)" : "var(--text-muted)", borderRadius: 3 }}>↑</button>
              <button onClick={() => handleMove(idx, 1)} disabled={idx === types.length - 1}
                style={{ fontSize: 11, padding: "2px 5px", color: idx === types.length - 1 ? "var(--text-dim)" : "var(--text-muted)", borderRadius: 3 }}>↓</button>
            </div>

            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                onClick={() => setColorPickerId(colorPickerId === t.id ? null : t.id)}
                style={{ width: 18, height: 18, borderRadius: "50%", background: colorCss(t.color), border: "2px solid rgba(255,255,255,0.15)" }}
              />
              {colorPickerId === t.id && (
                <div style={{ position: "absolute", top: 24, left: 0, zIndex: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 8, display: "flex", gap: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                  {COLORS.map((c) => (
                    <button key={c.id} onClick={() => { update(types.map((x) => x.id === t.id ? { ...x, color: c.id } : x)); setColorPickerId(null); }}
                      style={{ width: 20, height: 20, borderRadius: "50%", background: c.css, border: `2px solid ${t.color === c.id ? "#fff" : "transparent"}` }}
                    />
                  ))}
                </div>
              )}
            </div>

            <input value={t.name} onChange={(e) => update(types.map((x) => x.id === t.id ? { ...x, name: e.target.value } : x))}
              style={{ flex: 1, padding: "5px 8px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 6, color: "var(--text)", fontSize: 13, outline: "none" }}
            />
            <input value={t.description ?? ""} onChange={(e) => update(types.map((x) => x.id === t.id ? { ...x, description: e.target.value || null } : x))}
              placeholder="Descripción (opcional)"
              style={{ flex: 1, padding: "5px 8px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 6, color: "var(--text-muted)", fontSize: 12, outline: "none" }}
            />

            <button onClick={() => handleDelete(t.id)} style={{ width: 24, height: 24, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", flexShrink: 0 }}>
              <X size={13} />
            </button>
          </div>
        ))}

        <button onClick={handleAdd} style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 12px", background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 8, fontSize: 13, color: "var(--text-muted)" }}>
          <Plus size={13} />
          Agregar tipo
        </button>
      </div>
    </div>
  );
}

// ── Catalog categories section ─────────────────────────────────────

const FIELD_TYPE_OPTIONS: Array<{ value: CatalogFieldType; label: string }> = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "imei", label: "IMEI" },
  { value: "select", label: "Selección" },
  { value: "date", label: "Fecha" },
];

function CatalogSection({ wid }: { wid: string }) {
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: dbCats = [] } = useQuery({
    queryKey: ["catalog-categories", wid],
    queryFn: () => settingsDb.getCatalogCategories(wid),
    enabled: !!wid,
  });

  const [cats, setCats] = useState<CatalogCategoryRow[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => { setCats(dbCats); setIsDirty(false); }, [dbCats]);

  const update = useCallback((updated: CatalogCategoryRow[]) => { setCats(updated); setIsDirty(true); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsDb.saveCatalogCategories(wid, cats);
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "catalog-categories" });
      setIsDirty(false);
      showToast("Categorías guardadas", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  // Custom field templates
  const { data: allTemplates = [] } = useQuery({
    queryKey: ["catalog-field-templates", wid],
    queryFn: () => catalogFieldsDb.getTemplates(wid),
    enabled: !!wid,
  });

  const [templates, setTemplates] = useState<CatalogFieldTemplate[]>([]);
  const [templatesDirty, setTemplatesDirty] = useState(false);
  const [savingTemplates, setSavingTemplates] = useState(false);

  useEffect(() => { setTemplates(allTemplates); setTemplatesDirty(false); }, [allTemplates]);

  const updateTemplate = useCallback((updated: CatalogFieldTemplate[]) => {
    setTemplates(updated); setTemplatesDirty(true);
  }, []);

  const handleSaveTemplates = async () => {
    setSavingTemplates(true);
    try {
      await catalogFieldsDb.saveTemplates(wid, templates);
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "catalog-field-templates" });
      setTemplatesDirty(false);
      showToast("Campos guardados", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingTemplates(false);
    }
  };

  const addTemplate = () => {
    updateTemplate([
      ...templates,
      {
        id: crypto.randomUUID(),
        workspace_id: wid,
        category: cats[0]?.name ?? null,
        field_key: `campo_${templates.length + 1}`,
        field_label: "Nuevo campo",
        field_type: "text",
        options_json: null,
        required: 0,
        sort_order: templates.length,
      },
    ]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {/* Categories */}
      <div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <SectionHeader title="Categorías de catálogo" description="Categorías predefinidas para tus productos" />
          {isDirty && <SaveBtn onSave={handleSave} saving={saving} label="Guardar cambios" />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 400 }}>
          {cats.map((cat, idx) => (
            <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-dim)", width: 20, textAlign: "right", flexShrink: 0 }}>{idx + 1}</span>
              <input
                value={cat.name}
                onChange={(e) => update(cats.map((c) => c.id === cat.id ? { ...c, name: e.target.value } : c))}
                style={{ flex: 1, padding: "5px 8px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 6, color: "var(--text)", fontSize: 13, outline: "none" }}
              />
              <button onClick={() => update(cats.filter((c) => c.id !== cat.id).map((c, i) => ({ ...c, sort_order: i })))}
                style={{ width: 24, height: 24, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", flexShrink: 0 }}>
                <X size={13} />
              </button>
            </div>
          ))}
          <button
            onClick={() => update([...cats, { id: crypto.randomUUID(), workspace_id: wid, name: "Nueva categoría", sort_order: cats.length }])}
            style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 12px", background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 8, fontSize: 13, color: "var(--text-muted)" }}
          >
            <Plus size={13} />
            Agregar categoría
          </button>
        </div>
      </div>

      {/* Custom field templates */}
      <div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <SectionHeader
            title="Campos por categoría"
            description="Campos personalizados que aparecen al crear productos según su categoría"
          />
          {templatesDirty && (
            <SaveBtn onSave={handleSaveTemplates} saving={savingTemplates} label="Guardar campos" />
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 680 }}>
          {templates.map((t) => (
            <div
              key={t.id}
              style={{ display: "grid", gridTemplateColumns: "140px 1fr 110px 90px auto", gap: 8, alignItems: "center", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}
            >
              {/* Category */}
              <Select
                value={t.category ?? ""}
                onChange={(v) => updateTemplate(templates.map((x) => x.id === t.id ? { ...x, category: v || null } : x))}
                options={[
                  { value: "", label: "Todas" },
                  ...cats.map((c) => ({ value: c.name, label: c.name })),
                ]}
              />
              {/* Label */}
              <input
                value={t.field_label}
                onChange={(e) => updateTemplate(templates.map((x) => x.id === t.id ? { ...x, field_label: e.target.value, field_key: e.target.value.toLowerCase().replace(/\s+/g, "_") } : x))}
                placeholder="Etiqueta del campo"
                style={{ padding: "7px 10px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 6, color: "var(--text)", fontSize: 13, outline: "none" }}
              />
              {/* Type */}
              <Select
                value={t.field_type}
                onChange={(v) => updateTemplate(templates.map((x) => x.id === t.id ? { ...x, field_type: v as CatalogFieldType } : x))}
                options={FIELD_TYPE_OPTIONS}
              />
              {/* Options (for select type) */}
              {t.field_type === "select" ? (
                <input
                  value={t.options_json ? JSON.parse(t.options_json).join(", ") : ""}
                  onChange={(e) => {
                    const opts = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                    updateTemplate(templates.map((x) => x.id === t.id ? { ...x, options_json: JSON.stringify(opts) } : x));
                  }}
                  placeholder="op1, op2..."
                  title="Opciones separadas por coma"
                  style={{ padding: "7px 10px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 6, color: "var(--text)", fontSize: 11, outline: "none" }}
                />
              ) : (
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={t.required === 1}
                    onChange={(e) => updateTemplate(templates.map((x) => x.id === t.id ? { ...x, required: e.target.checked ? 1 : 0 } : x))}
                    style={{ accentColor: "var(--primary)" }}
                  />
                  Requerido
                </label>
              )}
              {/* Delete */}
              <button
                onClick={() => updateTemplate(templates.filter((x) => x.id !== t.id))}
                style={{ width: 24, height: 24, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)" }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <button
            onClick={addTemplate}
            style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 12px", background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 8, fontSize: 13, color: "var(--text-muted)" }}
          >
            <Plus size={13} />
            Agregar campo
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Data section ──────────────────────────────────────────────────

function DataSection({ wid }: { wid: string }) {
  const { showToast } = useUIStore();
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const json = await settingsDb.exportWorkspaceJson(wid);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clozr-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Backup exportado", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al exportar");
    } finally {
      setExporting(false);
    }
  };

  const handleShowPath = () => {
    showToast("Base de datos: ~/.local/share/com.clozr.dev/clozr.db (Linux) · ~/Library/Application Support/com.clozr.dev/clozr.db (Mac)", "info");
  };

  const handleClear = async () => {
    if (!confirm("¿Eliminar todos los registros de prueba? Esta acción no se puede deshacer.")) return;
    setClearing(true);
    try {
      const deleted = await settingsDb.clearTestData(wid);
      showToast(`${deleted} registro${deleted !== 1 ? "s" : ""} eliminado${deleted !== 1 ? "s" : ""}`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al limpiar");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div>
      <SectionHeader title="Datos y backup" description="Exportá o gestioná los datos de tu workspace" />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
        {/* Export */}
        <div style={{ padding: "16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Exportar todo como JSON</p>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
            Incluye clientes, pipeline, ventas, tareas y catálogo
          </p>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              padding: "8px 16px", background: "var(--primary)", borderRadius: 8,
              fontSize: 13, fontWeight: 600, color: "#fff", opacity: exporting ? 0.6 : 1,
            }}
          >
            {exporting ? "Exportando..." : "Descargar backup"}
          </button>
        </div>

        {/* DB path */}
        <div style={{ padding: "16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Ubicación de la base de datos</p>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
            Archivo SQLite local donde se guardan todos tus datos
          </p>
          <button
            onClick={handleShowPath}
            style={{ padding: "8px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: "var(--text-muted)" }}
          >
            Ver ubicación
          </button>
        </div>

        {/* Clear test data */}
        {import.meta.env.DEV && (
          <div style={{ padding: "16px", background: "rgba(232,0,29,0.05)", border: "1px solid rgba(232,0,29,0.2)", borderRadius: 10 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--primary)", marginBottom: 4 }}>Limpiar datos de prueba</p>
            <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
              Elimina registros con IDs: cust-, pipe-, task-, sale-, cat- · Solo visible en dev
            </p>
            <button
              onClick={handleClear}
              disabled={clearing}
              style={{ padding: "8px 16px", background: "var(--primary)", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#fff", opacity: clearing ? 0.6 : 1 }}
            >
              {clearing ? "Limpiando..." : "Limpiar datos de prueba"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────

export default function SettingsScreen() {
  const { activeWorkspace } = useWorkspaceStore();
  const [activeSection, setActiveSection] = useState<SectionId>("general");
  const wid = activeWorkspace?.id ?? "";

  const renderSection = () => {
    switch (activeSection) {
      case "general": return <GeneralSection wid={wid} />;
      case "profile": return <ProfileSection />;
      case "pipeline": return <PipelineSection wid={wid} />;
      case "customer-types": return <CustomerTypesSection wid={wid} />;
      case "catalog": return <CatalogSection wid={wid} />;
      case "payment-methods": return <PaymentMethodsSection wid={wid} />;
      case "data": return <DataSection wid={wid} />;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", gap: "var(--space-5)" }}>
      <h1 style={{
        margin: 0,
        fontSize: "var(--text-2xl)",
        fontWeight: 700,
        color: "var(--text)",
        letterSpacing: "-0.5px",
      }}>
        Ajustes
      </h1>

      {/* Two-column layout */}
      <div style={{
        display: "flex",
        flex: 1,
        overflow: "hidden",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-xl)",
      }}>
        {/* Left nav */}
        <nav style={{
          width: 200, flexShrink: 0,
          borderRight: "1px solid var(--border)",
          padding: "var(--space-3)",
          display: "flex", flexDirection: "column", gap: 2,
          overflowY: "auto",
        }}>
          {SECTIONS.map((s) => {
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                style={{
                  width: "100%", textAlign: "left",
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--text-sm)",
                  fontWeight: active ? 600 : 500,
                  color: active ? "var(--primary)" : "var(--text-muted)",
                  background: active ? "var(--primary-bg)" : "transparent",
                  transition: "background 100ms, color 100ms",
                  position: "relative",
                }}
              >
                {active && (
                  <span style={{
                    position: "absolute",
                    left: -3,
                    top: 6,
                    bottom: 6,
                    width: 3,
                    background: "var(--primary)",
                    borderRadius: "var(--radius-full)",
                  }} />
                )}
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Right content */}
        <div style={{ flex: 1, overflow: "auto", padding: "var(--space-6) var(--space-8)" }}>
          {renderSection()}
        </div>
      </div>
    </div>
  );
}
