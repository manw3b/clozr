/**
 * IndustrySection (J2) — selector visual del rubro del workspace.
 *
 * Muestra una grilla de cards con cada rubro disponible. El activo tiene
 * borde rojo. Los pagos muestran badge "Pro" + precio tentativo. Click
 * en uno gratis (o futuro: comprado) cambia el rubro inmediato. Click
 * en uno pago-no-comprado abre modal "Próximamente — anotame" que
 * registra interés via /errors endpoint con scope="industry-interest".
 *
 * El cambio de rubro NO es destructivo — solo cambia el ícono del topbar
 * + labels de algunas pantallas. Lo que ya tenés (catálogo, pipeline, etc)
 * queda intacto.
 */
import { useState } from "react";
import { Check, Lock, Sparkles } from "lucide-react";
import { INDUSTRY_LIST, type IndustryConfig } from "../../lib/industries";
import { useIndustry } from "../../lib/useIndustry";
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import { useAuthStore, can } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import { updateWorkspaceCloud } from "../../lib/cloudAuth";
import { log } from "../../lib/logger";
import { color, radius, space, text, weight } from "../../tokens";

const AUTH_BASE =
  (import.meta.env.VITE_AUTH_WORKER_URL as string | undefined) ??
  "https://clozr-auth.pyter-import.workers.dev";

export function IndustrySection({ wid }: { wid: string }) {
  void wid;
  const current = useIndustry();
  const role = useAuthStore((s) => s.userRole);
  const canManage = can(role, "manageWorkspaceSettings");
  const { showToast } = useUIStore();
  const cloudJwt = useCloudAuthStore((s) => s.jwt);
  const cloudWsId = useCloudAuthStore((s) => s.activeWorkspaceId);
  const isCloud = useCloudAuthStore((s) => s.isLoggedIn() && !!s.activeWorkspaceId);
  const upsertWorkspace = useCloudAuthStore((s) => s.upsertWorkspace);
  const workspaces = useCloudAuthStore((s) => s.workspaces);
  const [interestFor, setInterestFor] = useState<IndustryConfig | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  async function handleSelect(industry: IndustryConfig) {
    if (industry.slug === current.slug) return;

    // Rubro pago no listo → modal de interés.
    if (industry.status === "coming-soon") {
      setInterestFor(industry);
      return;
    }
    // Rubro pago "preview" → permitirlo sin checkout (entitlements stub).
    // Cuando Stripe se active, validamos canUseIndustry() acá.

    if (!isCloud || !cloudWsId) {
      showToast("Iniciá sesión en la nube para cambiar el rubro", "error");
      return;
    }

    setSwitching(industry.slug);
    const res = await updateWorkspaceCloud(cloudJwt, cloudWsId, { industry: industry.slug });
    setSwitching(null);
    if (!res.ok) {
      showToast(`No se pudo cambiar: ${res.error}`, "error");
      return;
    }
    // Sync el store local — el ícono del topbar y otros consumidores se
    // refrescan sin esperar al próximo /me.
    const ws = workspaces.find((w) => w.id === cloudWsId);
    if (ws) upsertWorkspace({ ...ws, industry: industry.slug });
    showToast(`Rubro cambiado a "${industry.label}"`, "success");
  }

  return (
    <div>
      <header style={{ marginBottom: space[5] }}>
        <h2 style={{
          margin: 0,
          fontSize: 16,
          fontWeight: weight.bold,
          color: color.text,
          letterSpacing: '-0.2px',
        }}>
          Rubro del negocio
        </h2>
        <p style={{
          margin: '4px 0 0',
          fontSize: 13,
          color: color.textDim,
          lineHeight: 1.5,
        }}>
          Elegí el tipo de negocio que tenés. Los rubros <strong style={{ color: color.text }}>Pro</strong> vienen
          con catálogo precargado, pipeline armado y plantillas listas. En el plan{' '}
          <strong style={{ color: color.text }}>Genérico</strong> armás todo manual.
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: space[3],
          maxWidth: 900,
        }}
      >
        {INDUSTRY_LIST.map((ind) => {
          const isActive = current.slug === ind.slug;
          const isLoading = switching === ind.slug;
          return (
            <IndustryCard
              key={ind.slug}
              industry={ind}
              active={isActive}
              loading={isLoading}
              disabled={!canManage || isLoading}
              onSelect={() => handleSelect(ind)}
            />
          );
        })}
      </div>

      {!canManage && (
        <div style={{
          marginTop: space[4],
          padding: `${space[3]} ${space[4]}`,
          background: 'var(--surface-2)',
          border: `1px solid ${color.border}`,
          borderRadius: radius.md,
          fontSize: 12,
          color: color.textMuted,
          maxWidth: 520,
        }}>
          Solo el <strong>dueño</strong> o <strong>encargado</strong> pueden cambiar el rubro del negocio.
        </div>
      )}

      {interestFor && (
        <IndustryInterestModal
          industry={interestFor}
          onClose={() => setInterestFor(null)}
          jwt={cloudJwt}
          workspaceId={cloudWsId}
          onSent={() => {
            setInterestFor(null);
            showToast("¡Listo! Te avisamos cuando esté disponible.", "success");
          }}
        />
      )}
    </div>
  );
}

