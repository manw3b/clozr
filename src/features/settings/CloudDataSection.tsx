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
import { Cloud, CloudOff, CheckCircle2, AlertCircle, Loader2, Users, Workflow } from "lucide-react";
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useUIStore } from "../../store/uiStore";
import {
  importCustomersCloud, fetchCustomers,
  importPipelineStagesCloud, importPipelineItemsCloud,
  fetchPipelineItems,
} from "../../lib/cloudAuth";
import { customersDb } from "../../lib/db/customers";
import { dbSelect } from "../../lib/db";
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
  const pipelineStatus = activeWorkspaceId
    ? bootstrapStatus[activeWorkspaceId]?.pipeline ?? "pending"
    : "pending";

  const [localCount, setLocalCount] = useState<number | null>(null);
  const [cloudCount, setCloudCount] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  // Pipeline counts
  const [localLeadsCount, setLocalLeadsCount] = useState<number | null>(null);
  const [cloudLeadsCount, setCloudLeadsCount] = useState<number | null>(null);
  const [importingPipeline, setImportingPipeline] = useState(false);

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
    // Pipeline counts (separados porque queremos refrescar al import también)
    Promise.all([
      import("../../lib/db/index").then(({ dbSelect: ds }) =>
        ds<{ n: number }>(
          "SELECT COUNT(*) AS n FROM pipeline_items WHERE workspace_id = ?",
          [localWid],
        ).then((r) => r[0]?.n ?? 0),
      ),
      fetchPipelineItems(jwt, activeWorkspaceId).then((r) => r.ok ? r.data.items.length : 0),
    ]).then(([loc, cloud]) => {
      if (!mounted) return;
      setLocalLeadsCount(loc);
      setCloudLeadsCount(cloud);
    });
    return () => { mounted = false; };
  }, [loggedIn, activeWorkspaceId, localWid, jwt, customersStatus, pipelineStatus]);

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

  /**
   * Bootstrap del pipeline. Sube stages primero (los necesita el FK
   * implícito de los items.stage_id), después items. Idempotente.
   * Requiere que customers ya esté en done/skip — sino los items.customer_id
   * apuntarían a clientes que no existen en cloud.
   */
  async function handleImportPipeline() {
    if (!activeWorkspaceId || !localWid) return;
    if (customersStatus === "pending") {
      showToast("Primero subí los clientes — los leads dependen de ellos", "error");
      return;
    }
    setImportingPipeline(true);
    try {
      // 1) Stages
      const stagesLocal = await dbSelect<{
        id: string; name: string; stage_order: number; color: string;
        is_won: number; is_lost: number; created_at: string;
      }>(
        `SELECT id, name, stage_order, color, is_won, is_lost, created_at
           FROM pipeline_stages WHERE workspace_id = ?`,
        [localWid],
      );
      const sres = await importPipelineStagesCloud(
        jwt, activeWorkspaceId,
        stagesLocal.map((s) => ({
          id: s.id, name: s.name, stage_order: s.stage_order,
          color: s.color, is_won: s.is_won, is_lost: s.is_lost,
        })),
      );
      if (!sres.ok) {
        showToast(`No se pudieron subir las etapas: ${sres.error}`, "error");
        return;
      }

      // 2) Items
      const itemsLocal = await dbSelect<Record<string, unknown>>(
        `SELECT * FROM pipeline_items WHERE workspace_id = ?`,
        [localWid],
      );
      const ires = await importPipelineItemsCloud(
        jwt, activeWorkspaceId,
        itemsLocal.map((i) => ({
          id: String(i.id),
          customer_id: String(i.customer_id),
          customer_name: (i.customer_name as string | null) ?? undefined,
          stage_id: String(i.stage_id),
          stage_name: String(i.stage_name),
          stage_order: Number(i.stage_order ?? 0),
          status: (i.status as string | null) ?? "open",
          estimated_value: (i.estimated_value as number | null) ?? undefined,
          currency: (i.currency as string | null) ?? undefined,
          product: (i.product as string | null) ?? undefined,
          priority: (i.priority as string | null) ?? undefined,
          position: (i.position as number | null) ?? undefined,
          next_action_at: (i.next_action_at as string | null) ?? undefined,
          next_action_label: (i.next_action_label as string | null) ?? undefined,
          owner_id: (i.owner_id as string | null) ?? undefined,
          owner_name: (i.owner_name as string | null) ?? undefined,
          short_note: (i.short_note as string | null) ?? undefined,
          lead_source: (i.lead_source as string | null) ?? undefined,
          catalog_item_id: (i.catalog_item_id as string | null) ?? undefined,
          wholesale_code: (i.wholesale_code as string | null) ?? undefined,
          visit_at: (i.visit_at as string | null) ?? undefined,
          inactive_days: (i.inactive_days as number | null) ?? undefined,
          closed_at: (i.closed_at as string | null) ?? undefined,
          created_at: i.created_at ? String(i.created_at) : undefined,
        })),
      );
      if (!ires.ok) {
        showToast(`No se pudieron subir los leads: ${ires.error}`, "error");
        return;
      }

      setBootstrapStatus(activeWorkspaceId, "pipeline", "done");
      const msg = `Subidas ${sres.data.imported} etapas y ${ires.data.imported} leads` +
        (ires.data.skipped > 0 ? ` (${ires.data.skipped} ya estaban)` : "");
      showToast(msg, "success");
      setCloudLeadsCount(ires.data.imported + ires.data.skipped);
    } finally {
      setImportingPipeline(false);
    }
  }

  function handleSkipPipeline() {
    if (!activeWorkspaceId) return;
    if (!confirm("¿Saltear? Los leads locales NO se subirán; solo los nuevos irán a la nube.")) return;
    setBootstrapStatus(activeWorkspaceId, "pipeline", "skip");
    showToast("Pipeline salteado", "success");
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

      {/* Pipeline card */}
      <div style={{ ...cardStyle, marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: space[3], marginBottom: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: pipelineStatus === "done" ? color.successBg : `${color.primary}22`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Workflow size={18} color={pipelineStatus === "done" ? color.success : color.primary} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>
              Pipeline (leads + etapas)
            </div>
            <div style={{ fontSize: text.xs, color: color.textDim, marginTop: 2 }}>
              {pipelineStatus === "done" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <CheckCircle2 size={12} color={color.success} />
                  Sincronizado · {cloudLeadsCount ?? "…"} leads en la nube
                </span>
              )}
              {pipelineStatus === "skip" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Cloud size={12} color={color.warning} />
                  Salteado · nuevos leads irán a la nube ({cloudLeadsCount ?? "…"} en la nube)
                </span>
              )}
              {pipelineStatus === "pending" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <CloudOff size={12} color={color.textMuted} />
                  Local · {localLeadsCount ?? "…"} en tu PC, {cloudLeadsCount ?? "…"} en la nube
                </span>
              )}
            </div>
          </div>
        </div>

        {pipelineStatus === "pending" && isOwner && (
          <>
            <p style={{ fontSize: text.xs, color: color.textDim, lineHeight: 1.5, margin: "8px 0 14px" }}>
              Sube tus {localLeadsCount ?? "…"} leads + sus etapas a la nube. Requiere
              que <strong>Clientes</strong> ya esté sincronizado (los leads referencian
              clientes).
            </p>
            <div style={{ display: "flex", gap: space[2] }}>
              <button
                onClick={handleImportPipeline}
                disabled={importingPipeline || customersStatus === "pending"}
                style={btnPrimary}
                title={customersStatus === "pending" ? "Subí Clientes primero" : undefined}
              >
                {importingPipeline ? (
                  <>
                    <Loader2 size={13} className="spin" style={{ verticalAlign: "middle", marginRight: 6 }} />
                    Subiendo...
                  </>
                ) : (
                  <>
                    <Cloud size={13} style={{ verticalAlign: "middle", marginRight: 6 }} />
                    Subir Pipeline a la nube
                  </>
                )}
              </button>
              <button onClick={handleSkipPipeline} disabled={importingPipeline} style={btnGhost}>
                Saltear
              </button>
            </div>
          </>
        )}

        {pipelineStatus === "pending" && !isOwner && (
          <div style={{ fontSize: text.xs, color: color.textDim, padding: "8px 12px", background: color.surface2, borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={14} color={color.warning} />
            Solo el <strong>Dueño</strong> puede subir el pipeline histórico. Esperá a que lo haga.
          </div>
        )}

        {pipelineStatus === "done" && (
          <div style={{ fontSize: text.xs, color: color.textMuted, lineHeight: 1.5 }}>
            Pipeline en la nube. Tu equipo ve los mismos leads y arrastrar entre etapas
            sincroniza al instante (refresca al cambiar de pantalla por ahora; real-time vendrá).
          </div>
        )}
      </div>

      {/* Próximas features */}
      <h3 style={{ fontSize: 12, fontWeight: 600, color: color.textDim, textTransform: "uppercase", letterSpacing: 0.5, margin: "24px 0 12px" }}>
        Próximamente
      </h3>
      <div style={{ ...cardStyle, opacity: 0.6 }}>
        <div style={{ fontSize: text.sm, color: color.textMuted }}>
          Ventas · Caja · Tareas · Catálogo
        </div>
        <div style={{ fontSize: text.xs, color: color.textDim, marginTop: 4 }}>
          Vamos a migrar cada feature en su propio round.
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
