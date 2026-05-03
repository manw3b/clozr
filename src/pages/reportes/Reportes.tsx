import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Users, ShoppingCart, DollarSign, Award, Package, Layers, AlertTriangle } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Card, MetricCard } from "../../components/Card";
import { Avatar } from "../../components/Avatar";
import { EmptyState } from "../../components/EmptyState";
import { salesDb } from "../../lib/db/sales";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useExchangeRateStore } from "../../store/exchangeRateStore";
import { color, radius, space, text, weight } from "../../tokens";
import { formatMoney } from "../../lib/format";
import { getTemplateImageUrl } from "../../lib/templates/productImageMap";

export function Reportes() {
  const { activeWorkspace } = useWorkspaceStore();
  const { usdToArs } = useExchangeRateStore();
  const wid = activeWorkspace?.id ?? "";

  const metricsQ = useQuery({
    queryKey: ["reportes", "metrics", wid],
    queryFn: () => salesDb.getSalesMetrics(wid),
    enabled: !!wid,
  });

  const marginQ = useQuery({
    queryKey: ["reportes", "margin", wid],
    queryFn: () => salesDb.getMarginMetrics(wid),
    enabled: !!wid,
  });

  const topCustomersQ = useQuery({
    queryKey: ["reportes", "top-customers", wid],
    queryFn: () => salesDb.getTopCustomers(wid, 8),
    enabled: !!wid,
  });

  const topProductsQ = useQuery({
    queryKey: ["reportes", "top-products", wid],
    queryFn: () => salesDb.getTopProducts(wid, 10, 6),
    enabled: !!wid,
  });

  const byCategoryQ = useQuery({
    queryKey: ["reportes", "by-category", wid],
    queryFn: () => salesDb.getMarginByCategory(wid, 6),
    enabled: !!wid,
  });

  const byVendorQ = useQuery({
    queryKey: ["reportes", "by-vendor-margin", wid],
    queryFn: () => salesDb.getMarginByVendor(wid),
    enabled: !!wid,
  });

  const byMonthQ = useQuery({
    queryKey: ["reportes", "by-month-margin", wid],
    queryFn: () => salesDb.getMarginByMonth(wid, 6),
    enabled: !!wid,
  });

  const margin = marginQ.data;
  const revenueDelta =
    margin && margin.revenue_last_month > 0
      ? ((margin.revenue_this_month - margin.revenue_last_month) / margin.revenue_last_month) * 100
      : null;
  const marginDelta =
    margin && margin.margin_last_month > 0
      ? ((margin.margin_this_month - margin.margin_last_month) / margin.margin_last_month) * 100
      : null;
  const marginPctDelta =
    margin && margin.margin_pct_last_month > 0
      ? margin.margin_pct_this_month - margin.margin_pct_last_month
      : null;

  const monthlyData = byMonthQ.data ?? [];
  const maxMonthly = Math.max(1, ...monthlyData.map((m) => m.revenue));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space[6] }}>
      <PageHeader title="Reportes" subtitle="Métricas del negocio · Todos los montos en USD" />

      {/* KPIs principales con foco en margen */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: space[3] }}>
        <MetricCard
          label="Facturado mes"
          value={margin ? formatMoney(margin.revenue_this_month, "USD") : "—"}
          delta={
            revenueDelta !== null
              ? {
                  value: `${revenueDelta >= 0 ? "↑" : "↓"} ${Math.abs(revenueDelta).toFixed(1)}% vs mes ant.`,
                  tone: revenueDelta >= 0 ? "success" : "danger",
                }
              : undefined
          }
          icon={<DollarSign size={16} />}
        />
        <MetricCard
          label="Margen mes"
          value={margin ? formatMoney(margin.margin_this_month, "USD") : "—"}
          delta={
            marginDelta !== null
              ? {
                  value: `${marginDelta >= 0 ? "↑" : "↓"} ${Math.abs(marginDelta).toFixed(1)}% vs mes ant.`,
                  tone: marginDelta >= 0 ? "success" : "danger",
                }
              : undefined
          }
          tone="success"
          icon={<TrendingUp size={16} />}
        />
        <MetricCard
          label="% Margen"
          value={margin ? `${margin.margin_pct_this_month.toFixed(1)}%` : "—"}
          delta={
            marginPctDelta !== null
              ? {
                  value: `${marginPctDelta >= 0 ? "↑" : "↓"} ${Math.abs(marginPctDelta).toFixed(1)}pp`,
                  tone: marginPctDelta >= 0 ? "success" : "danger",
                }
              : undefined
          }
          icon={<TrendingUp size={16} />}
        />
        <MetricCard
          label="Ticket promedio"
          value={metricsQ.data ? formatMoney(metricsQ.data.avg_ticket, "USD") : "—"}
          icon={<ShoppingCart size={16} />}
        />
      </div>

      {/* Warning de productos sin costo cargado */}
      {margin && margin.uncosted_revenue_this_month > 0 && (
        <div
          style={{
            background: color.warningBg,
            border: `1px solid ${color.warning}`,
            borderRadius: radius.md,
            padding: space[3],
            display: "flex",
            alignItems: "center",
            gap: space[3],
          }}
        >
          <AlertTriangle size={18} color={color.warning} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
              {formatMoney(margin.uncosted_revenue_this_month, "USD")} facturado este mes sin costo cargado
            </div>
            <div style={{ fontSize: text.xs, color: color.textMuted, marginTop: 2 }}>
              El margen real puede ser mayor. Cargá el costo de esos productos en Ajustes → Precios del catálogo.
            </div>
          </div>
        </div>
      )}

      {/* Tip sobre cotización */}
      {(!usdToArs || usdToArs <= 0) && (
        <div
          style={{
            fontSize: text.xs,
            color: color.textMuted,
            fontStyle: "italic",
          }}
        >
          Tip: cargá la cotización USD→ARS en el chip del topbar para ver equivalencias en reportes.
        </div>
      )}

      {/* Tendencia 6 meses: revenue + margin overlay */}
      <Card padding={5}>
        <div style={{ marginBottom: space[4], display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2
            style={{
              margin: 0,
              fontSize: text.lg,
              fontWeight: weight.bold,
              color: color.text,
              letterSpacing: "-0.2px",
            }}
          >
            Tendencia últimos 6 meses
          </h2>
          <div style={{ display: "flex", gap: space[3], fontSize: text.xs, color: color.textMuted }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: color.surface2, border: `1px solid ${color.border}` }} />
              Facturado
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: color.success }} />
              Margen
            </span>
          </div>
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
              height: 220,
            }}
          >
            {monthlyData.map((bucket, idx) => {
              const isLast = idx === monthlyData.length - 1;
              const revenuePct = (bucket.revenue / maxMonthly) * 100;
              const marginPct = (bucket.margin / maxMonthly) * 100;
              const [year, monthN] = bucket.month.split("-");
              const monthName = new Date(Number(year), Number(monthN) - 1).toLocaleDateString("es-AR", {
                month: "short",
              });
              return (
                <div
                  key={bucket.month}
                  title={`${monthName} ${year} — facturado ${formatMoney(bucket.revenue, "USD")} · margen ${formatMoney(bucket.margin, "USD")}`}
                  style={{ display: "flex", flexDirection: "column", height: "100%", gap: space[2] }}
                >
                  <div
                    style={{
                      flex: 1,
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                    }}
                  >
                    {/* Bar revenue (gris, fondo) */}
                    <div
                      style={{
                        height: `${revenuePct}%`,
                        minHeight: 4,
                        background: isLast ? color.surfaceHover : color.surface2,
                        border: `1px solid ${color.border}`,
                        borderRadius: 4,
                        transition: "height 400ms",
                        position: "relative",
                      }}
                    >
                      {/* Bar margin (verde, dentro del revenue) */}
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: `${(marginPct / Math.max(0.01, revenuePct)) * 100}%`,
                          background: color.success,
                          borderRadius: 3,
                          transition: "height 400ms",
                        }}
                      />
                    </div>
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

      {/* Top productos */}
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
            <Package size={16} color={color.primary} />
            Top productos · últimos 6 meses
          </h2>
        </div>
        {(topProductsQ.data ?? []).length === 0 ? (
          <EmptyState size="compact" title="Sin ventas todavía" description="Registrá ventas con productos del catálogo." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "44px 1fr 80px 110px 110px 90px",
                gap: space[3],
                padding: `${space[2]} ${space[3]}`,
                fontSize: text.xs,
                fontWeight: weight.semibold,
                color: color.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.6px",
                borderBottom: `1px solid ${color.border}`,
              }}
            >
              <span></span>
              <span>Producto</span>
              <span style={{ textAlign: "right" }}>Unid.</span>
              <span style={{ textAlign: "right" }}>Facturado</span>
              <span style={{ textAlign: "right" }}>Margen</span>
              <span style={{ textAlign: "right" }}>%</span>
            </div>
            {topProductsQ.data!.map((p) => {
              const img = getTemplateImageUrl(p.image_path);
              const hasMargin = p.cost > 0;
              return (
                <div
                  key={p.catalog_item_id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr 80px 110px 110px 90px",
                    gap: space[3],
                    padding: `${space[2]} ${space[3]}`,
                    alignItems: "center",
                    borderBottom: `1px solid ${color.border}`,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      background: color.surface2,
                      borderRadius: radius.sm,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    {img ? (
                      <img src={img} alt={p.name} style={{ width: "85%", height: "85%", objectFit: "contain" }} />
                    ) : (
                      <Package size={16} color={color.textDim} />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: text.sm,
                        fontWeight: weight.semibold,
                        color: color.text,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.name}
                    </div>
                    {p.category && (
                      <div style={{ fontSize: text.xs, color: color.textMuted }}>{p.category}</div>
                    )}
                  </div>
                  <span style={{ fontSize: text.sm, color: color.text, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {p.units_sold}
                  </span>
                  <span style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {formatMoney(p.revenue, "USD")}
                  </span>
                  <span
                    style={{
                      fontSize: text.sm,
                      fontWeight: weight.semibold,
                      color: hasMargin ? color.success : color.textDim,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {hasMargin ? formatMoney(p.margin, "USD") : "—"}
                  </span>
                  <span
                    style={{
                      fontSize: text.sm,
                      fontWeight: weight.semibold,
                      color: hasMargin ? (p.margin_pct >= 0 ? color.success : color.danger) : color.textDim,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {hasMargin ? `${p.margin_pct.toFixed(0)}%` : "s/c"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Por categoría */}
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
            <Layers size={16} color={color.primary} />
            Por categoría · últimos 6 meses
          </h2>
        </div>
        {(byCategoryQ.data ?? []).length === 0 ? (
          <EmptyState size="compact" title="Sin ventas todavía" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
            {byCategoryQ.data!.map((c) => {
              const hasMargin = c.cost > 0;
              return (
                <div
                  key={c.category}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 80px 120px 120px 80px",
                    gap: space[3],
                    padding: `${space[2]} ${space[3]}`,
                    background: color.surface2,
                    borderRadius: radius.md,
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
                    {c.category}
                  </div>
                  <div style={{ fontSize: text.xs, color: color.textMuted, textAlign: "right" }}>
                    {c.units_sold} unid
                  </div>
                  <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {formatMoney(c.revenue, "USD")}
                  </div>
                  <div
                    style={{
                      fontSize: text.sm,
                      fontWeight: weight.semibold,
                      color: hasMargin ? color.success : color.textDim,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {hasMargin ? formatMoney(c.margin, "USD") : "—"}
                  </div>
                  <div
                    style={{
                      fontSize: text.sm,
                      fontWeight: weight.semibold,
                      color: hasMargin ? color.success : color.textDim,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {hasMargin ? `${c.margin_pct.toFixed(0)}%` : "s/c"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Top clientes + Por vendedor */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: space[4] }}>
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
                  <div style={{ fontSize: text.sm, fontWeight: weight.bold, color: color.text, fontVariantNumeric: "tabular-nums" }}>
                    {formatMoney(c.total_spent, "USD")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

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
              {byVendorQ.data!.map((v) => {
                const hasMargin = v.cost > 0;
                return (
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
                        {v.sales_count} ventas
                        {hasMargin && ` · margen ${v.margin_pct.toFixed(0)}%`}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: text.sm, fontWeight: weight.bold, color: color.text, fontVariantNumeric: "tabular-nums" }}>
                        {formatMoney(v.revenue, "USD")}
                      </div>
                      {hasMargin && (
                        <div style={{ fontSize: 11, color: color.success, fontWeight: weight.semibold, fontVariantNumeric: "tabular-nums" }}>
                          +{formatMoney(v.margin, "USD")}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Footer hint */}
      {metricsQ.data && metricsQ.data.total_pending > 0 && (
        <div
          style={{
            fontSize: text.xs,
            color: color.textMuted,
            display: "inline-flex",
            alignItems: "center",
            gap: space[2],
          }}
        >
          <TrendingDown size={12} />
          Saldo pendiente total: {formatMoney(metricsQ.data.total_pending, "USD")} · ver Deudas para detalle.
        </div>
      )}
    </div>
  );
}
