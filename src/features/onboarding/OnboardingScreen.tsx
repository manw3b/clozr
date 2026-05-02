import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { workspaceDb } from "../../lib/db/workspace";
import { dbExecute } from "../../lib/db/index";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useAuthStore } from "../../store/authStore";

const schema = z.object({
  businessName: z.string().min(2, "Mínimo 2 caracteres").max(50, "Máximo 50 caracteres"),
  userName: z.string().min(2, "Mínimo 2 caracteres").max(50, "Máximo 50 caracteres"),
  userEmail: z.string().optional().nullable()
    .refine((v) => !v || z.string().email().safeParse(v).success, "Email inválido"),
});

type FormValues = z.infer<typeof schema>;

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "13px 14px",
    background: "var(--surface-2)",
    border: `1px solid ${hasError ? "var(--brand)" : "var(--border-strong)"}`,
    borderRadius: 10,
    color: "var(--text-primary)",
    fontSize: 15,
    outline: "none",
    transition: "border-color 0.15s",
  };
}

export default function OnboardingScreen() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addWorkspace } = useWorkspaceStore();
  const { setUser } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const workspace = await workspaceDb.create(data.businessName);
      const userId = crypto.randomUUID();
      const now = new Date().toISOString();
      const emailFallback = `${data.userName.toLowerCase().replace(/\s+/g, ".")}@clozr.local`;
      const email = data.userEmail?.trim() || emailFallback;
      await dbExecute(
        "INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)",
        [userId, data.userName, email, now],
      );
      await dbExecute(
        "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)",
        [workspace.id, userId, now],
      );
      setUser(userId, data.userName);
      addWorkspace(workspace);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al crear el espacio de trabajo",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
        background: "var(--bg)",
      }}
    >
      <div style={{ marginBottom: 52, textAlign: "center" }}>
        <div
          style={{
            fontSize: 58,
            fontWeight: 800,
            color: "var(--text-primary)",
            letterSpacing: -3,
            lineHeight: 1,
          }}
        >
          Clozr<span style={{ color: "var(--brand)" }}>.</span>
        </div>
        <p
          style={{
            color: "var(--text-secondary)",
            marginTop: 10,
            fontSize: 15,
          }}
        >
          Tu CRM de ventas
        </p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        style={{
          width: "100%",
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              color: "var(--text-secondary)",
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 7,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Nombre del negocio
          </label>
          <input
            {...register("businessName")}
            placeholder="Ej: Electrónica García"
            autoComplete="off"
            style={inputStyle(!!errors.businessName)}
          />
          {errors.businessName && (
            <p
              style={{
                color: "var(--brand-light)",
                fontSize: 12,
                marginTop: 5,
              }}
            >
              {errors.businessName.message}
            </p>
          )}
        </div>

        <div>
          <label
            style={{
              display: "block",
              color: "var(--text-secondary)",
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 7,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Tu nombre
          </label>
          <input
            {...register("userName")}
            placeholder="Ej: Carlos"
            autoComplete="off"
            style={inputStyle(!!errors.userName)}
          />
          {errors.userName && (
            <p style={{ color: "var(--brand-light)", fontSize: 12, marginTop: 5 }}>
              {errors.userName.message}
            </p>
          )}
        </div>

        <div>
          <label
            style={{
              display: "block",
              color: "var(--text-secondary)",
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 7,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Tu email <span style={{ color: "var(--text-tertiary)", fontWeight: 400, textTransform: "none" }}>(opcional)</span>
          </label>
          <input
            {...register("userEmail")}
            type="email"
            placeholder="tu@email.com"
            autoComplete="email"
            style={inputStyle(!!errors.userEmail)}
          />
          {errors.userEmail && (
            <p style={{ color: "var(--brand-light)", fontSize: 12, marginTop: 5 }}>
              {errors.userEmail.message}
            </p>
          )}
        </div>

        {error && (
          <p
            style={{
              color: "var(--brand-light)",
              fontSize: 13,
              padding: "10px 12px",
              background: "var(--red-bg)",
              borderRadius: 8,
              border: "1px solid rgba(232,0,29,0.3)",
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            marginTop: 8,
            padding: "14px",
            background: isSubmitting ? "var(--surface-3)" : "var(--brand)",
            color: isSubmitting ? "var(--text-tertiary)" : "#fff",
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            cursor: isSubmitting ? "not-allowed" : "pointer",
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {isSubmitting ? "Creando..." : "Empezar"}
        </button>
      </form>
    </div>
  );
}