/* ── Card de un rubro ────────────────────────────────────────────────── */

function IndustryCard({
  industry,
  active,
  loading,
  disabled,
  onSelect,
}: {
  industry: IndustryConfig;
  active: boolean;
  loading: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const isComingSoon = industry.status === "coming-soon";
  const isPreview = industry.status === "preview";

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      style={{
        textAlign: 'left',
        padding: space[4],
        background: active ? `${color.primary}10` : color.surface,
        border: `2px solid ${active ? color.primary : color.border}`,
        borderRadius: radius.lg,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled && !active ? 0.6 : 1,
        position: 'relative',
        transition: 'border-color 120ms, background 120ms',
        display: 'flex',
        flexDirection: 'column',
        gap: space[3],
        minHeight: 200,
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled) {
          e.currentTarget.style.borderColor = color.borderStrong;
        }
      }}
      onMouseLeave={(e) => {
        if (!active && !disabled) {
          e.currentTarget.style.borderColor = color.border;
        }
      }}
    >
      {/* Header con ícono + nombre + badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[3] }}>
        <span style={{
          fontSize: 32,
          lineHeight: 1,
          flexShrink: 0,
        }}>
          {industry.icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
            <span style={{
              fontSize: text.base,
              fontWeight: weight.bold,
              color: color.text,
            }}>
              {industry.label}
            </span>
            {industry.isPaid && (
              <span style={{
                fontSize: 10,
                fontWeight: weight.bold,
                color: '#fff',
                background: color.primary,
                padding: '2px 6px',
                borderRadius: radius.full,
                letterSpacing: '0.5px',
              }}>
                PRO
              </span>
            )}
            {isComingSoon && (
              <span style={{
                fontSize: 10,
                fontWeight: weight.semibold,
                color: color.textMuted,
                background: 'var(--surface-2)',
                padding: '2px 6px',
                borderRadius: radius.full,
                letterSpacing: '0.5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}>
                <Lock size={9} />
                PRÓXIMAMENTE
              </span>
            )}
            {isPreview && !active && (
              <span style={{
                fontSize: 10,
                fontWeight: weight.semibold,
                color: 'var(--warning, #f59e0b)',
                background: 'rgba(251, 191, 36, 0.1)',
                padding: '2px 6px',
                borderRadius: radius.full,
                letterSpacing: '0.5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}>
                <Sparkles size={9} />
                BETA
              </span>
            )}
          </div>
          {industry.priceUsd !== null && (
            <div style={{
              fontSize: 11,
              color: color.textDim,
              marginTop: 2,
              fontVariantNumeric: 'tabular-nums',
            }}>
              USD {industry.priceUsd} <span style={{ color: color.textDim }}>(precio tentativo)</span>
            </div>
          )}
        </div>
        {active && (
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: color.primary,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            aria-label="Activo"
          >
            <Check size={13} color="#fff" strokeWidth={3} />
          </span>
        )}
      </div>

      {/* Descripción */}
      <p style={{
        margin: 0,
        fontSize: 12,
        color: color.textMuted,
        lineHeight: 1.5,
      }}>
        {industry.description}
      </p>

      {/* Highlights */}
      <ul style={{
        margin: 0,
        padding: 0,
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        marginTop: 'auto',
      }}>
        {industry.highlights.slice(0, 3).map((h, i) => (
          <li key={i} style={{
            fontSize: 11,
            color: color.textMuted,
            lineHeight: 1.4,
            display: 'flex',
            gap: 6,
          }}>
            <span style={{ color: color.primary, flexShrink: 0 }}>·</span>
            <span>{h}</span>
          </li>
        ))}
      </ul>

      {loading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          borderRadius: radius.lg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 12,
        }}>
          Cambiando…
        </div>
      )}
    </button>
  );
}

