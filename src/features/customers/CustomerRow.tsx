import { MessageCircle } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import Avatar from "../../components/Avatar";
import { CUSTOMER_STATUSES, CUSTOMER_TYPES } from "../../lib/constants";
import type { Customer } from "../../lib/db/types";

function statusInfo(status: Customer["status"]) {
  return CUSTOMER_STATUSES.find((s) => s.value === status);
}

function typeLabel(type: Customer["type"]): string {
  return CUSTOMER_TYPES.find((t) => t.value === type)?.label ?? type;
}

interface CustomerRowProps {
  customer: Customer;
  selected: boolean;
  onPress: (customer: Customer) => void;
}

export default function CustomerRow({ customer, selected, onPress }: CustomerRowProps) {
  const status = statusInfo(customer.status);

  const handleWA = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!customer.phone) return;
    const clean = customer.phone.replace(/\D/g, "");
    openUrl(`https://wa.me/${clean}`).catch(() => {});
  };

  return (
    <tr
      className="hoverable"
      onClick={() => onPress(customer)}
      style={{ cursor: "pointer" }}
    >
      <td style={{ padding: "0 16px", height: 48 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={customer.name} size={30} imagePath={customer.avatar_path} />
          <span style={{
            fontSize: 14,
            fontWeight: 500,
            color: selected ? "var(--brand)" : "var(--text-primary)",
          }}>
            {customer.name}
          </span>
        </div>
      </td>
      <td style={{ padding: "0 16px" }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-tertiary)",
          background: "var(--surface-2)",
          padding: "2px 7px",
          borderRadius: 4,
        }}>
          {typeLabel(customer.type)}
        </span>
      </td>
      <td style={{ padding: "0 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: status?.color ?? "var(--text-tertiary)",
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {status?.label ?? customer.status}
          </span>
        </div>
      </td>
      <td style={{ padding: "0 16px" }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {customer.barrio ?? "—"}
        </span>
      </td>
      <td style={{ padding: "0 16px" }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
          {customer.phone ?? "—"}
        </span>
      </td>
      <td style={{ padding: "0 12px 0 16px" }}>
        {customer.phone && (
          <button
            onClick={handleWA}
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              background: "var(--green-bg)",
              color: "var(--green)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MessageCircle size={14} />
          </button>
        )}
      </td>
    </tr>
  );
}
