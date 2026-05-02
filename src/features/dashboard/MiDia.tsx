import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Plus, X, Check, Settings } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cashDb } from "../../lib/db/cash";
import { salesDb } from "../../lib/db/sales";
import { pipelineDb } from "../../lib/db/pipeline";
import { followupsDb } from "../../lib/db/followups";
import { scoreDb } from "../../lib/db/score";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useBusinessStore } from "../../store/businessStore";
import { useAuthStore } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import { useExchangeRateStore } from "../../store/exchangeRateStore";
import { formatMoney, convertToARS } from "../../lib/currency";
import { getTodayISO } from "../../lib/hooks";
import { scoreColor } from "../../components/Topbar";
import { INACTIVE_WARNING_DAYS } from "../../lib/constants";
import type { Followup, UrgentPipelineItem } from "../../lib/db/types";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>
      {children}
    </h2>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

function UrgentCard({ item }: { item: UrgentPipelineItem }) {
  const urgency = item.inactive_days > 14 ? "red" : item.inactive_days > 7 ? "amber" : "blue";
  const c = { red: { bg: "var(--red-bg)", text: "var(--brand-light)", dot: "var(--brand)" }, amber: { bg: "var(--amber-bg)", text: "var(--amber)", dot: "var(--amber)" }, blue: { bg: "var(--blue-bg)", text: "var(--blue)", dot: "var(--blue)" } }[urgency];

  const handleWA = () => {
    if (!item.customer_phone) return;
    const clean = item.customer_phone.replace(/\D/g, "");
    const num = clean.startsWith("54") ? clean : `54${clean}`;
    openUrl(`https://wa.me/${num}`).catch(() => {});
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.customer_name ?? "Sin nombre"}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>{item.stage_name}</p>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: c.bg, color: c.text, flexShrink: 0 }}>
        {item.inactive_days}d
      </span>
      {item.customer_phone && (
        <button onClick={handleWA} style={{ width: 28, height: 28, borderRadius: 6, background: "var(--green-bg)", color: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <MessageCircle size={13} />
        </button>
      )}
    </div>
  );
}

function FollowupItem({ followup, onToggle, onDelete }: { followup: Followup; onToggle: (id: string, done: boolean) => void; onDelete: (id: string) => void }) {
  const done = followup.completed === 1;
  const today = getTodayISO();
  const overdue = !done && followup.due_date < today;
  const [hov, setHov] = useState(false);

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: "1px solid var(--border)", background: hov ? "var(--surface-2)" : "transparent", transition: "background 0.1s" }}>
      <button onClick={() => onToggle(followup.id, !done)}
        style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `2px solid ${done ? "var(--green)" : overdue ? "var(--brand)" : "var(--border-strong)"}`, background: done ? "var(--green)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
        {done && <Check size={10} color="#fff" strokeWidth={3} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, color: done ? "var(--text-tertiary)" : "var(--text-primary)", textDecoration: done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {followup.text}
        </p>
        {followup.customer_name && <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>{followup.customer_name}</p>}
      </div>
      {overdue && <span style={{ fontSize: 10, fontWeight: 600, color: "var(--brand)", background: "var(--red-bg)", padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}>Vencido</span>}
      {hov && <button onClick={() => onDelete(followup.id)} style={{ color: "var(--text-tertiary)", display: "flex", flexShrink: 0 }}><X size={13} /></button>}
    </div>
  );
}

