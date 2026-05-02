import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { cashDb } from "../../lib/db/cash";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useBusinessStore } from "../../store/businessStore";
import { useExchangeRateStore } from "../../store/exchangeRateStore";
import { useUIStore } from "../../store/uiStore";
import { formatMoney } from "../../lib/currency";
import { getTodayISO } from "../../lib/hooks";
import Select from "../../components/ui/Select";
import type { CashMovement, CashMovementType, CashDirection, CreateCashMovementInput } from "../../lib/db/types";

type Period = "today" | "week" | "month";

const PERIOD_LABELS: Record<Period, string> = { today: "Hoy", week: "Semana", month: "Mes" };

const MOVEMENT_TYPES: Array<{ value: CashMovementType; label: string; direction: CashDirection }> = [
  { value: "venta", label: "Venta", direction: "in" },
  { value: "cobro", label: "Cobro", direction: "in" },
  { value: "compra", label: "Compra", direction: "out" },
  { value: "gasto", label: "Gasto", direction: "out" },
  { value: "otro", label: "Otro", direction: "in" },
];

const TYPE_LABELS: Record<CashMovementType, string> = { venta: "Venta", cobro: "Cobro", compra: "Compra", gasto: "Gasto", otro: "Otro" };

const FILTER_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "in", label: "Ingresos" },
  { value: "out", label: "Egresos" },
  { value: "venta", label: "Ventas" },
  { value: "cobro", label: "Cobros" },
  { value: "compra", label: "Compras" },
  { value: "gasto", label: "Gastos" },
];

function getDateRange(period: Period): { from: string; to: string } {
  const today = getTodayISO();
  if (period === "today") return { from: today, to: today };
  if (period === "week") {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  const now = new Date();
  return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, to: today };
}

