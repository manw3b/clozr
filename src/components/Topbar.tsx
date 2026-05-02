import { useState, useRef, useEffect } from "react";
import { Plus, DollarSign, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useBusinessStore } from "../store/businessStore";
import { useUIStore } from "../store/uiStore";
import { useWorkspaceStore } from "../store/workspaceStore";
import { useExchangeRateStore } from "../store/exchangeRateStore";
import { businessesDb } from "../lib/db/businesses";
import { scoreDb } from "../lib/db/score";
import type { Business } from "../lib/db/types";

// ─── Score helpers ────────────────────────────────────────────────

const SCORE_TIERS = [
  { min: 70, color: "var(--green)", icon: "⚡" },
  { min: 40, color: "var(--amber)", icon: "🔥" },
  { min: 1,  color: "var(--blue)",  icon: "" },
  { min: 0,  color: "var(--brand)", icon: "" },
] as const;

export function scoreColor(score: number) {
  return SCORE_TIERS.find((t) => score >= t.min) ?? SCORE_TIERS[3];
}

// ─── Exchange rate widget ─────────────────────────────────────────

function ExchangeRateWidget() {
  const { activeWorkspace } = useWorkspaceStore();
  const { usdToArs, lastUpdated, loadRate, setRate } = useExchangeRateStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(usdToArs));
  const wid = activeWorkspace?.id ?? "";

  useEffect(() => {
    if (wid) loadRate(wid);
  }, [wid, loadRate]);

  useEffect(() => {
    if (!editing) setDraft(String(Math.round(usdToArs)));
  }, [usdToArs, editing]);

  const commit = () => {
    const parsed = parseFloat(draft);
    if (parsed > 0 && parsed !== usdToArs && wid) {
      setRate(wid, parsed);
    }
    setEditing(false);
  };

  const tooltip = lastUpdated
    ? `Actualizado ${new Date(lastUpdated).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`
    : "Tipo de cambio";

  return (
    <div
      title={tooltip}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "4px 8px", borderRadius: 7,
        background: "var(--surface-2)", border: "1px solid var(--border)",
        fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: "var(--text-tertiary)" }}>USD =</span>
      <span style={{ color: "var(--text-tertiary)" }}>$</span>
      {editing ? (
        <input
          autoFocus
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setDraft(String(Math.round(usdToArs))); } }}
          style={{
            width: 68, padding: "1px 4px",
            background: "var(--surface-3)", border: "1px solid var(--brand)",
            borderRadius: 4, color: "var(--text-primary)", fontSize: 12, outline: "none",
          }}
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 12 }}
          title="Click para editar"
        >
          {Math.round(usdToArs).toLocaleString("es-AR")}
        </button>
      )}
      <span style={{ color: "var(--text-tertiary)" }}>ARS</span>
    </div>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────

