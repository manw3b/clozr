import { useEffect, useRef, useState } from "react";
import { Check, X, Pencil, ChevronDown, RefreshCw, CheckCircle2 } from "lucide-react";
import { useExchangeRateStore } from "../store/exchangeRateStore";
import { useWorkspaceStore } from "../store/workspaceStore";
import { useAuthStore, canEditPricing, assertCan } from "../store/authStore";
import { useUIStore } from "../store/uiStore";
import { color, radius, space, text, weight } from "../tokens";
import { formatMoney } from "../lib/format";
import {
  useDolaresAr,
  useActiveDolarKind,
  useDolaresLastFetched,
} from "../store/useDolaresAr";
import { DOLAR_KIND_LABELS } from "../lib/dolaresAr";

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
      assertCan(role, "manageExchangeRate");
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
    if (editing) {
      // Modo edit manual — fallback cuando la API está caída o el dueño
      // quiere forzar un valor distinto al de cualquier tipo.
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
          <button onClick={commit} disabled={saving} aria-label="Guardar" style={iconBtnStyle}>
            <Check size={12} color={color.success} />
          </button>
          <button onClick={cancel} aria-label="Cancelar" style={iconBtnStyle}>
            <X size={12} color={color.textMuted} />
          </button>
        </div>
      );
    }
    return (
      <DolaresPopoverChip
        usdToArs={usdToArs}
        allowed={allowed}
        onManualEdit={() => setEditing(true)}
      />
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

/**
 * Chip compacto del topbar con popover que muestra TODOS los tipos de
 * dólar (oficial, blue, cripto, etc.) y permite cambiar el activo con
 * un click. El activo es el que se usa para conversiones USD↔ARS en la
 * app entera — al cambiarlo, el usdToArs del store legacy se actualiza
 * automáticamente vía useSyncActiveDolarToExchangeRate.
 */
function DolaresPopoverChip({
  usdToArs,
  allowed,
  onManualEdit,
}: {
  usdToArs: number;
  allowed: boolean;
  onManualEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { data: rates = [], isFetching, refetch } = useDolaresAr();
  const { activeKind, setActiveKind } = useActiveDolarKind();
  const { data: lastFetched } = useDolaresLastFetched();

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeRate = rates.find((r) => r.kind === activeKind);
  const activeLabel = activeRate
    ? DOLAR_KIND_LABELS[activeRate.kind] ?? activeRate.nombre
    : "USD";

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={`${activeLabel} · ${lastFetched ? `Actualizado ${formatRelative(lastFetched)}` : "Sin actualizar"}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: space[2],
          padding: `4px ${space[3]}`,
          background: open ? color.surfaceHover : color.surface2,
          border: `1px solid ${open ? color.primary : color.border}`,
          borderRadius: radius.md,
          cursor: "pointer",
          fontSize: text.xs,
          color: color.text,
          transition: "all 120ms",
        }}
      >
        <span style={{ color: color.textMuted, fontWeight: weight.medium, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {activeLabel}
        </span>
        <span style={{ color: color.textDim }}>→</span>
        <span style={{ fontWeight: weight.bold, fontVariantNumeric: "tabular-nums" }}>
          {usdToArs ? formatMoney(usdToArs, "ARS") : "—"}
        </span>
        <ChevronDown size={11} color={color.textMuted} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 150ms" }} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 280,
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: radius.lg,
            boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
            zIndex: 100,
            overflow: "hidden",
            animation: "clozr-dolar-pop 160ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: `${space[2]} ${space[3]}`,
              borderBottom: `1px solid ${color.border}`,
              background: color.surface2,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: weight.bold, color: color.textDim, textTransform: "uppercase", letterSpacing: "0.6px" }}>
              Cotización del dólar
            </span>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Actualizar"
              title="Actualizar ahora"
              style={{
                ...iconBtnStyle,
                opacity: isFetching ? 0.6 : 1,
                cursor: isFetching ? "not-allowed" : "pointer",
              }}
            >
              <RefreshCw
                size={12}
                color={color.textMuted}
                style={{ animation: isFetching ? "clozr-spin 0.8s linear infinite" : undefined }}
              />
            </button>
          </div>

          {/* Lista de tipos */}
          <div style={{ display: "flex", flexDirection: "column", maxHeight: 360, overflowY: "auto" }}>
            {rates.length === 0 ? (
              <div style={{ padding: space[4], fontSize: text.xs, color: color.textDim, textAlign: "center" }}>
                {isFetching ? "Cargando…" : "Sin datos. Apretá ↻"}
              </div>
            ) : (
              rates.map((r) => {
                const isActive = activeKind === r.kind;
                return (
                  <button
                    key={r.kind}
                    onClick={() => {
                      setActiveKind(r.kind);
                      setOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: space[2],
                      padding: `${space[2]} ${space[3]}`,
                      background: isActive ? color.primaryBg : "transparent",
                      border: "none",
                      cursor: "pointer",
                      width: "100%",
                      textAlign: "left",
                      transition: "background 100ms",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = color.surfaceHover;
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span
                      style={{
                        fontSize: text.xs,
                        fontWeight: weight.semibold,
                        color: isActive ? color.primary : color.text,
                        flex: 1,
                      }}
                    >
                      {DOLAR_KIND_LABELS[r.kind] ?? r.nombre}
                    </span>
                    <span
                      style={{
                        fontSize: text.sm,
                        fontWeight: weight.bold,
                        color: color.text,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatMoney(r.venta)}
                    </span>
                    {isActive && <CheckCircle2 size={14} color={color.primary} />}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: `${space[2]} ${space[3]}`,
              borderTop: `1px solid ${color.border}`,
              fontSize: 11,
              color: color.textDim,
            }}
          >
            <span>{lastFetched ? `Actualizado ${formatRelative(lastFetched)}` : "Sin sync"}</span>
            {allowed && (
              <button
                onClick={() => {
                  setOpen(false);
                  onManualEdit();
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 6px",
                  background: "transparent",
                  border: "none",
                  color: color.textMuted,
                  cursor: "pointer",
                  fontSize: 11,
                }}
                title="Forzar valor manual"
              >
                <Pencil size={10} /> Manual
              </button>
            )}
          </div>
        </div>
      )}
      <style>{`
        @keyframes clozr-dolar-pop {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes clozr-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
