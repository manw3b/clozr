import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronDown } from "lucide-react";
import { CUSTOMER_STATUSES } from "../../lib/constants";
import ImageUpload from "../../components/ui/ImageUpload";
import type { Customer, CreateCustomerInput, CustomerTypeRow } from "../../lib/db/types";

const schema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  phone: z.string().optional().nullable(),
  email: z
    .string()
    .optional()
    .nullable()
    .refine((v) => !v || z.string().email().safeParse(v).success, "Email inválido"),
  type: z.string().min(1, "Seleccioná un tipo"),
  status: z.enum(["activo", "potencial", "dormido", "perdido"]),
  notes: z.string().optional().nullable(),
  barrio: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  pricing_type: z.enum(["none", "percentage", "volume"]),
});

type FormValues = z.infer<typeof schema>;

function inputCss(error: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    background: "var(--surface-2)",
    border: `1px solid ${error ? "var(--brand)" : "var(--border-strong)"}`,
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
  };
}

function selectCss(): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    background: "var(--surface-2)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
    appearance: "none",
  };
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
      {children}
    </label>
  );
}

interface CustomerFormProps {
  initial?: Customer;
  customerTypes: CustomerTypeRow[];
  onSubmit: (data: CreateCustomerInput) => Promise<unknown>;
  onCancel: () => void;
}

export default function CustomerForm({ initial, customerTypes, onSubmit, onCancel }: CustomerFormProps) {
  const [showExtra, setShowExtra] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(initial?.avatar_path ?? null);

  const stableId = useRef(initial?.id ?? crypto.randomUUID());

  const pricing_type = initial?.pricing_policy_json
    ? (JSON.parse(initial.pricing_policy_json) as { type: string }).type
    : "none";

  const defaultType = initial?.type ?? customerTypes[0]?.id ?? "final";

  const { register, handleSubmit, formState: { errors }, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? "",
      phone: initial?.phone ?? "",
      email: initial?.email ?? "",
      type: defaultType,
      status: initial?.status ?? "potencial",
      notes: initial?.notes ?? "",
      barrio: initial?.barrio ?? "",
      address: initial?.address ?? "",
      pricing_type: (pricing_type as FormValues["pricing_type"]) ?? "none",
    },
  });

  const nameValue = watch("name");

  const handle = async (values: FormValues) => {
    setSubmitting(true);
    const pricingPolicy = values.pricing_type !== "none" ? JSON.stringify({ type: values.pricing_type }) : null;
    await onSubmit({
      name: values.name,
      phone: values.phone || null,
      email: values.email || null,
      type: values.type,
      status: values.status,
      notes: values.notes || null,
      barrio: values.barrio || null,
      address: values.address || null,
      pricing_policy_json: pricingPolicy,
      avatar_path: avatarPath,
    });
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit(handle)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Avatar */}
      <div style={{ display: "flex", justifyContent: "center", paddingBottom: 4 }}>
        <ImageUpload
          category="customers"
          entityId={stableId.current}
          currentPath={avatarPath}
          onImageSelected={setAvatarPath}
          onImageRemoved={() => setAvatarPath(null)}
          size="md"
          shape="circle"
          placeholder={nameValue?.charAt(0)?.toUpperCase() || "?"}
        />
      </div>

      <div>
        <Label>Nombre *</Label>
        <input {...register("name")} style={inputCss(!!errors.name)} />
        {errors.name && <p style={{ color: "var(--brand-light)", fontSize: 11, marginTop: 4 }}>{errors.name.message}</p>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <Label>Teléfono</Label>
          <input {...register("phone")} placeholder="+54 9 11..." style={inputCss(false)} />
        </div>
        <div>
          <Label>Email</Label>
          <input {...register("email")} placeholder="@" style={inputCss(!!errors.email)} />
          {errors.email && <p style={{ color: "var(--brand-light)", fontSize: 11, marginTop: 4 }}>{errors.email.message}</p>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <Label>Tipo</Label>
          <div style={{ position: "relative" }}>
            <select {...register("type")} style={selectCss()}>
              {customerTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
              {customerTypes.length === 0 && (
                <>
                  <option value="final">Final</option>
                  <option value="revendedor">Revendedor</option>
                  <option value="mayorista">Mayorista</option>
                  <option value="empresa">Empresa</option>
                </>
              )}
            </select>
            <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)", pointerEvents: "none" }} />
          </div>
        </div>
        <div>
          <Label>Estado</Label>
          <div style={{ position: "relative" }}>
            <select {...register("status")} style={selectCss()}>
              {CUSTOMER_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)", pointerEvents: "none" }} />
          </div>
        </div>
      </div>

      <div>
        <Label>Notas</Label>
        <textarea {...register("notes")} rows={2} style={{ ...inputCss(false), resize: "none" }} />
      </div>

      <button
        type="button"
        onClick={() => setShowExtra(!showExtra)}
        style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-secondary)", fontSize: 13, padding: "4px 0" }}
      >
        <ChevronDown size={14} style={{ transform: showExtra ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        {showExtra ? "Ocultar" : "Más campos"}
      </button>

      {showExtra && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <Label>Barrio</Label>
              <input {...register("barrio")} style={inputCss(false)} />
            </div>
            <div>
              <Label>Dirección</Label>
              <input {...register("address")} style={inputCss(false)} />
            </div>
          </div>
          <div>
            <Label>Política de precios</Label>
            <div style={{ position: "relative" }}>
              <select {...register("pricing_type")} style={selectCss()}>
                <option value="none">Sin política</option>
                <option value="percentage">Descuento porcentual</option>
                <option value="volume">Descuento por volumen</option>
              </select>
              <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)", pointerEvents: "none" }} />
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button type="button" onClick={onCancel}
          style={{ flex: 1, padding: "12px", background: "var(--surface-2)", borderRadius: 10, fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>
          Cancelar
        </button>
        <button type="submit" disabled={submitting}
          style={{
            flex: 2, padding: "12px",
            background: submitting ? "var(--surface-3)" : "var(--brand)",
            borderRadius: 10, fontSize: 14, fontWeight: 600,
            color: submitting ? "var(--text-tertiary)" : "#fff",
            cursor: submitting ? "not-allowed" : "pointer",
            transition: "background 0.15s",
          }}>
          {submitting ? "Guardando..." : initial ? "Guardar cambios" : "Crear cliente"}
        </button>
      </div>
    </form>
  );
}
