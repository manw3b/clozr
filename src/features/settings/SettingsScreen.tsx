import { useState, useEffect, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsDb } from "../../lib/db/settings";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useAuthStore } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import Select from "../../components/ui/Select";
import ImageUpload from "../../components/ui/ImageUpload";
import { ExchangeRateChip } from "../../components/ExchangeRateChip";
import { PaymentMethodsSection } from "./PaymentMethodsSection";
import { CatalogPricingSection } from "./CatalogPricingSection";
import { FeaturedModelsSection } from "./FeaturedModelsSection";
import type { PipelineStage, CustomerTypeRow } from "../../lib/db/types";
// Paleta unificada — la misma que usa el kanban del pipeline para el
// color de cada etapa. Cualquier cambio acá se refleja allá.
import { PALETTE_LIST as COLORS, colorCss } from "../../lib/colorPalette";

// ── Shared ────────────────────────────────────────────────────────

type SectionId = "general" | "profile" | "pipeline" | "customer-types" | "payment-methods" | "catalog-pricing" | "catalog-featured" | "data";

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "general", label: "General" },
  { id: "profile", label: "Tu perfil" },
  { id: "pipeline", label: "Pipeline" },
  { id: "customer-types", label: "Tipos de cliente" },
  { id: "payment-methods", label: "Métodos de pago" },
  { id: "catalog-pricing", label: "Precios del catálogo" },
  { id: "catalog-featured", label: "Productos destacados" },
  { id: "data", label: "Datos y backup" },
];

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

        {/* Cotización USD → ARS */}
        <div style={{ marginTop: 16 }}>
          <ExchangeRateChip variant="full" />
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

  // PIN
  const [hasPin, setHasPin] = useState(false);
  const [showPinForm, setShowPinForm] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinSaving, setPinSaving] = useState(false);

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
    import("../../lib/db/auth").then(({ authDb }) => authDb.hasPin(userId).then(setHasPin));
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

  const handleSavePin = async () => {
    if (!userId) return;
    if (pinValue !== pinConfirm) {
      showToast("Los PINs no coinciden", "error");
      return;
    }
    setPinSaving(true);
    try {
      const { authDb } = await import("../../lib/db/auth");
      await authDb.setPin(userId, pinValue);
      setHasPin(true);
      setShowPinForm(false);
      setPinValue("");
      setPinConfirm("");
      showToast("PIN actualizado", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar PIN", "error");
    } finally {
      setPinSaving(false);
    }
  };

  const handleClearPin = async () => {
    if (!userId) return;
    if (!window.confirm("¿Quitar tu PIN? Cualquiera con acceso al equipo podrá entrar a tu sesión sin clave.")) return;
    try {
      const { authDb } = await import("../../lib/db/auth");
      await authDb.clearPin(userId);
      setHasPin(false);
      showToast("PIN eliminado", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "error");
    }
  };

  const pinValid = /^\d{4,6}$/.test(pinValue) && pinValue === pinConfirm;

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

      {/* PIN management */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--border)", maxWidth: 480 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>
          PIN de acceso
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "4px 0 16px" }}>
          {hasPin
            ? "Tu sesión está protegida con un PIN. Te lo van a pedir cada vez que inicies sesión."
            : "Sin PIN cualquiera con acceso al equipo puede entrar a tu sesión. Recomendado para owner/admin."}
        </p>

        {!showPinForm && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowPinForm(true)}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              {hasPin ? "Cambiar PIN" : "Crear PIN"}
            </button>
            {hasPin && (
              <button
                onClick={handleClearPin}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  background: "transparent",
                  color: "var(--danger)",
                  cursor: "pointer",
                }}
              >
                Quitar PIN
              </button>
            )}
          </div>
        )}

        {showPinForm && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={labelStyle}>PIN nuevo (4–6 dígitos)</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
                style={inputStyle}
                autoFocus
              />
            </div>
            <div>
              <label style={labelStyle}>Confirmar PIN</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
                style={inputStyle}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => {
                  setShowPinForm(false);
                  setPinValue("");
                  setPinConfirm("");
                }}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <SaveBtn onSave={pinValid ? handleSavePin : () => {}} saving={pinSaving} label="Guardar PIN" />
            </div>
          </div>
        )}
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
    const a = arr[idx];
    const b = arr[swap];
    if (!a || !b) return;
    arr[idx] = b;
    arr[swap] = a;
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
    const a = arr[idx];
    const b = arr[swap];
    if (!a || !b) return;
    arr[idx] = b;
    arr[swap] = a;
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


// ── Data section ──────────────────────────────────────────────────