/* ── Modal de interés "Próximamente" ─────────────────────────────────── */

function IndustryInterestModal({
  industry,
  jwt,
  workspaceId,
  onClose,
  onSent,
}: {
  industry: IndustryConfig;
  jwt: string | null;
  workspaceId: string | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const cloudEmail = useCloudAuthStore((s) => s.email);
  const localUserName = useAuthStore((s) => s.userName);

  async function handleSend() {
    setSending(true);
    // Hack mínimo: lo registramos vía /errors con scope dedicado. Después
    // grepeás la tabla client_errors WHERE scope='industry-interest'.
    // Cuando madure, le hacemos un endpoint propio.
    try {
      await fetch(`${AUTH_BASE}/errors`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: `Interés en rubro: ${industry.label}`,
          scope: "industry-interest",
          data: {
            industry_slug: industry.slug,
            industry_label: industry.label,
            workspace_id: workspaceId,
            user_email: cloudEmail,
            user_name: localUserName,
            comment: comment.trim() || null,
            jwt_present: !!jwt,
          },
        }),
      });
      onSent();
    } catch (e) {
      log.warn("industry interest send failed", { scope: "settings", err: e });
      onSent(); // igual cerramos — el user no debe notar el fallo de network
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 480, width: "100%",
          background: color.surface,
          borderRadius: radius.lg,
          padding: 28,
          border: `1px solid ${color.border}`,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8, lineHeight: 1 }}>
          {industry.icon}
        </div>
        <h3 style={{
          margin: 0,
          fontSize: 18,
          fontWeight: weight.bold,
          color: color.text,
          letterSpacing: '-0.2px',
        }}>
          {industry.label} — Próximamente
        </h3>
        <p style={{
          margin: '8px 0 16px',
          fontSize: 13,
          color: color.textMuted,
          lineHeight: 1.5,
        }}>
          Todavía estamos armando este rubro. Si te interesa, dejame tu
          nota y te aviso cuando esté listo. Si tenés un negocio del rubro
          y querés ser cliente piloto (precio promocional), contame en
          el comentario.
        </p>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Contame qué necesitás de este rubro (opcional)..."
          rows={4}
          style={{
            width: "100%",
            padding: "9px 12px",
            background: "var(--surface-2)",
            border: `1px solid ${color.borderStrong}`,
            borderRadius: 8,
            color: color.text,
            fontSize: 13,
            fontFamily: "inherit",
            resize: "vertical",
            marginBottom: 16,
            boxSizing: "border-box",
            outline: "none",
          }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={sending}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: `1px solid ${color.border}`,
              borderRadius: 8,
              color: color.textMuted,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            style={{
              padding: "8px 18px",
              background: color.primary,
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 13,
              fontWeight: weight.semibold,
              cursor: "pointer",
              opacity: sending ? 0.6 : 1,
            }}
          >
            {sending ? "Enviando…" : "Anotame"}
          </button>
        </div>
      </div>
    </div>
  );
}
