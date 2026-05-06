import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { authDb, type LoginMember } from "../../lib/db/auth";
import { useAuthStore, type UserRole } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { color, radius, space, text, weight } from "../../tokens";
import logoIsotipo from "../../assets/logo-isotipo.svg";

const ROLE_LABEL: Record<UserRole, string> = {
  owner: "Propietario",
  admin: "Admin",
  vendedor: "Vendedor",
  viewer: "Solo lectura",
};

/**
 * LoginScreen — selector de miembro del workspace activo + PIN.
 * Renderiza solo si:
 *   - hay activeWorkspace
 *   - no hay sesión persistida en authStore
 *   - hay >1 miembro, o el único miembro tiene PIN seteado
 */
export default function LoginScreen() {
  const { activeWorkspace } = useWorkspaceStore();
  const { setUser } = useAuthStore();
  const { showToast } = useUIStore();

  const [members, setMembers] = useState<LoginMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LoginMember | null>(null);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pinInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!activeWorkspace) return;
    setLoading(true);
    authDb
      .listLoginMembers(activeWorkspace.id)
      .then((list) => {
        setMembers(list);
        // Auto-login si hay 1 solo miembro sin PIN
        if (list.length === 1 && !list[0].has_pin) {
          handleLogin(list[0], "");
        }
      })
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id]);

  useEffect(() => {
    if (selected?.has_pin) {
      requestAnimationFrame(() => pinInputRef.current?.focus());
    }
  }, [selected]);

  async function handleLogin(member: LoginMember, pinValue: string) {
    setSubmitting(true);
    try {
      const result = await authDb.login(member.user_id, pinValue);
      if (!result) {
        showToast("PIN incorrecto", "error");
        setPin("");
        return;
      }
      setUser(member.user_id, result.name, result.role as UserRole);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al iniciar sesión", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function onPickMember(m: LoginMember) {
    if (m.has_pin) {
      setSelected(m);
      setPin("");
    } else {
      handleLogin(m, "");
    }
  }

  function onSubmitPin(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || pin.length < 4) return;
    handleLogin(selected, pin);
  }

  if (loading) {
    return (
      <div style={shellStyle}>
        <img src={logoIsotipo} alt="" style={{ height: 40, opacity: 0.4 }} />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div style={shellStyle}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <img src={logoIsotipo} alt="Clozr" style={{ height: 48, marginBottom: space[5] }} />
          <h1 style={{ fontSize: text.xl, fontWeight: weight.bold, color: color.text, margin: 0 }}>
            Sin miembros
          </h1>
          <p style={{ marginTop: space[2], color: color.textMuted, fontSize: text.sm }}>
            Este workspace no tiene miembros asignados. Pedile al owner que te invite.
          </p>
        </div>
      </div>
    );
  }

  // Step 2 — PIN entry
  if (selected) {
    return (
      <div style={shellStyle}>
        <form onSubmit={onSubmitPin} style={cardStyle}>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setPin("");
            }}
            style={{
              alignSelf: "flex-start",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: text.xs,
              color: color.textMuted,
              background: "transparent",
              padding: 0,
              marginBottom: space[3],
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={12} /> Volver
          </button>

          <Avatar
            name={selected.name}
            size={64}
            bg={selected.avatar_color ?? undefined}
          />
          <h1 style={{ fontSize: text.lg, fontWeight: weight.bold, color: color.text, margin: `${space[3]} 0 4px` }}>
            Hola, {selected.name.split(" ")[0]}
          </h1>
          <p style={{ margin: 0, color: color.textMuted, fontSize: text.sm }}>
            Ingresá tu PIN para continuar
          </p>

          <input
            ref={pinInputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            style={{
              marginTop: space[5],
              width: "100%",
              padding: `${space[3]} ${space[4]}`,
              fontSize: 24,
              textAlign: "center",
              letterSpacing: "0.5em",
              fontWeight: weight.semibold,
              background: color.surface2,
              border: `1px solid ${color.border}`,
              borderRadius: radius.md,
              color: color.text,
              outline: "none",
            }}
          />

          <Button
            type="submit"
            variant="primary"
            disabled={pin.length < 4 || submitting}
            loading={submitting}
            style={{ marginTop: space[4], width: "100%" }}
          >
            Ingresar
          </Button>
        </form>
      </div>
    );
  }

  // Step 1 — pick member
  return (
    <div style={shellStyle}>
      <div style={{ ...cardStyle, alignItems: "stretch" }}>
        <img src={logoIsotipo} alt="Clozr" style={{ height: 36, alignSelf: "center", marginBottom: space[4], opacity: 0.85 }} />
        <h1 style={{ fontSize: text.lg, fontWeight: weight.bold, color: color.text, margin: 0, textAlign: "center" }}>
          ¿Quién sos?
        </h1>
        <p style={{ margin: `4px 0 ${space[5]}`, color: color.textMuted, fontSize: text.sm, textAlign: "center" }}>
          Seleccioná tu usuario para entrar a {activeWorkspace?.name ?? "Clozr"}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
          {members.map((m) => (
            <button
              key={m.user_id}
              type="button"
              onClick={() => onPickMember(m)}
              disabled={submitting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: space[3],
                padding: space[3],
                background: color.surface2,
                border: `1px solid ${color.border}`,
                borderRadius: radius.md,
                cursor: "pointer",
                textAlign: "left",
                transition: "all 100ms",
              }}
            >
              <Avatar name={m.name} size={40} bg={m.avatar_color ?? undefined} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
                  {m.name}
                </div>
                <div style={{ fontSize: text.xs, color: color.textMuted, marginTop: 2 }}>
                  {ROLE_LABEL[m.role]}
                  {m.has_pin ? " · PIN protegido" : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  height: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: color.bg,
  padding: space[5],
};

const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  padding: `${space[6]} ${space[5]}`,
  width: "100%",
  maxWidth: 380,
  boxShadow: "0 4px 30px rgba(0,0,0,0.06)",
};