function DataSection({ wid }: { wid: string }) {
  const { showToast } = useUIStore();
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backups, setBackups] = useState<import("../../lib/backup").BackupFile[]>([]);

  const refreshBackups = useCallback(async () => {
    try {
      const list = await (await import("../../lib/backup")).listBackups();
      setBackups(list);
    } catch {
      setBackups([]);
    }
  }, []);

  useEffect(() => { refreshBackups(); }, [refreshBackups]);

  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      const { createBackup, formatBytes } = await import("../../lib/backup");
      const b = await createBackup();
      showToast(`Backup creado · ${formatBytes(b.size)}`, "success");
      refreshBackups();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al crear backup");
    } finally {
      setCreating(false);
    }
  };

  const handleRestoreFromDialog = async () => {
    if (!confirm("⚠ Restaurar va a reemplazar TODA la data actual con la del backup elegido. Se hace un backup automático antes por seguridad. ¿Continuar?")) return;
    setRestoring(true);
    try {
      const { restoreFromDialog } = await import("../../lib/backup");
      const path = await restoreFromDialog();
      if (!path) {
        setRestoring(false);
        return;
      }
      // El restore relaunches automáticamente; nunca deberíamos llegar acá
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al restaurar");
      setRestoring(false);
    }
  };

  const handleRestoreFromList = async (path: string, name: string) => {
    if (!confirm(`⚠ Restaurar "${name}" va a reemplazar TODA la data actual. Se hace un backup automático antes. ¿Continuar?`)) return;
    setRestoring(true);
    try {
      const { restoreFromPath } = await import("../../lib/backup");
      await restoreFromPath(path);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al restaurar");
      setRestoring(false);
    }
  };

  const handleDeleteBackup = async (path: string, name: string) => {
    if (!confirm(`¿Eliminar "${name}"? Esta acción no se puede deshacer.`)) return;
    try {
      const { deleteBackup } = await import("../../lib/backup");
      await deleteBackup(path);
      showToast("Backup eliminado", "success");
      refreshBackups();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  const handleExportJson = async () => {
    setExporting(true);
    try {
      const json = await settingsDb.exportWorkspaceJson(wid);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clozr-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Export JSON descargado", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al exportar");
    } finally {
      setExporting(false);
    }
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
      <SectionHeader title="Datos y backup" description="Backup nativo de la base de datos · export legacy · limpieza" />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
        {/* Backup nativo */}
        <div style={{ padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
            Backup nativo de la base de datos
          </p>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
            Copia binaria del archivo SQLite (.db). Se guarda automáticamente 1 vez por día (mantiene los últimos 14).
            Restaurar reemplaza TODA la data actual y reinicia la app.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              onClick={handleCreateBackup}
              disabled={creating}
              style={{ padding: "8px 16px", background: "var(--primary)", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#fff", opacity: creating ? 0.6 : 1 }}
            >
              {creating ? "Creando…" : "Crear backup ahora"}
            </button>
            <button
              onClick={handleRestoreFromDialog}
              disabled={restoring}
              style={{ padding: "8px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: "var(--text)", opacity: restoring ? 0.6 : 1 }}
            >
              {restoring ? "Restaurando…" : "Restaurar desde archivo…"}
            </button>
          </div>

          {backups.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-dim)" }}>
              No hay backups todavía. Hacé click en “Crear backup ahora” o esperá al backup automático del día.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>
                {backups.length} backup{backups.length === 1 ? "" : "s"} guardado{backups.length === 1 ? "" : "s"}
              </p>
              {backups.slice(0, 14).map((b) => (
                <BackupRow
                  key={b.path}
                  backup={b}
                  onRestore={() => handleRestoreFromList(b.path, b.name)}
                  onDelete={() => handleDeleteBackup(b.path, b.name)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Export JSON (legacy) */}
        <div style={{ padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Export JSON (legacy)</p>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
            Snapshot parcial en JSON (clientes, pipeline, ventas, tareas, catálogo). Útil para compartir o auditar.
            Para backup completo usá el botón de arriba.
          </p>
          <button
            onClick={handleExportJson}
            disabled={exporting}
            style={{ padding: "8px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, color: "var(--text)", opacity: exporting ? 0.6 : 1 }}
          >
            {exporting ? "Exportando…" : "Descargar JSON"}
          </button>
        </div>

        {/* Clear test data — dev only */}
        {import.meta.env.DEV && (
          <div style={{ padding: 16, background: "rgba(232,0,29,0.05)", border: "1px solid rgba(232,0,29,0.2)", borderRadius: 10 }}>
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

function BackupRow({
  backup,
  onRestore,
  onDelete,
}: {
  backup: import("../../lib/backup").BackupFile;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const sizeKb = backup.size < 1024 * 1024 ? `${(backup.size / 1024).toFixed(0)} KB` : `${(backup.size / (1024 * 1024)).toFixed(1)} MB`;
  const date = new Date(backup.modifiedAt);
  const dateStr = date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto auto",
        gap: 8,
        padding: "8px 12px",
        background: "var(--surface-2)",
        borderRadius: 8,
        alignItems: "center",
        fontSize: 12,
      }}
    >
      <div>
        <div style={{ color: "var(--text)", fontWeight: 500, fontFamily: "monospace" }}>{backup.name}</div>
        <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 1 }}>{dateStr}</div>
      </div>
      <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{sizeKb}</span>
      <button
        onClick={onRestore}
        style={{ fontSize: 11, padding: "4px 10px", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }}
      >
        Restaurar
      </button>
      <button
        onClick={onDelete}
        title="Eliminar"
        style={{ fontSize: 11, padding: "4px 10px", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: "var(--danger)" }}
      >
        ✕
      </button>
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
      case "payment-methods": return <PaymentMethodsSection wid={wid} />;
      case "catalog-pricing": return <CatalogPricingSection wid={wid} />;
      case "catalog-featured": return <FeaturedModelsSection wid={wid} />;
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
