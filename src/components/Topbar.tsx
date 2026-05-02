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
    display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
    borderRadius: 7, fontSize: 12, fontWeight: 600,
    background: variant === "primary" ? "var(--brand)" : "var(--surface-2)",
    color: variant === "primary" ? "#fff" : "var(--text-secondary)",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{
      height: 48, display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 14px", background: "var(--surface)", borderBottom: "1px solid var(--border)",
      flexShrink: 0, gap: 10, zIndex: 10,
    }}>
      {/* Business selector */}
      <div ref={dropRef} style={{ position: "relative" }}>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 9px", borderRadius: 8, background: open ? "var(--surface-2)" : "transparent" }}
        >
          <span style={{ fontSize: 15 }}>{activeBusiness?.emoji ?? "🏪"}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {activeBusiness?.name ?? "Sin negocio"}
          </span>
          <ChevronDown size={12} color="var(--text-tertiary)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </button>

        {open && (
          <div style={{
            position: "absolute", top: "calc(100% + 5px)", left: 0,
            background: "var(--surface)", border: "1px solid var(--border-strong)",
            borderRadius: 10, minWidth: 210, boxShadow: "0 12px 32px rgba(0,0,0,0.4)", zIndex: 100, overflow: "hidden",
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
              background: "var(--surface)", border: "1px solid var(--border-strong)",
              borderRadius: 12, overflow: "hidden", boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
              minWidth: 240,
            }}>
              <button
                onClick={() => { setSaleChoice(false); setActiveScreen("inventory"); setInventoryOpenSale(true); }}
                style={{ width: "100%", textAlign: "left", padding: "12px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <p style={{ fontSize: 13, fontWeight: 700, color: "var(--green, #22c55e)", marginBottom: 2 }}>⚡ Desde inventario</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>Seleccioná una unidad en stock</p>
              </button>
              <button
                onClick={() => { setSaleChoice(false); setQuickModal("sale"); }}
                style={{ width: "100%", textAlign: "left", padding: "12px 16px", cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>✏️ Venta libre</p>
                <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>Ingresá los datos manualmente</p>
              </button>
            </div>
          )}
        </div>
        <button onClick={() => setQuickModal("movement")} style={btn("ghost")}>
          <DollarSign size={13} /> Movimiento
        </button>

        {/* Score bar */}
        <button onClick={() => setActiveScreen("home")} title={`Score del día: ${score}/100`} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 9px", borderRadius: 7, background: "var(--surface-2)", border: `1px solid ${sc.color}28` }}>
          <div style={{ display: "flex", gap: 1.5 }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} style={{ width: 4, height: 14, borderRadius: 2, background: i < Math.round(score / 10) ? sc.color : "var(--surface-3)", transition: "background 0.3s" }} />
            ))}
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: sc.color, minWidth: 22, textAlign: "right" }}>{score}</span>
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
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", background: hov ? "var(--surface-2)" : "transparent" }}>
      <span style={{ fontSize: 15 }}>{b.emoji}</span>
      <span style={{ flex: 1, fontSize: 13, color: active ? "var(--brand)" : "var(--text-primary)", fontWeight: active ? 600 : 400 }}>{b.name}</span>
      {active && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand)" }} />}
    </button>
  );
}
