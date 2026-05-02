import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { salesDb } from "../../lib/db/sales";
import { useUIStore } from "../../store/uiStore";
import { formatCurrency } from "../../lib/hooks";
import Select from "../../components/ui/Select";
import type { SaleRow, SalePayment } from "../../lib/db/types";

const PAYMENT_METHODS = [
  { value: "efectivo_usd", label: "Efectivo USD" },
  { value: "efectivo_ars", label: "Efectivo ARS" },
  { value: "transferencia", label: "Transferencia" },
  { value: "usdt", label: "USDT" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "cuotas", label: "Cuotas" },
  { value: "otro", label: "Otro" },
];

const CURRENCY_OPTIONS = [
  { value: "ARS", label: "ARS" },
  { value: "USD", label: "USD" },
];

interface PaymentDraft {
  _id: string;
  method: string;
  currency: string;
  amount: string;
  is_deposit: boolean;
}

function fromDbPayments(payments: SalePayment[]): PaymentDraft[] {
  if (payments.length === 0) {
    return [{ _id: crypto.randomUUID(), method: "efectivo_ars", currency: "ARS", amount: "", is_deposit: false }];
  }
  return payments.map((p) => ({
    _id: crypto.randomUUID(),
    method: p.method,
    currency: p.currency,
    amount: String(p.amount),
    is_deposit: p.is_deposit === 1,
  }));
}

interface Props {
  sale: SaleRow;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function EditSaleModal({ sale, onSuccess, onCancel }: Props) {
  const { showToast } = useUIStore();
  const [notes, setNotes] = useState(sale.notes ?? "");
  const [payments, setPayments] = useState<PaymentDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    salesDb.getPayments(sale.id).then((ps) => {
      setPayments(fromDbPayments(ps));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [sale.id]);

  const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const balance = sale.total - totalPaid;

  const updatePayment = (idx: number, field: keyof PaymentDraft, value: string | boolean) => {
    setPayments((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };

  const removePayment = (idx: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== idx));
  };

  const addPayment = () => {
    setPayments((prev) => [
      ...prev,
      { _id: crypto.randomUUID(), method: "efectivo_ars", currency: "ARS", amount: "", is_deposit: false },
    ]);
  };

  const handleSave = async () => {
    if (payments.every((p) => !parseFloat(p.amount))) {
      showToast("Ingresá al menos un pago");
      return;
    }
    setSubmitting(true);
    try {
      await salesDb.updateSale(sale.id, {
        notes: notes.trim() || null,
        payments: payments
          .filter((p) => parseFloat(p.amount) > 0)
          .map((p) => ({
            method: p.method,
            currency: p.currency,
            amount: parseFloat(p.amount),
            is_deposit: p.is_deposit,
          })),
      });
      onSuccess();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar la venta");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    background: "var(--surface-2)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };

  if (loading) {
    return <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 13 }}>Cargando...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Info — campos no editables */}
      <div style={{ padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8 }}>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>
          Estos campos no se pueden modificar para mantener la integridad del stock
        </p>
        <div style={{ display: "flex", gap: 16 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Cliente: <strong style={{ color: "var(--text-primary)" }}>{sale.customer_name ?? "Sin cliente"}</strong>
          </span>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Total: <strong style={{ color: "var(--text-primary)" }}>{formatCurrency(sale.total)}</strong>
          </span>
        </div>
      </div>

      {/* Notas */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
          Notas
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observaciones sobre la venta..."
          rows={3}
          style={{ ...inputStyle, resize: "none", lineHeight: 1.5 }}
        />
      </div>

      {/* Pagos */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 8, display: "block" }}>
          Pagos
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {payments.map((payment, idx) => (
            <div key={payment._id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Select
                value={payment.method}
                onChange={(v) => updatePayment(idx, "method", v)}
                options={PAYMENT_METHODS}
                style={{ flex: "0 0 160px" }}
              />
              <Select
                value={payment.currency}
                onChange={(v) => updatePayment(idx, "currency", v)}
                options={CURRENCY_OPTIONS}
                style={{ flex: "0 0 80px" }}
              />
              <input
                type="number"
                value={payment.amount}
                onChange={(e) => updatePayment(idx, "amount", e.target.value)}
                placeholder="Monto"
                style={{ ...inputStyle, flex: 1 }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", flexShrink: 0, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={payment.is_deposit}
                  onChange={(e) => updatePayment(idx, "is_deposit", e.target.checked)}
                  style={{ accentColor: "var(--brand)" }}
                />
                Seña
              </label>
              {payments.length > 1 && (
                <button
                  onClick={() => removePayment(idx)}
                  style={{ color: "var(--text-tertiary)", display: "flex", alignItems: "center", flexShrink: 0 }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={addPayment}
          style={{ fontSize: 13, color: "var(--brand)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}
        >
          <Plus size={13} />
          Agregar medio de pago
        </button>
      </div>

      {/* Resumen */}
      <div style={{
        padding: "10px 14px", borderRadius: 8,
        background: balance <= 0 ? "rgba(48,209,88,0.1)" : "rgba(255,214,10,0.1)",
        border: `1px solid ${balance <= 0 ? "rgba(48,209,88,0.25)" : "rgba(255,214,10,0.25)"}`,
        display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
      }}>
        {[
          { label: "Total", value: formatCurrency(sale.total) },
          { label: "Pagado", value: formatCurrency(totalPaid) },
          { label: "Saldo", value: formatCurrency(Math.max(0, balance)), highlight: balance > 0 },
        ].map(({ label, value, highlight }) => (
          <span key={label} style={{ fontSize: 13 }}>
            <span style={{ color: "var(--text-tertiary)" }}>{label}: </span>
            <span style={{ fontWeight: 600, color: highlight ? "var(--amber)" : "var(--green)" }}>
              {value}
            </span>
          </span>
        ))}
      </div>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <button
          onClick={onCancel}
          style={{ padding: "8px 16px", background: "var(--surface-2)", borderRadius: 8, fontSize: 13, color: "var(--text-secondary)" }}
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={submitting}
          style={{ padding: "8px 18px", background: "var(--brand)", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#fff", opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
