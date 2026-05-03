import { useEffect, useRef, useState } from "react";
import { Check, X, Pencil } from "lucide-react";
import { useExchangeRateStore } from "../store/exchangeRateStore";
import { useWorkspaceStore } from "../store/workspaceStore";
import { useAuthStore, canEditPricing } from "../store/authStore";
import { useUIStore } from "../store/uiStore";
import { color, radius, space, text, weight } from "../tokens";
import { formatMoney } from "../lib/format";

type Variant = "compact" | "full";

interface Props {
  /** compact = chip mini para el topbar; full = card completa para Settings */
  variant?: Variant;
}

/**
 * Chip de cotización USD → ARS. Compartido entre Topbar (compact) y
 * Ajustes → General (full). Lee/escribe del exchangeRateStore.
 *
 * Permisos: solo owner/admin pueden editar (canEditPricing). Vendedores ven
 * read-only.
 */
export function ExchangeRateChip({ variant = "compact" }: Props) {
  const { activeWorkspace } = useWorkspaceStore();
  const { usdToArs, lastUpdated, setRate } = useExchangeRateStore();
  const role = useAuthStore((s) => s.userRole);
  const { showToast } = useUIStore();
  const allowed = canEditPricing(role);
  const wid = activeWorkspace?.id ?? "";

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(usdToArs || ""));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      setDraft(String(usdToArs || ""));
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, usdToArs]);

  async function commit() {
    const n = parseFloat(draft);
    if (!Number.isFinite(n) || n <= 0) {
      showToast("Cotización inválida", "error");
      return;
    }
    if (!wid) {
      showToast("Sin workspace activo", "error");
      return;
    }
    setSaving(true);
    try {
      await setRate(wid, n);
      showToast(`Cotización actualizada: ${formatMoney(n, "ARS")} = US$ 1`, "success");
      setEditing(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(String(usdToArs || ""));
    setEditing(false);
  }

  const lastUpdatedText = lastUpdated
    ? `Actualizado: ${formatRelative(lastUpdated)}`
    : "Cotización no cargada";

  // ─── COMPACT (Topbar) ───────────────────────────────────────
  if (variant === "compact") {
    if (!editing) {
      return (
        <button
          onClick={() => allowed && setEditing(true)}
          disabled={!allowed}
          title={allowed ? `Click para editar · ${lastUpdatedText}` : lastUpdatedText}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: space[2],
            padding: `4px ${space[3]}`,
            background: color.surface2,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
            cursor: allowed ? "pointer" : "default",
            fontSize: text.xs,
            color: color.text,
            transition: "all 100ms",
          }}
          onMouseEnter={(e) => {
            if (allowed) e.currentTarget.style.borderColor = color.primary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = color.border;
          }}
        >
          <span style={{ color: color.textMuted, fontWeight: weight.medium }}>USD</span>
          <span style={{ color: color.textDim }}>→</span>
          <span style={{ fontWeight: weight.bold, fontVariantNumeric: "tabular-nums" }}>
            {usdToArs ? formatMoney(usdToArs, "ARS") : "—"}
          </span>
          {allowed && <Pencil size={11} color={color.textMuted} />}
        </button>
      );
    }
    // editing
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: space[1],
          padding: `2px ${space[2]}`,
          background: color.surface2,
          border: `1px solid ${color.primary}`,
          borderRadius: radius.md,
        }}
      >
        <span style={{ fontSize: text.xs, color: color.textMuted }}>USD →</span>
        <input
          ref={inputRef}
          type="number"
          step="any"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          disabled={saving}
          style={{
            width: 80,
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: radius.sm,
            padding: "2px 6px",
            fontSize: text.xs,
            fontWeight: weight.bold,
            color: color.text,
            fontVariantNumeric: "tabular-nums",
          }}
        />
        <button
          onClick={commit}
          disabled={saving}
          aria-label="Guardar"
          style={iconBtnStyle}
        >
          <Check size={12} color={color.success} />
        </button>
        <button onClick={cancel} aria-label="Cancelar" style={iconBtnStyle}>
          <X size={12} color={color.textMuted} />
        </button>
      </div>
    );
  }

  // ─── FULL (Settings) ────────────────────────────────────────
  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        padding: space[4],
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: space[3],
        }}
      >
        <div>
          <div
            style={{
              fontSize: text.xs,
              fontWeight: weight.semibold,
              color: color.textDim,
              textTransform: "uppercase",
              letterSpacing: "0.6px",
              marginBottom: space[1],
            }}
          >
            Cotización USD → ARS
          </div>
          <div style={{ fontSize: text.sm, color: color.textMuted, marginBottom: space[3] }}>
            Valor de 1 dólar en pesos. Se usa para convertir precios USD del catálogo al equivalente
            en ARS al vender.
          </div>
          {!editing ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: space[3] }}>
              <span
                style={{
                  fontSize: text["2xl"] ?? text.xl,
                  fontWeight: weight.bold,
                  color: color.text,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {usdToArs ? formatMoney(usdToArs, "ARS") : "—"}
              </span>
              <span style={{ fontSize: text.xs, color: color.textDim }}>= US$ 1</span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: space[2] }}>
              <span
                style={{
                  fontSize: text.lg,
                  fontWeight: weight.bold,
                  color: color.text,
                }}
              >
                $
              </span>
              <input
                ref={inputRef}
                type="number"
                step="any"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") cancel();
                }}
                disabled={saving}
                style={{
                  width: 160,
                  background: color.surface2,
                  border: `1px solid ${color.primary}`,
                  borderRadius: radius.sm,
                  padding: "8px 12px",
                  fontSize: text.lg,
                  fontWeight: weight.bold,
                  color: color.text,
                  fontVariantNumeric: "tabular-nums",
                }}
              />
              <span style={{ fontSize: text.sm, color: color.textDim }}>= US$ 1</span>
            </div>
          )}
          <div
            style={{
              fontSize: text.xs,
              color: color.textMuted,
              marginTop: space[2],
            }}
          >
            {lastUpdatedText}
          </div>
        </div>
        {allowed && (
          <div style={{ display: "flex", gap: space[2] }}>
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: space[1],
                  padding: `${space[2]} ${space[3]}`,
                  background: color.surface2,
                  border: `1px solid ${color.border}`,
                  borderRadius: radius.sm,
                  color: color.text,
                  fontSize: text.sm,
                  cursor: "pointer",
                }}
              >
                <Pencil size={12} /> Editar
              </button>
            ) : (
              <>
                <button
                  onClick={cancel}
                  disabled={saving}
                  style={{
                    padding: `${space[2]} ${space[3]}`,
                    background: "transparent",
                    border: `1px solid ${color.border}`,
                    borderRadius: radius.sm,
                    color: color.text,
                    fontSize: text.sm,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={commit}
                  disabled={saving}
                  style={{
                    padding: `${space[2]} ${space[3]}`,
                    background: color.primary,
                    border: "none",
                    borderRadius: radius.sm,
                    color: "#fff",
                    fontSize: text.sm,
                    fontWeight: weight.semibold,
                    cursor: "pointer",
                  }}
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: radius.sm,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "hace instantes";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}
