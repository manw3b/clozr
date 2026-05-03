import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { workspaceDb } from "../../lib/db/workspace";
import { dbExecute } from "../../lib/db/index";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useAuthStore } from "../../store/authStore";
import { Input } from "../../components/Input";
import { Button } from "../../components/Button";
import { color, radius, space, text, weight } from "../../tokens";
import { errorMessage } from "../../lib/logger";
import logoIsotipo from "../../assets/logo-isotipo.svg";

const schema = z.object({
  businessName: z.string().min(2, "Mínimo 2 caracteres").max(50, "Máximo 50 caracteres"),
  userName: z.string().min(2, "Mínimo 2 caracteres").max(50, "Máximo 50 caracteres"),
  userEmail: z
    .string()
    .optional()
    .nullable()
    .refine(
      (v) => !v || z.string().email().safeParse(v).success,
      "Email inválido",
    ),
});

type FormValues = z.infer<typeof schema>;

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
      setError(errorMessage(err, "Error al crear el espacio de trabajo"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: `${space[10]} ${space[6]}`,
        background: color.bg,
        gap: space[8],
      }}
    >
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: space[3] }}>
        <img src={logoIsotipo} alt="Clozr" style={{ height: 64 }} />
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: text["2xl"],
              fontWeight: weight.bold,
              color: color.text,
              letterSpacing: "-0.5px",
            }}
          >
            Bienvenido a Clozr
          </h1>
          <p style={{ marginTop: space[1], fontSize: text.sm, color: color.textMuted }}>
            Tu CRM de ventas — empezá en 30 segundos
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        style={{
          width: "100%",
          maxWidth: 380,
          display: "flex",
          flexDirection: "column",
          gap: space[4],
          padding: space[6],
          background: color.surface,
          border: `1px solid ${color.border}`,
          borderRadius: radius.xl,
        }}
      >
        <Input
          label="Nombre del negocio"
          {...register("businessName")}
          placeholder="Ej: Electrónica García"
          autoComplete="off"
          error={errors.businessName?.message}
        />

        <Input
          label="Tu nombre"
          {...register("userName")}
          placeholder="Ej: Carlos"
          autoComplete="off"
          error={errors.userName?.message}
        />

        <Input
          label="Tu email"
          type="email"
          {...register("userEmail")}
          placeholder="tu@email.com (opcional)"
          autoComplete="email"
          error={errors.userEmail?.message}
          hint="Opcional — podés agregarlo después"
        />

        {error && (
          <div
            style={{
              fontSize: text.sm,
              padding: space[3],
              background: color.dangerBg,
              border: `1px solid ${color.danger}`,
              borderRadius: radius.md,
              color: color.danger,
            }}
          >
            {error}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={isSubmitting}
          style={{ marginTop: space[2] }}
        >
          {isSubmitting ? "Creando…" : "Empezar"}
        </Button>
      </form>
    </div>
  );
}
