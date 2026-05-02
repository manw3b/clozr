import { useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { salesDb } from "../../lib/db/sales";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useUIStore } from "../../store/uiStore";
import { formatCurrency, formatDate } from "../../lib/hooks";
import SidePanel from "../../components/SidePanel";
import Modal from "../../components/Modal";
import SaleDetailPanel from "./SaleDetailPanel";
import NewSaleModal from "./NewSaleModal";
import EditSaleModal from "./EditSaleModal";
import MetricsTab from "./MetricsTab";
import type { SaleRow } from "../../lib/db/types";

type Period = "today" | "week" | "month" | "all";
type ActiveTab = "ventas" | "metricas";

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mes" },
  { value: "all", label: "Todo" },
];

const TH_STYLE: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text-secondary)",
  whiteSpace: "nowrap",
  position: "sticky",
  top: 0,
  background: "var(--bg)",
  zIndex: 1,
};

function SaleRow({
  sale,
  selected,
  onClick,
}: {
  sale: SaleRow;
  selected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: "1px solid var(--border)",
        background: selected
          ? "rgba(232,0,29,0.06)"
          : hovered
          ? "var(--surface-2)"
          : "transparent",
        cursor: "pointer",
        transition: "background 0.12s ease",
      }}
    >
      <td style={{ padding: "12px 14px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
        {formatDate(sale.sale_date)}
      </td>
      <td style={{
        padding: "12px 14px", fontSize: 13.5,
        color: sale.customer_name ? "var(--text-primary)" : "var(--text-tertiary)",
        maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {sale.customer_name ?? "Sin cliente"}
      </td>
      <td style={{ padding: "12px 14px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
        {sale.seller_name ?? "—"}
      </td>
      <td style={{
        padding: "12px 14px", fontSize: 12.5, color: "var(--text-secondary)",
        maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {sale.items_count > 0
          ? `${sale.items_count} ítem${sale.items_count !== 1 ? "s" : ""}${sale.items_preview ? ` · ${sale.items_preview}` : ""}`
          : "—"}
      </td>
      <td style={{ padding: "12px 14px", fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
        {formatCurrency(sale.total)}
      </td>
      <td style={{ padding: "12px 14px", fontSize: 13.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
        {formatCurrency(sale.total_paid)}
      </td>
      <td style={{ padding: "12px 14px" }}>
        {sale.is_paid === 1 ? (
          <span style={{
            display: "inline-block", padding: "3px 9px",
            background: "rgba(48,209,88,0.15)", color: "var(--green)",
            borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
          }}>
            Pagado
          </span>
        ) : (
          <span style={{
            display: "inline-block", padding: "3px 9px",
            background: "rgba(255,214,10,0.15)", color: "var(--amber)",
            borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
          }}>
            Saldo: {formatCurrency(sale.balance)}
          </span>
        )}
      </td>
      <td style={{ padding: "12px 14px", textAlign: "right", color: "var(--text-tertiary)", fontSize: 16 }}>
        ›
      </td>
    </tr>
  );
}

export default function SalesScreen() {
  const { activeWorkspace } = useWorkspaceStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const wid = activeWorkspace?.id ?? "";

  const [activeTab, setActiveTab] = useState<ActiveTab>("ventas");
  const [period, setPeriod] = useState<Period>("month");
  const [selected, setSelected] = useState<SaleRow | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editingSale, setEditingSale] = useState<SaleRow | null>(null);

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales", wid, period],
    queryFn: () => salesDb.getRows(wid, period),
    enabled: !!wid,
  });

  const { data: metrics } = useQuery({
    queryKey: ["sales-metrics", wid],
    queryFn: () => salesDb.getSalesMetrics(wid),
    enabled: !!wid,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (q) => {
        const key = q.queryKey[0] as string;
        return key === "sales" || key === "sales-metrics" || key === "top-customers" || key === "sales-by-month" || key === "sales-by-vendor";
      },
    });
  }, [queryClient]);

  const markPaidMutation = useMutation({
    mutationFn: (saleId: string) => salesDb.markAsPaid(saleId),
    onSuccess: (_, saleId) => {
      invalidate();
      if (selected?.id === saleId) {
        setSelected((prev) =>
          prev ? { ...prev, is_paid: 1, balance: 0, total_paid: prev.total } : prev,
        );
      }
      showToast("Venta marcada como pagada", "success");
    },
    onError: () => showToast("Error al actualizar la venta"),
  });

  const handleNewSuccess = () => {
    setShowNew(false);
    invalidate();
    showToast("Venta registrada", "success");
  };

  const summaryCards = [
    {
      label: "Ventas del mes",
      value: `${metrics?.month_sales_count ?? 0}`,
      suffix: " ventas",
      warn: false,
    },
    {
      label: "Total facturado",
      value: formatCurrency(metrics?.this_month ?? 0),
      suffix: "",
      warn: false,
    },
    {
      label: "Ticket promedio",
      value: formatCurrency(metrics?.avg_ticket ?? 0),
      suffix: "",
      warn: false,
    },
    {
      label: "Saldo pendiente",
      value: formatCurrency(metrics?.total_pending ?? 0),
      suffix: "",
      warn: (metrics?.total_pending ?? 0) > 0,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "24px 28px 0", background: "var(--bg)", flexShrink: 0 }}>
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between", marginBottom: 24,
        }}>
          <h1 style={{ fontSize: 25, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.5 }}>
            Ventas
          </h1>
          <button
            onClick={() => setShowNew(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              height: 34, padding: "7px 14px", background: "var(--brand)",
              borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: "#fff",
              transition: "background 0.12s ease",
            }}
          >
            <Plus size={14} />
            Nueva venta
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)" }}>
          {[
            { value: "ventas" as ActiveTab, label: "Ventas" },
            { value: "metricas" as ActiveTab, label: "Métricas" },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              style={{
                padding: "8px 14px", fontSize: 13.5,
                fontWeight: activeTab === tab.value ? 600 : 400,
                color: activeTab === tab.value ? "var(--brand)" : "var(--text-secondary)",
                borderBottom: activeTab === tab.value
                  ? "2px solid var(--brand)"
                  : "2px solid transparent",
                marginBottom: -1,
                transition: "background 0.12s ease",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {activeTab === "metricas" ? (
          <MetricsTab workspaceId={wid} />
        ) : (
          <div style={{ padding: "24px 28px" }}>
            {/* Summary cards */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 12,
              marginBottom: 24,
            }}>
              {summaryCards.map((card) => (
                <div
                  key={card.label}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <p style={{
                    fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 500,
                    marginBottom: 6,
                  }}>
                    {card.label}
                  </p>
                  <p style={{
                    fontSize: 22, fontWeight: 700, letterSpacing: -0.5,
                    color: card.warn ? "var(--amber)" : "var(--text-primary)",
                  }}>
                    {card.value}
                    {card.suffix && (
                      <span style={{ fontSize: 13.5, fontWeight: 400, color: "var(--text-tertiary)", marginLeft: 4 }}>
                        {card.suffix}
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>

            {/* Period filter */}
            <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  style={{
                    height: 32, padding: "7px 14px", borderRadius: 8,
                    fontSize: 12.5, fontWeight: period === p.value ? 600 : 500,
                    background: period === p.value ? "var(--brand)" : "var(--surface)",
                    color: period === p.value ? "#fff" : "var(--text-secondary)",
                    border: `1px solid ${period === p.value ? "var(--brand)" : "var(--border)"}`,
                    transition: "background 0.12s ease",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Table */}
            {isLoading ? (
              <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 13 }}>
                Cargando...
              </div>
            ) : sales.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "60px 20px",
                color: "var(--text-tertiary)", fontSize: 14,
              }}>
                No hay ventas en este período
              </div>
            ) : (
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                overflow: "hidden",
              }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Fecha", "Cliente", "Vendedor", "Productos", "Total", "Pagado", "Estado", ""].map(
                        (h) => <th key={h} style={TH_STYLE}>{h}</th>,
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale) => (
                      <SaleRow
                        key={sale.id}
                        sale={sale}
                        selected={selected?.id === sale.id}
                        onClick={() => setSelected(sale)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail side panel */}
      <SidePanel
        isOpen={!!selected}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <SaleDetailPanel
            sale={selected}
            onMarkPaid={() => markPaidMutation.mutate(selected.id)}
            onEdit={() => setEditingSale(selected)}
          />
        )}
      </SidePanel>

      {/* New sale modal */}
      <Modal
        isOpen={showNew}
        onClose={() => setShowNew(false)}
        title="Nueva venta"
        maxWidth={680}
      >
        {showNew && (
          <NewSaleModal
            onSuccess={handleNewSuccess}
            onCancel={() => setShowNew(false)}
          />
        )}
      </Modal>

      {/* Edit sale modal */}
      <Modal
        isOpen={editingSale !== null}
        onClose={() => setEditingSale(null)}
        title="Editar venta"
        maxWidth={560}
      >
        {editingSale && (
          <EditSaleModal
            sale={editingSale}
            onSuccess={() => {
              setEditingSale(null);
              invalidate();
              showToast("Venta actualizada", "success");
            }}
            onCancel={() => setEditingSale(null)}
          />
        )}
      </Modal>
    </div>
  );
}