export default function Topbar() {
  const { businesses, activeBusiness, setActiveBusiness, addBusiness } = useBusinessStore();
  const { activeWorkspace } = useWorkspaceStore();
  const { setQuickModal, setActiveScreen, setInventoryOpenSale } = useUIStore();
  const [open, setOpen] = useState(false);
  const [saleChoice, setSaleChoice] = useState(false);
  const saleChoiceRef = useRef<HTMLDivElement>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("🏪");
  const dropRef = useRef<HTMLDivElement>(null);
  const wid = activeWorkspace?.id ?? "";

  const { data: score = 0 } = useQuery({
    queryKey: ["day-score", wid],
    queryFn: () => scoreDb.calculateDayScore(wid),
    enabled: !!wid,
    refetchInterval: 60_000,
  });

  const sc = scoreColor(score);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
      if (saleChoiceRef.current && !saleChoiceRef.current.contains(e.target as Node)) {
        setSaleChoice(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleCreate = async () => {
    if (!newName.trim() || !activeWorkspace) return;
    try {
      const b = await businessesDb.create(activeWorkspace.id, { name: newName.trim(), emoji: newEmoji || "🏪" });
      addBusiness(b);
      setActiveBusiness(b);
      setNewName(""); setNewEmoji("🏪"); setCreating(false); setOpen(false);
    } catch { /* ignore */ }
  };

  const btn = (variant: "primary" | "ghost"): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", height: 32,
    borderRadius: 8, fontSize: 12.5, fontWeight: 600,
    background: variant === "primary" ? "var(--brand)" : "var(--surface-2)",
    color: variant === "primary" ? "#fff" : "var(--text-secondary)",
    border: variant === "primary" ? "none" : "1px solid var(--border)",
    whiteSpace: "nowrap",
    transition: "background 0.12s ease",
  });

  return (
    <div style={{
      height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 18px", background: "var(--surface)", borderBottom: "1px solid var(--border)",
      flexShrink: 0, gap: 12, zIndex: 10,
    }}>
      {/* Business selector */}
      <div ref={dropRef} style={{ position: "relative" }}>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: open ? "var(--surface-2)" : "transparent", transition: "background 0.12s ease" }}
        >
          <span style={{ fontSize: 16 }}>{activeBusiness?.emoji ?? "🏪"}</span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {activeBusiness?.name ?? "Sin negocio"}
          </span>
          <ChevronDown size={13} color="var(--text-tertiary)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }} />
        </button>

        {open && (
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0,
            background: "var(--surface-elevated)", border: "1px solid var(--border-strong)",
            borderRadius: 12, minWidth: 240, boxShadow: "var(--shadow-lg)", zIndex: 100, overflow: "hidden",
          }}>
            {businesses.map((b) => (
              <BizOption key={b.id} b={b} active={activeBusiness?.id === b.id} onSelect={() => { setActiveBusiness(b); setOpen(false); }} />
            ))}
            <div style={{ borderTop: "1px solid var(--border)", padding: 6 }}>
              {!creating ? (
                <button onClick={() => setCreating(true)} style={{ width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 6, fontSize: 12, color: "var(--brand)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <Plus size={13} /> Nuevo negocio
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={newEmoji} onChange={(e) => { const c = [...e.target.value]; setNewEmoji(c[c.length - 1] ?? "🏪"); }} maxLength={4}
                      style={{ width: 38, padding: "5px 6px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 6, color: "var(--text-primary)", fontSize: 16, textAlign: "center", outline: "none" }} />
                    <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
                      placeholder="Nombre del negocio"
                      style={{ flex: 1, padding: "5px 8px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 6, color: "var(--text-primary)", fontSize: 12, outline: "none" }} />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={handleCreate} disabled={!newName.trim()} style={{ ...btn("primary"), flex: 1, justifyContent: "center", opacity: !newName.trim() ? 0.5 : 1 }}>Crear</button>
                    <button onClick={() => setCreating(false)} style={{ ...btn("ghost"), flex: 1, justifyContent: "center" }}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ExchangeRateWidget />
        <div ref={saleChoiceRef} style={{ position: "relative" }}>
          <button onClick={() => setSaleChoice((v) => !v)} style={btn("primary")}>
            <Plus size={13} /> Nueva venta
          </button>
          {saleChoice && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 200,
              background: "var(--surface-elevated)", border: "1px solid var(--border-strong)",
              borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow-lg)",
              minWidth: 260,
            }}>
              <button
                onClick={() => { setSaleChoice(false); setActiveScreen("inventory"); setInventoryOpenSale(true); }}
                style={{ width: "100%", textAlign: "left", padding: "14px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.12s ease" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--green)", marginBottom: 3 }}>⚡ Desde inventario</p>
                <p style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>Seleccioná una unidad en stock</p>
              </button>
              <button
                onClick={() => { setSaleChoice(false); setQuickModal("sale"); }}
                style={{ width: "100%", textAlign: "left", padding: "14px 16px", cursor: "pointer", transition: "background 0.12s ease" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 3 }}>✏️ Venta libre</p>
                <p style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>Ingresá los datos manualmente</p>
              </button>
            </div>
          )}
        </div>
        <button onClick={() => setQuickModal("movement")} style={btn("ghost")}>
          <DollarSign size={13} /> Movimiento
        </button>

        {/* Score bar */}
        <button onClick={() => setActiveScreen("home")} title={`Score del día: ${score}/100`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", height: 32, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: 2 }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} style={{ width: 4, height: 14, borderRadius: 2, background: i < Math.round(score / 10) ? sc.color : "var(--surface-3)", transition: "background 0.3s ease" }} />
            ))}
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: sc.color, minWidth: 22, textAlign: "right" }}>{score}</span>
          {sc.icon && <span style={{ fontSize: 11 }}>{sc.icon}</span>}
        </button>
      </div>
    </div>
  );
}

function BizOption({ b, active, onSelect }: { b: Business; active: boolean; onSelect: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onSelect} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: hov ? "var(--surface-2)" : "transparent", transition: "background 0.12s ease" }}>
      <span style={{ fontSize: 16 }}>{b.emoji}</span>
      <span style={{ flex: 1, fontSize: 13.5, color: active ? "var(--text-primary)" : "var(--text-primary)", fontWeight: active ? 600 : 500, textAlign: "left" }}>{b.name}</span>
      {active && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand)" }} />}
    </button>
  );
}
