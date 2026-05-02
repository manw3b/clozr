import { useQuery } from "@tanstack/react-query";
import { salesDb } from "../../lib/db/sales";
import { formatCurrency, formatDate } from "../../lib/hooks";
import type { MonthlyRevenue } from "../../lib/db/types";

const MONTH_ABBR = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function monthAbbr(monthStr: string): string {
  const idx = parseInt(monthStr.split("-")[1], 10) - 1;
  return MONTH_ABBR[idx] ?? monthStr;
}

function BarChart({ data }: { data: MonthlyRevenue[] }) {
  if (data.length === 0) {
    return (
      <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
        Sin datos
      </div>
    );
  }

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const CHART_HEIGHT = 160;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: CHART_HEIGHT }}>
        {data.map((d) => {
          const barHeight = Math.max(4, (d.revenue / maxRevenue) * CHART_HEIGHT);
          const isCurrent = d.month === currentMonth;
          return (
            <div
              key={d.month}
              title={`${monthAbbr(d.month)}: ${formatCurrency(d.revenue)}`}
              style={{
                flex: 1,
                height: barHeight,
                background: isCurrent ? "var(--brand)" : "var(--surface-3)",
                borderRadius: "4px 4px 0 0",
                cursor: "default",
                transition: "background 0.15s",
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        {data.map((d) => (
          <div
            key={d.month}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 10,
              color: d.month === currentMonth ? "var(--brand)" : "var(--text-tertiary)",
              fontWeight: d.month === currentMonth ? 600 : 400,
            }}
          >
            {monthAbbr(d.month)}
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  workspaceId: string;
}

export default function MetricsTab({ workspaceId }: Props) {
  const wid = workspaceId;

  const { data: metrics } = useQuery({
    queryKey: ["sales-metrics", wid],
    queryFn: () => salesDb.getSalesMetrics(wid),
    enabled: !!wid,
  });

  const { data: monthlyData = [] } = useQuery({
    queryKey: ["sales-by-month", wid],
    queryFn: () => salesDb.getSalesByMonth(wid, 6),
    enabled: !!wid,
  });

  const { data: topCustomers = [] } = useQuery({
    queryKey: ["top-customers", wid],
    queryFn: () => salesDb.getTopCustomers(wid, 10),
    enabled: !!wid,
  });

  const { data: vendorStats = [] } = useQuery({
    queryKey: ["sales-by-vendor", wid],
    queryFn: () => salesDb.getSalesByVendor(wid),
    enabled: !!wid,
  });

  const variacion =
    metrics && metrics.last_month > 0
      ? ((metrics.this_month - metrics.last_month) / metrics.last_month) * 100
      : null;

  const sectionTitle = (txt: string) => (
    <p style={{
      fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)",
      textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12,
    }}>
      {txt}
    </p>
  );

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    borderBottom: "1px solid var(--border)",
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 13,
    color: "var(--text-primary)",
    borderBottom: "1px solid var(--border)",
  };

  return (
    <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
      {/* Left column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* KPIs */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
          {sectionTitle("Resumen general")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Total ventas", value: String(metrics?.total_sales ?? 0) },
              { label: "Total facturado", value: formatCurrency(metrics?.total_revenue ?? 0) },
              { label: "Ticket promedio", value: formatCurrency(metrics?.avg_ticket ?? 0) },
              {
                label: "Vs. mes anterior",
                value: variacion !== null
                  ? `${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)}%`
                  : "—",
                color: variacion !== null
                  ? variacion >= 0 ? "var(--green)" : "var(--brand)"
                  : "var(--text-tertiary)",
              },
            ].map((kpi) => (
              <div key={kpi.label} style={{ background: "var(--surface-2)", borderRadius: 8, padding: "10px 12px" }}>
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>{kpi.label}</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: kpi.color ?? "var(--text-primary)", letterSpacing: -0.3 }}>
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bar chart */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
          {sectionTitle("Últimos 6 meses")}
          <BarChart data={monthlyData} />
        </div>
      </div>

      {/* Right column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Top customers */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px 0" }}>
            {sectionTitle("Mejores clientes")}
          </div>
          {topCustomers.length === 0 ? (
            <p style={{ padding: "16px", fontSize: 13, color: "var(--text-tertiary)" }}>Sin datos</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Cliente</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Compras</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map((c, i) => (
                  <tr key={c.customer_id}>
                    <td style={{ ...tdStyle, color: "var(--text-tertiary)", width: 32 }}>{i + 1}</td>
                    <td style={tdStyle}>
                      <p style={{ fontWeight: 500 }}>{c.customer_name ?? "—"}</p>
                      <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
                        Última: {formatDate(c.last_purchase)}
                      </p>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {formatCurrency(c.total_spent)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {c.purchases}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* By vendor */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px 0" }}>
            {sectionTitle("Por vendedor")}
          </div>
          {vendorStats.length === 0 ? (
            <p style={{ padding: "16px", fontSize: 13, color: "var(--text-tertiary)" }}>Sin datos</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Vendedor</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Ventas</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Ticket</th>
                </tr>
              </thead>
              <tbody>
                {vendorStats.map((v, i) => (
                  <tr key={v.seller_id ?? i}>
                    <td style={tdStyle}>{v.seller_name ?? "Sin vendedor"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: "var(--text-secondary)" }}>{v.sales_count}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {formatCurrency(v.total_revenue)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {formatCurrency(v.avg_ticket)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
