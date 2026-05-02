import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Select from "../../components/ui/Select";
import DatePicker from "../../components/ui/DatePicker";
import type { CreateTaskInput, TaskFrequency } from "../../lib/db/types";

const FREQUENCY_OPTIONS: Array<{ value: TaskFrequency; label: string }> = [
  { value: "diaria", label: "Todos los días" },
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
  { value: "anual", label: "Anual" },
  { value: "custom", label: "Personalizada" },
];

const WEEKDAYS: Array<{ key: string; label: string }> = [
  { key: "mon", label: "L" },
  { key: "tue", label: "M" },
  { key: "wed", label: "M" },
  { key: "thu", label: "J" },
  { key: "fri", label: "V" },
  { key: "sat", label: "S" },
  { key: "sun", label: "D" },
];

export function formatFrequencyLabel(frequency: TaskFrequency | null, customDays: string | null): string {
  if (!frequency) return "";
  switch (frequency) {
    case "diaria": return "Todos los días";
    case "semanal": return "Semanal";
    case "mensual": return "Mensual";
    case "anual": return "Anual";
    case "custom": {
      if (!customDays) return "Personalizada";
      try {
        const days: string[] = JSON.parse(customDays);
        const labels: Record<string, string> = {
          mon: "Lun", tue: "Mar", wed: "Mié", thu: "Jue",
          fri: "Vie", sat: "Sáb", sun: "Dom",
        };
        return days.map((d) => labels[d] ?? d).join(", ") || "Personalizada";
      } catch {
        return "Personalizada";
      }
    }
  }
}

const schema = z
  .object({
    title: z.string().min(1, "El título es requerido"),
    type: z.enum(["rutina", "puntual"]),
    frequency: z
      .enum(["diaria", "semanal", "mensual", "anual", "custom"])
      .nullable(),
    custom_days: z.array(z.string()),
    due_date: z.string().nullable(),
  })
  .refine((v) => v.type !== "rutina" || v.frequency !== null, {
    message: "La frecuencia es requerida",
    path: ["frequency"],
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
    boxSizing: "border-box",
  };
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "block",
        color: "var(--text-secondary)",
        fontSize: 12,
        fontWeight: 600,
        marginBottom: 5,
      }}
    >
      {children}
    </label>
  );
}

interface TaskFormProps {
  inline?: boolean;
  onSubmit: (data: CreateTaskInput) => Promise<unknown>;
  onCancel: () => void;
}

export default function TaskForm({ inline = false, onSubmit, onCancel }: TaskFormProps) {
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      type: "puntual" as const,
      frequency: null as ("diaria" | "semanal" | "mensual" | "anual" | "custom" | null),
      custom_days: [] as string[],
      due_date: null as string | null,
    },
  });

  const type = watch("type");
  const frequency = watch("frequency");
  const customDays = watch("custom_days");

  const toggleDay = (key: string) => {
    const current = customDays ?? [];
    const next = current.includes(key)
      ? current.filter((d) => d !== key)
      : [...current, key];
    setValue("custom_days", next);
  };

  const handle = async (values: FormValues) => {
    setSubmitting(true);
    const due_at = values.due_date ? `${values.due_date}T00:00:00.000Z` : null;
    const custom_days =
      values.type === "rutina" && values.frequency === "custom" && values.custom_days.length > 0
        ? JSON.stringify(values.custom_days)
        : null;
    await onSubmit({
      title: values.title,
      type: values.type,
      frequency: values.type === "rutina" ? (values.frequency ?? "diaria") : null,
      custom_days,
      due_at,
    });
    if (inline) reset();
    setSubmitting(false);
  };

  return (
    <form
      onSubmit={handleSubmit(handle)}
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div>
        <Label>Título *</Label>
        <input
          {...register("title")}
          placeholder="Ej: Llamar al cliente, Hacer seguimiento..."
          style={inputCss(!!errors.title)}
        />
        {errors.title && (
          <p style={{ color: "var(--brand-light)", fontSize: 11, marginTop: 4 }}>
            {errors.title.message}
          </p>
        )}
      </div>

      <div>
        <Label>Tipo</Label>
        <div style={{ display: "flex", gap: 8 }}>
          {(["puntual", "rutina"] as const).map((t) => (
            <label
              key={t}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "9px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                background: type === t ? "var(--brand)" : "var(--surface-2)",
                color: type === t ? "#fff" : "var(--text-secondary)",
                border: `1px solid ${type === t ? "var(--brand)" : "var(--border)"}`,
                transition: "background 0.15s, color 0.15s",
              }}
            >
              <input
                type="radio"
                {...register("type")}
                value={t}
                style={{ display: "none" }}
              />
              {t === "puntual" ? "Puntual" : "Rutina"}
            </label>
          ))}
        </div>
      </div>

      {type === "rutina" && (
        <div>
          <Label>Frecuencia</Label>
          <Controller
            name="frequency"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value ?? ""}
                onChange={(v) => field.onChange(v as TaskFrequency)}
                options={FREQUENCY_OPTIONS}
                placeholder="Seleccionar frecuencia..."
              />
            )}
          />
          {errors.frequency && (
            <p style={{ color: "var(--brand-light)", fontSize: 11, marginTop: 4 }}>
              {errors.frequency.message}
            </p>
          )}
        </div>
      )}

      {/* Custom days selector (rutina + custom) */}
      {type === "rutina" && frequency === "custom" && (
        <div>
          <Label>Días de la semana</Label>
          <div style={{ display: "flex", gap: 6 }}>
            {WEEKDAYS.map((day) => {
              const active = (customDays ?? []).includes(day.key);
              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => toggleDay(day.key)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    background: active ? "var(--brand)" : "var(--surface-2)",
                    color: active ? "#fff" : "var(--text-secondary)",
                    border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`,
                    transition: "all 0.15s",
                    cursor: "pointer",
                  }}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          {(customDays ?? []).length === 0 && (
            <p style={{ color: "var(--text-tertiary)", fontSize: 11, marginTop: 4 }}>
              Seleccioná al menos un día
            </p>
          )}
        </div>
      )}

      {type === "puntual" && (
        <div>
          <Label>Fecha límite (opcional)</Label>
          <Controller
            name="due_date"
            control={control}
            render={({ field }) => (
              <DatePicker
                value={field.value}
                onChange={field.onChange}
                placeholder="Sin fecha límite"
              />
            )}
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        {!inline && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "12px",
              background: "var(--surface-2)",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-secondary)",
            }}
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          style={{
            flex: inline ? undefined : 2,
            width: inline ? "100%" : undefined,
            padding: "11px",
            background: submitting ? "var(--surface-3)" : "var(--brand)",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            color: submitting ? "var(--text-tertiary)" : "#fff",
            cursor: submitting ? "not-allowed" : "pointer",
            transition: "background 0.15s",
          }}
        >
          {submitting ? "Guardando..." : "Crear tarea"}
        </button>
      </div>
    </form>
  );
}
