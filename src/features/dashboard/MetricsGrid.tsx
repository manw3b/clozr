import { MetricSkeleton } from "../../components/Skeleton";
import { formatCurrency } from "../../lib/hooks";

interface Metric {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}

interface MetricsGridProps {
  metrics: Metric[];
  loading: boolean;
}

export default function MetricsGrid({ metrics, loading }: MetricsGridProps) {
  if (loading) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        {[...Array(4)].map((_, i) => (
          <MetricSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
      }}
    >
      {metrics.map((m) => (
        <div
          key={m.label}
          style={{
            padding: "14px 16px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--text-tertiary)",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.4px",
              marginBottom: 6,
            }}
          >
            {m.label}
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: m.accent ?? "var(--text-primary)",
              letterSpacing: -0.5,
              lineHeight: 1.1,
            }}
          >
            {m.value}
          </div>
          {m.sub && (
            <div
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                marginTop: 3,
              }}
            >
              {m.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function buildMetrics(
  customerCount: number,
  pipelineCount: number,
  pendingTaskCount: number,
  monthSales: number,
): Metric[] {
  return [
    { label: "Clientes", value: customerCount },
    {
      label: "Pipeline activo",
      value: pipelineCount,
      accent: pipelineCount > 0 ? "var(--blue)" : undefined,
    },
    {
      label: "Tareas pendientes",
      value: pendingTaskCount,
      accent: pendingTaskCount > 0 ? "var(--amber)" : undefined,
    },
    {
      label: "Ventas del mes",
      value: formatCurrency(monthSales),
      accent: monthSales > 0 ? "var(--green)" : undefined,
    },
  ];
}
