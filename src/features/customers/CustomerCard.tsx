import { MessageCircle } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import Avatar from "../../components/Avatar";
import { CUSTOMER_STATUSES, CUSTOMER_TYPES } from "../../lib/constants";
import type { Customer } from "../../lib/db/types";

function statusDot(status: Customer["status"]): string {
  return (
    CUSTOMER_STATUSES.find((s) => s.value === status)?.color ??
    "var(--text-tertiary)"
  );
}

function typeLabel(type: Customer["type"]): string {
  return CUSTOMER_TYPES.find((t) => t.value === type)?.label ?? type;
}

interface CustomerCardProps {
  customer: Customer;
  onPress: (customer: Customer) => void;
}

export default function CustomerCard({ customer, onPress }: CustomerCardProps) {
  const handleWA = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!customer.phone) return;
    const clean = customer.phone.replace(/\D/g, "");
    openUrl(`https://wa.me/${clean}`).catch(() => {});
  };

  return (
    <button
      onClick={() => onPress(customer)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        textAlign: "left",
        transition: "background 0.1s",
      }}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        <Avatar name={customer.name} size={40} />
        <div
          style={{
            position: "absolute",
            bottom: 1,
            right: 1,
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: statusDot(customer.status),
            border: "1.5px solid var(--surface)",
          }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 2,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {customer.name}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-tertiary)",
              background: "var(--surface-2)",
              padding: "1px 6px",
              borderRadius: 4,
              flexShrink: 0,
            }}
          >
            {typeLabel(customer.type)}
          </span>
        </div>
        {customer.barrio && (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {customer.barrio}
          </div>
        )}
      </div>

      {customer.phone && (
        <button
          onClick={handleWA}
          style={{
            flexShrink: 0,
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "var(--green-bg)",
            color: "var(--green)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MessageCircle size={15} />
        </button>
      )}
    </button>
  );
}