export default function CashScreen() {
  const { activeWorkspace } = useWorkspaceStore();
  const { activeBusiness } = useBusinessStore();
  const { usdToArs } = useExchangeRateStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const wid = activeWorkspace?.id ?? "";
  const bid = activeBusiness?.id ?? "";

  const [period, setPeriod] = useState<Period>("today");
  const [filter, setFilter] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { from, to } = getDateRange(period);

  const invalidate = () => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.toString().startsWith("cash") });
    queryClient.invalidateQueries({ queryKey: ["day-score", wid] });
  };

  const { data: byCurrency } = useQuery({
    queryKey: ["cash-by-currency", wid, bid, from, to],
    queryFn: () => cashDb.getSummaryByCurrency(wid, bid, { from, to }),
    enabled: !!wid && !!bid,
  });

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["cash-movements", wid, bid, from, to],
    queryFn: () => cashDb.getMovements(wid, bid, { from, to }),
    enabled: !!wid && !!bid,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => cashDb.remove(id),
    onSuccess: () => { invalidate(); showToast("Movimiento eliminado", "success"); },
    onError: () => showToast("No se puede eliminar un movimiento de venta"),
  });

  const filtered = filter
    ? movements.filter((m) => filter === "in" || filter === "out" ? m.direction === filter : m.type === filter)
    : movements;

  const arsIn = byCurrency?.ars.ingresos ?? 0;
  const arsOut = byCurrency?.ars.egresos ?? 0;
  const usdIn = byCurrency?.usd.ingresos ?? 0;
  const usdOut = byCurrency?.usd.egresos ?? 0;
  const arsEquivBalance = (arsIn - arsOut) + (usdIn - usdOut) * usdToArs;

  const TH: React.CSSProperties = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0, background: "var(--bg)", zIndex: 1, whiteSpace: "nowrap" };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "20px 24px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.5 }}>Caja Operativa</h1>
          <button onClick={() => setShowForm((v) => !v)} style={{ padding: "8px 14px", background: "var(--brand)", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#fff" }}>
            + Movimiento
          </button>
        </div>

        {/* Period selector */}
        <div style={{ display: "flex", gap: 2, marginBottom: 14 }}>
          {(["today", "week", "month"] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} style={{ padding: "6px 14px", borderRadius: 7, fontSize: 13, background: period === p ? "var(--surface-2)" : "transparent", color: period === p ? "var(--text-primary)" : "var(--text-tertiary)", fontWeight: period === p ? 600 : 400, border: period === p ? "1px solid var(--border-strong)" : "1px solid transparent" }}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* 4 cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <SummaryCard label="Ingresos ARS" amount={arsIn} color="var(--green)" currency="ARS" />
          <SummaryCard label="Ingresos USD" amount={usdIn} color="var(--green)" currency="USD" />
          <SummaryCard label={`Egresos (equiv. ARS)`} amount={arsOut + usdOut * usdToArs} color="var(--brand)" currency="ARS" negative />
          <SummaryCard label="Balance ARS equiv." amount={arsEquivBalance} color={arsEquivBalance >= 0 ? "var(--text-primary)" : "var(--brand)"} currency="ARS" bold />
        </div>

        {/* Quick form */}
        {showForm && (
          <QuickMovementForm wid={wid} bid={bid} onSuccess={() => { invalidate(); setShowForm(false); }} onCancel={() => setShowForm(false)} />
        )}

        {/* Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)", flexShrink: 0 }}>Filtrar:</span>
          <div style={{ width: 150 }}><Select value={filter} onChange={setFilter} options={FILTER_OPTIONS} /></div>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {isLoading ? (
          <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 13 }}>Cargando...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-tertiary)", fontSize: 14 }}>
            {movements.length === 0 ? "Sin movimientos en este período" : "Sin resultados"}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={TH}>Hora</th>
                <th style={TH}>Tipo</th>
                <th style={TH}>Descripción</th>
                <th style={TH}>Cliente</th>
                <th style={TH}>Moneda</th>
                <th style={{ ...TH, textAlign: "right" }}>Monto</th>
                <th style={TH} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <MovementRow key={m.id} movement={m} onDelete={(id) => deleteMutation.mutate(id)} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, amount, color, currency, negative, bold }: { label: string; amount: number; color: string; currency: string; negative?: boolean; bold?: boolean }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
      <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: bold ? 800 : 700, color, letterSpacing: -0.5 }}>
        {negative && amount > 0 ? "-" : ""}{formatMoney(amount, currency)}
      </p>
    </div>
  );
}

function MovementRow({ movement: m, onDelete }: { movement: CashMovement; onDelete: (id: string) => void }) {
  const [hov, setHov] = useState(false);
  const auto = m.reference_type === "sale";
  const TD: React.CSSProperties = { padding: "10px 14px", fontSize: 13, color: "var(--text-primary)", borderBottom: "1px solid var(--border)", verticalAlign: "middle" };
  return (
    <tr onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ background: hov ? "rgba(255,255,255,0.02)" : "transparent" }}>
      <td style={{ ...TD, color: "var(--text-tertiary)", fontSize: 12, whiteSpace: "nowrap" }}>
        {new Date(m.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
      </td>
      <td style={TD}>
        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: m.direction === "in" ? "var(--green-bg)" : "var(--red-bg)", color: m.direction === "in" ? "var(--green)" : "var(--brand)" }}>
          {TYPE_LABELS[m.type]}
        </span>
        {auto && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--text-tertiary)" }}>auto</span>}
      </td>
      <td style={{ ...TD, color: "var(--text-secondary)" }}>{m.description ?? "—"}</td>
      <td style={{ ...TD, color: "var(--text-secondary)" }}>{m.customer_name ?? <span style={{ color: "var(--text-tertiary)" }}>—</span>}</td>
      <td style={{ ...TD, color: "var(--text-tertiary)", fontSize: 12 }}>{m.currency}</td>
      <td style={{ ...TD, textAlign: "right", fontWeight: 600, color: m.direction === "in" ? "var(--green)" : "var(--brand)", whiteSpace: "nowrap" }}>
        {m.direction === "in" ? "+" : "-"}{formatMoney(m.amount, m.currency)}
      </td>
      <td style={{ ...TD, width: 40 }}>
        {!auto && hov && (
          <button onClick={() => onDelete(m.id)} style={{ color: "var(--text-tertiary)", display: "flex" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--brand)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}>
            <Trash2 size={13} />
          </button>
        )}
      </td>
    </tr>
  );
}

function QuickMovementForm({ wid, bid, onSuccess, onCancel }: { wid: string; bid: string; onSuccess: () => void; onCancel: () => void }) {
  const [type, setType] = useState<CashMovementType>("cobro");
  const [currency, setCurrency] = useState("ARS");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useUIStore();
  const direction = MOVEMENT_TYPES.find((t) => t.value === type)?.direction ?? "in";

  const handleSubmit = async () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { showToast("Monto inválido"); return; }
    setSubmitting(true);
    try {
      const data: CreateCashMovementInput = { type, direction, amount: parsed, currency, description: description.trim() || null };
      await cashDb.createMovement(wid, bid, data);
      onSuccess();
    } catch { showToast("Error al registrar"); } finally { setSubmitting(false); }
  };

  const iStyle: React.CSSProperties = { padding: "8px 10px", background: "var(--surface-2)", border: "1px solid var(--border-strong)", borderRadius: 7, color: "var(--text-primary)", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lStyle: React.CSSProperties = { fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4, display: "block" };

  return (
    <div style={{ padding: "12px 14px", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 10, marginBottom: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>Registrar movimiento</p>
      <div style={{ display: "grid", gridTemplateColumns: "150px 90px 110px 1fr auto auto", gap: 8, alignItems: "end" }}>
        <div>
          <label style={lStyle}>Tipo</label>
          <Select value={type} onChange={(v) => setType(v as CashMovementType)} options={MOVEMENT_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
        </div>
        <div>
          <label style={lStyle}>Moneda</label>
          <Select value={currency} onChange={setCurrency} options={[{ value: "ARS", label: "ARS" }, { value: "USD", label: "USD" }]} />
        </div>
        <div>
          <label style={lStyle}>Monto</label>
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} placeholder="0" style={iStyle} />
        </div>
        <div>
          <label style={lStyle}>Descripción</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} placeholder="Opcional" style={iStyle} />
        </div>
        <button onClick={handleSubmit} disabled={submitting || !amount} style={{ padding: "8px 14px", background: "var(--brand)", borderRadius: 7, fontSize: 13, fontWeight: 600, color: "#fff", opacity: submitting || !amount ? 0.5 : 1, whiteSpace: "nowrap" }}>
          {submitting ? "..." : "Registrar"}
        </button>
        <button onClick={onCancel} style={{ padding: "8px 10px", background: "var(--surface-2)", borderRadius: 7, fontSize: 13, color: "var(--text-secondary)" }}>✕</button>
      </div>
    </div>
  );
}