function AddFollowupInline({ onAdd }: { onAdd: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const submit = () => { if (!text.trim()) return; onAdd(text.trim()); setText(""); setOpen(false); };

  if (!open) return (
    <button onClick={() => setOpen(true)} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", fontSize: 13, color: "var(--text-tertiary)", transition: "background 0.1s" }}>
      <Plus size={13} /> Agregar seguimiento
    </button>
  );

  return (
    <div style={{ padding: "10px 14px", display: "flex", gap: 8 }}>
      <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setOpen(false); }}
        placeholder="¿Qué tenés que hacer?"
        style={{ flex: 1, padding: "7px 10px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 6, color: "var(--text-primary)", fontSize: 13, outline: "none" }} />
      <button onClick={submit} disabled={!text.trim()} style={{ padding: "7px 12px", background: "var(--brand)", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "#fff", opacity: !text.trim() ? 0.5 : 1 }}>OK</button>
    </div>
  );
}

export default function MiDia() {
  const { activeWorkspace } = useWorkspaceStore();
  const { activeBusiness } = useBusinessStore();
  const { userName } = useAuthStore();
  const { showToast, setActiveScreen } = useUIStore();
  const { usdToArs } = useExchangeRateStore();
  const queryClient = useQueryClient();

  const wid = activeWorkspace?.id ?? "";
  const bid = activeBusiness?.id ?? "";
  const today = getTodayISO();

  const { data: score = 0 } = useQuery({
    queryKey: ["day-score", wid],
    queryFn: () => scoreDb.calculateDayScore(wid),
    enabled: !!wid,
    refetchInterval: 60_000,
  });

  const { data: cashByCurrency } = useQuery({
    queryKey: ["cash-by-currency", wid, bid, today],
    queryFn: () => cashDb.getSummaryByCurrency(wid, bid, { from: today, to: today }),
    enabled: !!wid && !!bid,
  });

  const { data: pendingCobros = [] } = useQuery({
    queryKey: ["pending-cobros", wid],
    queryFn: () => salesDb.getPendingCobros(wid, 3),
    enabled: !!wid,
  });

  const { data: urgentItems = [] } = useQuery({
    queryKey: ["pipeline-urgent", wid, INACTIVE_WARNING_DAYS],
    queryFn: () => pipelineDb.getUrgent(wid, INACTIVE_WARNING_DAYS),
    enabled: !!wid,
  });

  const { data: followups = [] } = useQuery({
    queryKey: ["followups-day", wid, bid, today],
    queryFn: () => followupsDb.getForDay(wid, bid, today),
    enabled: !!wid && !!bid,
  });

  const { data: recentMovements = [] } = useQuery({
    queryKey: ["cash-recent", wid, bid],
    queryFn: () => cashDb.getMovements(wid, bid, { limit: 6 }),
    enabled: !!wid && !!bid,
  });

  const sc = scoreColor(score);

  // Goal
  const goal = activeWorkspace?.daily_goal ?? 0;
  const goalCurrency = activeWorkspace?.daily_goal_currency ?? "USD";

  const arsIn = cashByCurrency?.ars.ingresos ?? 0;
  const arsOut = cashByCurrency?.ars.egresos ?? 0;
  const usdIn = cashByCurrency?.usd.ingresos ?? 0;
  const usdOut = cashByCurrency?.usd.egresos ?? 0;
  const arsBalance = arsIn - arsOut;
  const usdBalance = usdIn - usdOut;

  // Goal progress in goal's currency
  const ingresoEnGoalCurrency = goalCurrency === "USD"
    ? usdIn + convertToARS(arsIn, "ARS", usdToArs === 0 ? 1 : usdToArs) / (usdToArs === 0 ? 1 : usdToArs)
    : arsIn + usdIn * usdToArs;
  const goalPercent = goal > 0 ? Math.min(100, Math.round((ingresoEnGoalCurrency / goal) * 100)) : null;

  const followupsDone = followups.filter((f) => f.completed === 1).length;
  const followupsPending = followups.filter((f) => f.completed === 0).length;

  const handleToggle = async (id: string, done: boolean) => {
    queryClient.setQueryData<Followup[]>(["followups-day", wid, bid, today], (old = []) =>
      old.map((f) => (f.id === id ? { ...f, completed: done ? 1 : 0 } : f)),
    );
    try {
      await followupsDb.toggleComplete(id, done);
      queryClient.invalidateQueries({ queryKey: ["day-score", wid] });
    } catch {
      queryClient.invalidateQueries({ queryKey: ["followups-day", wid, bid, today] });
      showToast("Error al actualizar seguimiento");
    }
  };

  const handleDelete = async (id: string) => {
    queryClient.setQueryData<Followup[]>(["followups-day", wid, bid, today], (old = []) => old.filter((f) => f.id !== id));
    await followupsDb.remove(id).catch(() => {});
  };

  const handleAdd = async (text: string) => {
    if (!wid || !bid) return;
    try {
      const f = await followupsDb.create(wid, bid, { text, due_date: today });
      queryClient.setQueryData<Followup[]>(["followups-day", wid, bid, today], (old = []) => [...old, f]);
    } catch { showToast("Error al crear seguimiento"); }
  };

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <div style={{ padding: "20px 24px", maxWidth: 1400, display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.5 }}>
              {greeting()}{userName ? `, ${userName.split(" ")[0]}` : ""}
            </h1>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 3 }}>
              {activeBusiness?.name} · {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--surface)", border: `1px solid ${sc.color}33`, borderRadius: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Score del día</span>
              <div style={{ display: "flex", gap: 2 }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} style={{ width: 6, height: 18, borderRadius: 2, background: i < Math.round(score / 10) ? sc.color : "var(--surface-3)", transition: "background 0.3s" }} />
                ))}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 28, fontWeight: 800, color: sc.color, lineHeight: 1, letterSpacing: -1 }}>{score}</p>
              {sc.icon && <span style={{ fontSize: 16 }}>{sc.icon}</span>}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>

          {/* LEFT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {urgentItems.length > 0 && (
              <section>
                <SectionTitle>Necesitan atención</SectionTitle>
                <Card>{urgentItems.map((i) => <UrgentCard key={i.id} item={i} />)}</Card>
              </section>
            )}
            <section>
              <SectionTitle>
                Seguimientos{followups.length > 0 && <span style={{ marginLeft: 8, color: "var(--text-primary)" }}>{followupsDone}/{followups.length}</span>}
              </SectionTitle>
              <Card>
                {followups.length === 0 && <p style={{ padding: "12px 14px", fontSize: 13, color: "var(--text-tertiary)" }}>Sin seguimientos para hoy</p>}
                {followups.map((f) => <FollowupItem key={f.id} followup={f} onToggle={handleToggle} onDelete={handleDelete} />)}
                <AddFollowupInline onAdd={handleAdd} />
              </Card>
            </section>
            {recentMovements.length > 0 && (
              <section>
                <SectionTitle>Actividad reciente</SectionTitle>
                <Card>
                  {recentMovements.map((m) => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 14, color: m.direction === "in" ? "var(--green)" : "var(--brand)" }}>{m.direction === "in" ? "↑" : "↓"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.description ?? m.type}</p>
                        <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>{new Date(m.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: m.direction === "in" ? "var(--green)" : "var(--brand)", flexShrink: 0 }}>
                        {m.direction === "in" ? "+" : "-"}{formatMoney(m.amount, m.currency)}
                      </span>
                    </div>
                  ))}
                </Card>
              </section>
            )}
          </div>

          {/* RIGHT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Dinero hoy */}
            <section>
              <SectionTitle>Dinero hoy</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {arsIn > 0 || arsOut > 0 ? (
                  <MoneyBlock label="ARS" ingresos={arsIn} egresos={arsOut} balance={arsBalance} currency="ARS" />
                ) : null}
                {usdIn > 0 || usdOut > 0 ? (
                  <MoneyBlock label="USD" ingresos={usdIn} egresos={usdOut} balance={usdBalance} currency="USD" />
                ) : null}
                {arsIn === 0 && arsOut === 0 && usdIn === 0 && usdOut === 0 && (
                  <p style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "10px 0" }}>Sin movimientos hoy</p>
                )}
                {(arsIn > 0 || usdIn > 0 || arsOut > 0 || usdOut > 0) && (
                  <div style={{ padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Balance equiv. ARS</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: (arsBalance + usdBalance * usdToArs) >= 0 ? "var(--text-primary)" : "var(--brand)" }}>
                      {formatMoney(arsBalance + usdBalance * usdToArs, "ARS")}
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Goal */}
            {goal > 0 ? (
              <section>
                <SectionTitle>Objetivo del día</SectionTitle>
                <Card style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {formatMoney(ingresoEnGoalCurrency, goalCurrency)} / {formatMoney(goal, goalCurrency)}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: sc.color }}>{goalPercent}%</span>
                  </div>
                  <div style={{ height: 8, background: "var(--surface-3)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 4, background: (goalPercent ?? 0) >= 100 ? "var(--green)" : sc.color, width: `${goalPercent ?? 0}%`, transition: "width 0.5s ease" }} />
                  </div>
                  {(goalPercent ?? 0) >= 100 && <p style={{ fontSize: 11, color: "var(--green)", marginTop: 6, fontWeight: 600 }}>🎯 ¡Objetivo cumplido!</p>}
                </Card>
              </section>
            ) : (
              <section>
                <Card style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <p style={{ flex: 1, fontSize: 12, color: "var(--text-tertiary)" }}>Sin objetivo diario configurado</p>
                    <button onClick={() => setActiveScreen("settings")} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--brand)", fontWeight: 600 }}>
                      <Settings size={12} /> Configurar
                    </button>
                  </div>
                </Card>
              </section>
            )}

            {/* Cobros pendientes */}
            {pendingCobros.length > 0 && (
              <section>
                <SectionTitle>Cobros pendientes</SectionTitle>
                <Card>
                  {pendingCobros.map((s) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.customer_name ?? "Sin cliente"}
                      </p>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--amber)", flexShrink: 0 }}>{formatMoney(s.balance, "ARS")}</span>
                    </div>
                  ))}
                </Card>
              </section>
            )}

            {/* Seguimientos progress */}
            {followups.length > 0 && (
              <section>
                <Card style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Seguimientos: {followupsDone}/{followups.length}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: followupsPending === 0 ? "var(--green)" : "var(--text-secondary)" }}>
                      {followupsPending === 0 ? "Todos listos ✓" : `${followupsPending} pendiente${followupsPending > 1 ? "s" : ""}`}
                    </span>
                  </div>
                  <div style={{ height: 6, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: "var(--green)", width: `${followups.length > 0 ? (followupsDone / followups.length) * 100 : 0}%`, transition: "width 0.4s ease" }} />
                  </div>
                </Card>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MoneyBlock({ label, ingresos, egresos, balance, currency }: { label: string; ingresos: number; egresos: number; balance: number; currency: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
        <div>
          <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Ingresos</p>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--green)" }}>{formatMoney(ingresos, currency)}</p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Egresos</p>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--brand)" }}>-{formatMoney(egresos, currency)}</p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Balance</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: balance >= 0 ? "var(--text-primary)" : "var(--brand)" }}>{formatMoney(balance, currency)}</p>
        </div>
      </div>
    </div>
  );
}
