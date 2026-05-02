import { useQuery } from "@tanstack/react-query";
import { CheckCircle, User, Calendar, CreditCard, Pencil, Cpu } from "lucide-react";
import { salesDb } from "../../lib/db/sales";
import { getStockItemByImei } from "../../lib/db/quickStock";
import { formatCurrency, formatDate } from "../../lib/hooks";
import { useWorkspaceStore } from "../../store/workspaceStore";
import type { SaleRow } from "../../lib/db/types";

const PAYMENT_LABELS: Record<string, string> = {
  efectivo_usd: "Efectivo USD",
  efectivo_ars: "Efectivo ARS",
  transferencia: "Transferencia",
  usdt: "USDT",
  tarjeta: "Tarjeta",
  cuotas: "Cuotas",
  otro: "Otro",
};

interface Props {
  sale: SaleRow;
  onMarkPaid: () => void;
  onEdit: () => void;
}

function ImeiUnitInfo({ imei }: { imei: string }) {
  const { activeWorkspace } = useWorkspaceStore();
  const { data: unit } = useQuery({
    queryKey: ["stock-item-imei", activeWorkspace?.id, imei],
    queryFn: () => activeWorkspace?.id ? getStockItemByImei(activeWorkspace.id, imei) : null,
    enabled: !!activeWorkspace?.id,
  });
  if (!unit) return null;
  return (
    <div style={{ marginTop: 6, padding: "7px 10px", background: "var(--surface)", borderRadius: 6, border: "1px solid var(--border)" }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>
        Unidad en stock
      </p>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 2 }}>
        <span>{unit.model_name} · {unit.color} · {unit.storage}</span>
        <span>Cargado: {unit.created_at?.slice(0, 10)}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--green, #22c55e)" }}>
          <CheckCircle size={11} /> Vendido ✓
        </span>
      </div>
    </div>
  );
}

export default function SaleDetailPanel({ sale, onMarkPaid, onEdit }: Props) {
  const { data: items = [] } = useQuery({
    queryKey: ["sale-items", sale.id],
    queryFn: () => salesDb.getItems(sale.id),
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["sale-payments", sale.id],
    queryFn: () => salesDb.getPayments(sale.id),
  });

  const sectionLabel = (txt: string) => (
    <p style={{
      fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)",
      textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 8,
    }}>
      {txt}
    </p>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <h2 style={{
            fontSize: 17, fontWeight: 700, color: "var(--text-primary)",
            letterSpacing: -0.3, marginBottom: 6, flex: 1,
          }}>
            {sale.customer_name ?? "Venta sin cliente"}
          </h2>
          <button
            onClick={onEdit}
            title="Editar venta"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 10px", borderRadius: 7,
              background: "var(--surface-2)", border: "1px solid var(--border)",
              fontSize: 12, color: "var(--text-secondary)", fontWeight: 500,
              flexShrink: 0,
            }}
          >
            <Pencil size={12} />
            Editar
          </button>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" as const }}>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 4 }}>
            <Calendar size={12} />
            {formatDate(sale.sale_date)}
          </span>
          {sale.seller_name && (
            <span style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 4 }}>
              <User size={12} />
              {sale.seller_name}
            </span>
          )}
        </div>
      </div>

      {/* Items */}
      <div>
        {sectionLabel("Productos")}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Sin ítems</p>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              style={{ background: "var(--surface-2)", borderRadius: 8, padding: "10px 12px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 2 }}>
                    {item.description}
                  </p>
                  {item.imei && (
                    <>
                      <p style={{ fontSize: 11, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 4 }}>
                        <Cpu size={10} /> IMEI: {item.imei}
                      </p>
                      <ImeiUnitInfo imei={item.imei} />
                    </>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    {formatCurrency(item.subtotal)}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {item.quantity} ×{" "}
                    {item.base_price !== null && item.base_price !== item.unit_price ? (
                      <>
                        <span style={{ textDecoration: "line-through", marginRight: 4 }}>
                          {formatCurrency(item.base_price)}
                        </span>
                        {formatCurrency(item.unit_price)}
                      </>
                    ) : (
                      formatCurrency(item.unit_price)
                    )}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Payments */}
      <div>
        {sectionLabel("Pagos")}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {payments.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Sin pagos</p>
          )}
          {payments.map((payment) => (
            <div
              key={payment.id}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 12px",
                background: "var(--surface-2)",
                borderRadius: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CreditCard size={14} style={{ color: "var(--text-tertiary)" }} />
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  {PAYMENT_LABELS[payment.method] ?? payment.method}
                  {payment.is_deposit === 1 && (
                    <span style={{
                      marginLeft: 6, fontSize: 10, padding: "2px 6px",
                      background: "rgba(10,132,255,0.15)", color: "var(--blue)",
                      borderRadius: 10, fontWeight: 600,
                    }}>
                      SEÑA
                    </span>
                  )}
                </span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                {formatCurrency(payment.amount, payment.currency)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "14px 16px" }}>
        {[
          { label: "Total", value: formatCurrency(sale.total) },
          { label: "Pagado", value: formatCurrency(sale.total_paid) },
        ].map(({ label, value }) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
            <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{value}</span>
          </div>
        ))}
        <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Saldo</span>
          <span style={{
            fontSize: 16, fontWeight: 700,
            color: sale.is_paid === 1 ? "var(--green)" : "var(--amber)",
          }}>
            {sale.is_paid === 1 ? "Pagado ✓" : formatCurrency(sale.balance)}
          </span>
        </div>
      </div>

      {/* Notes */}
      {sale.notes && (
        <div>
          {sectionLabel("Notas")}
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{sale.notes}</p>
        </div>
      )}

      {/* Mark as paid */}
      {sale.is_paid === 0 && sale.balance > 0 && (
        <button
          onClick={onMarkPaid}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "10px 16px",
            background: "rgba(48,209,88,0.12)",
            border: "1px solid rgba(48,209,88,0.3)",
            borderRadius: 8,
            fontSize: 13, fontWeight: 600, color: "var(--green)",
            cursor: "pointer",
          }}
        >
          <CheckCircle size={15} />
          Marcar como pagado
        </button>
      )}
    </div>
  );
}
