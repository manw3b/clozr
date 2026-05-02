import { getInactiveDays } from "../../lib/hooks";
import { INACTIVE_WARNING_DAYS, INACTIVE_CRITICAL_DAYS } from "../../lib/constants";
import type { PipelineItem } from "../../lib/db/types";

interface PipelineCardProps {
  item: PipelineItem;
  selected: boolean;
  onPress: (item: PipelineItem) => void;
}

export default function PipelineCard({ item, selected, onPress }: PipelineCardProps) {
  const days = getInactiveDays(item.last_activity_at, item.created_at);
  const warn = days > INACTIVE_WARNING_DAYS;
  const critical = days > INACTIVE_CRITICAL_DAYS;

  return (
    <button
      onClick={() => onPress(item)}
      style={{
        width: "100%",
        padding: "12px 14px",
        background: selected ? "var(--surface-3)" : "var(--surface)",
        border: `1px solid ${selected ? "var(--brand)" : "var(--border)"}`,
        borderRadius: 10,
        textAlign: "left",
        cursor: "pointer",
        transition: "background 0.1s, border-color 0.1s",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = "var(--surface-2)";
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = "var(--surface)";
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-primary)",
          lineHeight: 1.3,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {item.customer_name ?? "Sin nombre"}
        </span>
        {warn && (
          <span style={{
            padding: "2px 6px",
            borderRadius: 5,
            fontSize: 10,
            fontWeight: 700,
            background: critical ? "var(--red-bg)" : "var(--amber-bg)",
            color: critical ? "var(--brand-light)" : "var(--amber)",
            flexShrink: 0,
          }}>
            {days}d
          </span>
        )}
      </div>

      {item.estimated_value != null && (
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
          ${item.estimated_value.toLocaleString("es-AR")} {item.currency}
        </div>
      )}
    </button>
  );
}
