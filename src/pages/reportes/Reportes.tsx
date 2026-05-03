import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Users, ShoppingCart, DollarSign, Award } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Card, MetricCard } from "../../components/Card";
import { Avatar } from "../../components/Avatar";
import { EmptyState } from "../../components/EmptyState";
import { salesDb } from "../../lib/db/sales";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { color, space, text, weight } from "../../tokens";
import { formatMoney } from "../../lib/format";

export function Reportes() {
  const { activeWorkspace } = useWorkspaceStore();
  const wid = activeWorkspace?.id ?? "";

  const metricsQ = useQuery({
    queryKey: ["reportes", "metrics", wid],
    queryFn: () => salesDb.getSalesMetrics(wid),
    enabled: !!wid,
  });

  const topCustomersQ = useQuery({
    queryKey: ["reportes", "top-customers", wid],
    queryFn: () => salesDb.getTopCustomers(wid, 8),
    enabled: !!wid,
  });

  const byVendorQ = useQuery({
    queryKey: ["reportes", "by-vendor", wid],
    queryFn: () => salesDb.getSalesByVendor(wid),
    enabled: !!wid,
  });

  const byMonthQ = useQuery({
    queryKey: ["reportes", "by-month", wid],
    queryFn: () => salesDb.getSalesByMonth(wid, 6),
    enabled: !!wid,
  });

  const m = metricsQ.data;
  const monthDelta =
    m && m.last_month > 0
      ? ((m.this_month - m.last_month) / m.last_month) * 100
      : null;

  const monthlyData = byMonthQ.data ?? [];
  const maxRevenue = Math.max(1, ...monthlyData.map((m) => m.revenue));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space[6] }}>
      <PageHeader title="Reportes" subtitle="Métricas del negocio" />

      {/* Top metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: space[3] }}>
        <MetricCard
          label="Facturado mes actual"
          value={m ? formatMoney(m.this_month) : "—"}
          delta={
            monthDelta !== null
              ? {
                  value: `${monthDelta >= 0 ? "↑" : "↓"} ${Math.abs(monthDelta).toFixed(1)}% vs mes ant.`,
                  tone: monthDelta >= 0 ? "success" : "danger",
                }
              : undefined
          }
          icon={<DollarSign size={16} />}
        />
        <MetricCard
          label="Ventas mes actual"
          value={m ? String(m.month_sales_count) : "—"}
          unit="ventas"
          icon={<ShoppingCart size={16} />}
        />
        <MetricCard
          label="Ticket promedio"
          value={m ? formatMoney(m.avg_ticket) : "—"}
          icon={<TrendingUp size={16} />}
        />
        <MetricCard
          label="Saldo pendiente"
          value={m ? formatMoney(m.total_pending) : "—"}
          tone={m && m.total_pending > 0 ? "warning" : "neutral"}
          icon={<TrendingDown size={16} />}
        />
      </div>

      {/* Monthly chart */}
      <Card padding={5}>
        <div style={{ marginBottom: space[4] }}>
          <h2
            style={{
              margin: 0,
              fontSize: text.lg,
              fontWeight: weight.bold,
              color: color.text,
              letterSpacing: "-0.2px",
            }}
          >
            Facturación últimos 6 meses
          </h2>
        </div>

        {monthlyData.length === 0 ? (
          <EmptyState
            size="compact"
            title="Sin datos suficientes"
            description="Necesitás algunas ventas para ver el gráfico."
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${monthlyData.length}, 1fr)`,
              gap: space[3],
              alignItems: "end",
              height: 200,
            }}
          >
            {monthlyData.map((bucket, idx) => {
              const isLast = idx === monthlyData.length - 1;
              const heightPct = (bucket.revenue / maxRevenue) * 100;
              const [year, month] = bucket.month.split("-");
              const monthName = new Date(Number(year), Number(month) - 1).toLocaleDateString("es-AR", {
                month: "short",
              });
              return (
                <div
                  key={bucket.month}
                  title={`${monthName} ${year} — ${formatMoney(bucket.revenue)} (${bucket.sales_count} ventas)`}
                  style={{ display: "flex", flexDirection: "column", height: "100%", gap: space[2] }}
                >
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                    }}
                  >
                    <div
                      style={{
                        height: `${heightPct}%`,
                        minHeight: 4,
                        background: isLast ? color.primary : color.surface2,
                        borderRadius: 4,
                        transition: "height 400ms",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: text.xs,
                      color: color.textMuted,
                      textTransform: "capitalize",
                    }}
                  >
                    {monthName}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: space[4] }}>
        {/* Top customers */}
        <Card padding={5}>
          <div style={{ marginBottom: space[4] }}>
            <h2
              style={{
                margin: 0,
                fontSize: text.lg,
                fontWeight: weight.bold,
                color: color.text,
                letterSpacing: "-0.2px",
                display: "flex",
                alignItems: "center",
                gap: space[2],
              }}
            >
              <Award size={16} color={color.primary} />
              Top clientes
            </h2>
          </div>
          {(topCustomersQ.data ?? []).length === 0 ? (
            <EmptyState size="compact" title="Sin ventas todavía" description="Agregá una venta para ver el ranking." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
              {topCustomersQ.data!.map((c, i) => (
                <div
                  key={c.customer_id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: space[3],
                    padding: `${space[2]} ${space[3]}`,
                    borderRadius: 8,
                    background: i === 0 ? color.primaryBg : "transparent",
                  }}
                >
                  <span
                    style={{
                      fontSize: text.xs,
                      fontWeight: weight.semibold,
                      color: i === 0 ? color.primary : color.textMuted,
                      width: 18,
                    }}
                  >
                    #{i + 1}
                  </span>
                  <Avatar name={c.customer_name ?? "—"} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: text.sm,
                        fontWeight: weight.medium,
                        color: color.text,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.customer_name ?? "Sin cliente"}
                    </div>
                    <div style={{ fontSize: text.xs, color: color.textMuted }}>
                      {c.purchases} compra{c.purchases === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div style={{ fontSize: text.sm, fontWeight: weight.bold, color: color.text }}>
                    {formatMoney(c.total_spent)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* By vendor */}
        <Card padding={5}>
          <div style={{ marginBottom: space[4] }}>
            <h2
              style={{
                margin: 0,
                fontSize: text.lg,
                fontWeight: weight.bold,
                color: color.text,
                letterSpacing: "-0.2px",
                display: "flex",
                alignItems: "center",
                gap: space[2],
              }}
            >
              <Users size={16} color={color.primary} />
              Por vendedor
            </h2>
          </div>
          {(byVendorQ.data ?? []).length === 0 ? (
            <EmptyState size="compact" title="Sin datos" description="Asigná un vendedor a las ventas." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
              {byVendorQ.data!.map((v) => (
                <div
                  key={v.seller_id ?? "no-seller"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: space[3],
                    padding: `${space[2]} ${space[3]}`,
                    borderRadius: 8,
                  }}
                >
                  <Avatar name={v.seller_name ?? "Sin asignar"} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: text.sm,
                        fontWeight: weight.medium,
                        color: color.text,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {v.seller_name ?? "Sin asignar"}
                    </div>
                    <div style={{ fontSize: text.xs, color: color.textMuted }}>
                      {v.sales_count} ventas · {formatMoney(v.avg_ticket)} prom.
                    </div>
                  </div>
                  <div style={{ fontSize: text.sm, fontWeight: weight.bold, color: color.text }}>
                    {formatMoney(v.total_revenue)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
