/**
 * CloudDataSection — bootstrap migration de datos locales a la nube.
 *
 * Para cada feature (customers en R1, pipeline en R2, etc) mostramos:
 *   - Estado actual (cuántos registros locales, cuántos en cloud)
 *   - Botón "Subir a la nube" (solo owner)
 *   - O badge "Sincronizado en la nube" si ya está done
 *
 * El "modo cloud" se activa por feature una vez que el owner sube los
 * datos. Los miembros invitados saltean este paso — ellos arrancan sin
 * datos locales y leen directo del cloud.
 */

import { useEffect, useState } from "react";
import { Cloud, CloudOff, CheckCircle2, AlertCircle, Loader2, Users } from "lucide-react";
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useUIStore } from "../../store/uiStore";
import { importCustomersCloud, fetchCustomers } from "../../lib/cloudAuth";
import { customersDb } from "../../lib/db/customers";
import { color, radius, space, text, weight } from "../../tokens";

export function CloudDataSection() {
  const {
    jwt, workspaces, activeWorkspaceId, bootstrapStatus,
    setBootstrapStatus, currentRole, isLoggedIn,
  } = useCloudAuthStore();
  const { activeWorkspace: localWorkspace } = useWorkspaceStore();
  const { showToast } = useUIStore();

  const loggedIn = isLoggedIn();
  const role = currentRole();
  const isOwner = role === "owner";
  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
  const localWid = localWorkspace?.id ?? "";

  const customersStatus = activeWorkspaceId
    ? bootstrapStatus[activeWorkspaceId]?.customers ?? "pending"
    : "pending";

  const [localCount, setLocalCount] = useState<number | null>(null);
  const [cloudCount, setCloudCount] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!loggedIn || !activeWorkspaceId || !localWid) return;
    // Cargar conteos. customersDb.getAll respeta el cloud mode — si ya
    // está done, devuelve cloud rows. Para conteo local "real" iríamos
    // directo a SQLite, pero por simplicidad: el count que ves es lo
    // que la app está mostrando.
    let mounted = true;
    Promise.all([
      // Conteo de local SQLite — siempre devuelve del local raw.
      // Para esto usamos un import directo (TODO: helper).
      // Por ahora, cuenta lo que tenga el local DB (independiente de cloud).
      import("../../lib/db/index").then(({ dbSelect }) =>
        dbSelect<{ n: number }>(
          "SELECT COUNT(*) AS n FROM customers WHERE workspace_id = ?",
          [localWid],
        ).then((r) => r[0]?.n ?? 0),
      ),
      // Conteo cloud — pide al server.
      fetchCustomers(jwt, activeWorkspaceId).then((r) =>
        r.ok ? r.data.customers.length : 0,
      ),
    ]).then(([loc, cloud]) => {
      if (!mounted) return;
      setLocalCount(loc);
      setCloudCount(cloud);
    });
    return () => { mounted = false; };
  }, [loggedIn, activeWorkspaceId, localWid, jwt, customersStatus]);

  async function handleImport() {
    if (!activeWorkspaceId || !localWid) return;
    setImporting(true);
    try {
      // Cargar TODOS los clientes locales. customersDb.getAll respeta
      // cloud mode; como acá NO está done todavía, devuelve los locales.
      const localCustomers = await customersDb.getAll(localWid);
      const payload = localCustomers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone ?? undefined,
        email: c.email ?? undefined,
        type: c.type ?? undefined,
        status: c.status ?? undefined,
        pricing_policy_json: c.pricing_policy_json ?? undefined,
        barrio: c.barrio ?? undefined,
        address: c.address ?? undefined,
        notes: c.notes ?? undefined,
        avatar_path: c.avatar_path ?? undefined,
        instagram: c.instagram ?? undefined,
        facebook: c.facebook ?? undefined,
        tiktok: c.tiktok ?? undefined,
        twitter: c.twitter ?? undefined,
        created_at: c.created_at,
      }));

      const res = await importCustomersCloud(jwt, activeWorkspaceId, payload);
      if (!res.ok) {
        showToast(`No se pudo subir: ${res.error}`, "error");
        return;
      }
      // Marcar done — desde ahora customersDb pega al cloud.
      setBootstrapStatus(activeWorkspaceId, "customers", "done");
      const { imported, skipped, errors } = res.data;
      const msg = `Subidos ${imported} clientes` +
        (skipped > 0 ? ` (${skipped} ya estaban)` : "") +
        (errors.length > 0 ? ` · ${errors.length} con error` : "");
      showToast(msg, "success");
      // Refresh counts
      setCloudCount(imported + skipped);
    } finally {
      setImporting(false);
    }
  }

  function handleSkipImport() {
    if (!activeWorkspaceId) return;
    if (!confirm("¿Saltear el import? Los clientes locales NO se van a subir a la nube y solo los vas a ver vos. Los nuevos clientes que crees después sí van a la nube y los va a ver tu equipo.")) return;
    setBootstrapStatus(activeWorkspaceId, "customers", "skip");
    showToast("Bootstrap salteado — los nuevos clientes irán a la nube", "success");
  }

  /* ── Empty states ────────────────────────────────────────────────── */

  if (!loggedIn) {
    return (
      <div>
        <h2 style={titleStyle}>Datos en la nube</h2>
        <p style={descStyle}>
          Para compartir datos con tu equipo, primero entrá con tu email en
          <strong style={{ color: color.text }}> Ajustes → Cuenta en la nube</strong>.
        </p>
      </div>
    );
  }

  if (!activeWs) {
    return (
      <div>
        <h2 style={titleStyle}>Datos en la nube</h2>
        <p style={descStyle}>
          Creá tu negocio en la nube primero
          (<strong style={{ color: color.text }}>Ajustes → Cuenta en la nube</strong>).
        </p>
      </div>
    );
  }

  /* ── Vista normal ───────────────────────────────────────────────── */

  return (
    <div>
      <h2 style={titleStyle}>Datos en la nube</h2>
      <p style={descStyle}>
        Decidí qué datos compartís con tu equipo. La migración es por feature
        — empezamos por <strong style={{ color: color.text }}>Clientes</strong>;
        después Pipeline, Ventas y el resto.
      </p>

      {/* Customers card */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: space[3], marginBottom: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: customersStatus === "done" ? color.successBg : `${color.primary}22`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Users size={18} color={customersStatus === "done" ? color.success : color.primary} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
              Clientes
            </div>
            <div style={{ fontSize: text.xs, color: color.textDim, marginTop: 2 }}>
              {customersStatus === "done" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <CheckCircle2 size={12} color={color.success} />
                  Sincronizado en la nube · {cloudCount ?? "…"} en la nube
                </span>
              )}
              {customersStatus === "skip" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Cloud size={12} color={color.warning} />
                  Salteado · nuevos clientes irán a la nube ({cloudCount ?? "…"} en la nube)
                </span>
              )}
              {customersStatus === "pending" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <CloudOff size={12} color={color.textMuted} />
                  Local · {localCount ?? "…"} en tu PC, {cloudCount ?? "…"} en la nube
                </span>
              )}
            </div>
          </div>
        </div>

        {customersStatus === "pending" && isOwner && (
          <>
            <p style={{ fontSize: text.xs, color: color.textDim, lineHeight: 1.5, margin: "8px 0 14px" }}>
              Vamos a copiar tus {localCount ?? "…"} clientes locales a la nube. Después tu
              equipo los va a ver desde sus PCs. Es <strong>idempotente</strong> — si ya
              subiste antes, no se duplican.
            </p>
            <div style={{ display: "flex", gap: space[2] }}>
              <button onClick={handleImport} disabled={importing} style={btnPrimary}>
                {importing ? (
                  <>
                    <Loader2 size={13} className="spin" style={{ verticalAlign: "middle", marginRight: 6 }} />
                    Subiendo...
                  </>
                ) : (
                  <>
                    <Cloud size={13} style={{ verticalAlign: "middle", marginRight: 6 }} />
                    Subir mis clientes a la nube
                  </>
                )}
              </button>
              <button onClick={handleSkipImport} disabled={importing} style={btnGhost}>
                Saltear (arrancar limpio)
              </button>
            </div>
          </>
        )}

        {customersStatus === "pending" && !isOwner && (
          <div style={{ fontSize: text.xs, color: color.textDim, padding: "8px 12px", background: color.surface2, borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={14} color={color.warning} />
            Solo el <strong>Dueño</strong> puede subir los clientes históricos.
            Esperá a que lo haga, después vas a ver los mismos clientes que él.
          </div>
        )}

        {customersStatus === "done" && (
          <div style={{ fontSize: text.xs, color: color.textMuted, lineHeight: 1.5 }}>
            Las queries de Clientes van a la nube. Tu equipo ve los mismos datos en tiempo
            casi-real (sincroniza al navegar entre pantallas).
          </div>
        )}
      </div>

      {/* Próximas features (placeholder) */}
      <h3 style={{ fontSize: 12, fontWeight: 600, color: color.textDim, textTransform: "uppercase", letterSpacing: 0.5, margin: "24px 0 12px" }}>
        Próximamente
      </h3>
      <div style={{ ...cardStyle, opacity: 0.6 }}>
        <div style={{ fontSize: text.sm, color: color.textMuted }}>
          Pipeline · Ventas · Caja · Tareas · Catálogo
        </div>
        <div style={{ fontSize: text.xs, color: color.textDim, marginTop: 4 }}>
          Vamos a migrar cada feature en su propio round. Por ahora seguís
          viéndolas locales solo en TU PC.
        </div>
      </div>
    </div>
  );
}

/* ── styles ──────────────────────────────────────────────────────────── */

const titleStyle: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, color: color.text,
  letterSpacing: -0.2, marginBottom: 4,
};
const descStyle: React.CSSProperties = {
  fontSize: 13, color: color.textDim, marginBottom: 20, lineHeight: 1.5,
};
const cardStyle: React.CSSProperties = {
  padding: space[4], background: color.surface,
  border: `1px solid ${color.border}`, borderRadius: radius.lg,
  maxWidth: 640,
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 18px", background: color.primary,
  borderRadius: 8, fontSize: 13, fontWeight: 600,
  color: "#fff", border: "none", cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "6px 12px", background: "transparent",
  border: `1px solid ${color.border}`, borderRadius: 8,
  color: color.textMuted, fontSize: 12, fontWeight: 500, cursor: "pointer",
};
