import { MessageCircle, Pencil, Trash2, Phone, Mail, MapPin } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import Avatar from "../../components/Avatar";
import { CUSTOMER_STATUSES, CUSTOMER_TYPES } from "../../lib/constants";
import type { Customer } from "../../lib/db/types";

function InfoRow({
  icon,
  value,
}: {
  icon: React.ReactNode;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 14, color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

interface CustomerDetailViewProps {
  customer: Customer;
  onEdit: () => void;
  onDelete: () => void;
}

export default function CustomerDetailView({
  customer,
  onEdit,
  onDelete,
}: CustomerDetailViewProps) {
  const statusInfo = CUSTOMER_STATUSES.find((s) => s.value === customer.status);
  const typeInfo = CUSTOMER_TYPES.find((t) => t.value === customer.type);

  const handleWA = () => {
    if (!customer.phone) return;
    const clean = customer.phone.replace(/\D/g, "");
    openUrl(`https://wa.me/${clean}`).catch(() => {});
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Avatar name={customer.name} size={52} imagePath={customer.avatar_path} />
        <div style={{ flex: 1 }}>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: -0.3,
            }}
          >
            {customer.name}
          </h2>
          <div
            style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 5 }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 5,
                background: "var(--surface-3)",
                color: "var(--text-secondary)",
              }}
            >
              {typeInfo?.label ?? customer.type}
            </span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                color: statusInfo?.color ?? "var(--text-tertiary)",
                fontWeight: 500,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: statusInfo?.color ?? "var(--text-tertiary)",
                }}
              />
              {statusInfo?.label ?? customer.status}
            </span>
          </div>
        </div>
      </div>

      <div>
        <InfoRow icon={<Phone size={14} />} value={customer.phone} />
        <InfoRow icon={<Mail size={14} />} value={customer.email} />
        <InfoRow
          icon={<MapPin size={14} />}
          value={[customer.barrio, customer.address].filter(Boolean).join(" — ")}
        />
      </div>

      {customer.notes && (
        <div
          style={{
            padding: "10px 12px",
            background: "var(--surface-2)",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}
        >
          {customer.notes}
        </div>
      )}

      <div
        style={{
          padding: "12px 14px",
          background: "var(--surface-2)",
          borderRadius: 8,
          fontSize: 13,
        }}
      >
        <span style={{ color: "var(--text-tertiary)" }}>Compras totales: </span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
          ${customer.total_sales.toLocaleString("es-AR")}
        </span>
      </div>

      <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
        {customer.phone && (
          <button
            onClick={handleWA}
            style={{
              flex: 1,
              padding: "11px",
              background: "var(--green-bg)",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--green)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            <MessageCircle size={16} />
            WhatsApp
          </button>
        )}
        <button
          onClick={onEdit}
          style={{
            flex: 1,
            padding: "11px",
            background: "var(--blue-bg)",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            color: "var(--blue)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
          }}
        >
          <Pencil size={16} />
          Editar
        </button>
        <button
          onClick={onDelete}
          style={{
            width: 42,
            padding: "11px",
            background: "var(--red-bg)",
            borderRadius: 10,
            color: "var(--brand-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
