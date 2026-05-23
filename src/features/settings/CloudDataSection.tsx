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
import { Cloud, CloudOff, CheckCircle2, AlertCircle, Loader2, Users, Workflow, ShoppingCart, Coins, ClipboardCheck, Bell, Package, CreditCard, Tag } from "lucide-react";
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useUIStore } from "../../store/uiStore";
import {
  importCustomersCloud, fetchCustomers,
  importPipelineStagesCloud, importPipelineItemsCloud,
  fetchPipelineItems,
  importSalesCloud, fetchSales,
  tasksApi, cashApi, followupsApi,
  catalogApi, paymentMethodsApi, customerTypesApi, customerTagsApi,
} from "../../lib/cloudAuth";
import { customersDb } from "../../lib/db/customers";
import { dbSelect } from "../../lib/db";
import { confirmAsync } from "../../lib/confirmAsync";
import { color, space, text, weight } from "../../tokens";
import { cloudStyles } from "./cloudStyles";

const {
  title: titleStyle, desc: descStyle, card: cardStyle,
  btnPrimary, btnGhost, btnPrimarySm, btnGhostSm,
} = cloudStyles;

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

  async function handleSkipImport() {
    if (!activeWorkspaceId) return;
    const ok = await confirmAsync({
      title: "Saltear import de clientes",
      message: "¿Saltear el import? Los clientes locales NO se van a subir a la nube y solo los vas a ver vos. Los nuevos clientes que crees después sí van a la nube y los va a ver tu equipo.",
      confirmText: "Saltear",
    });
    if (!ok) return;
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

  async function handleSkipPipeline() {
    if (!activeWorkspaceId) return;
    const ok = await confirmAsync({
      title: "Saltear pipeline",
      message: "¿Saltear? Los leads locales NO se subirán; solo los nuevos irán a la nube.",
      confirmText: "Saltear",
    });
    if (!ok) return;
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

      {/* R3-R5 — feature cards genéricas */}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <SimpleFeatureCard
          icon={ShoppingCart} label="Ventas + pagos" feature="sales"
          desc="Las ventas y sus pagos compartidos. Tu equipo ve qué se cobró y qué queda pendiente."
          fetchLocal={async () => {
            const rs = await dbSelect<{ n: number }>("SELECT COUNT(*) AS n FROM sales WHERE workspace_id = ?", [localWid]);
            return rs[0]?.n ?? 0;
          }}
          fetchCloud={async () => { const r = await fetchSales(jwt, activeWorkspaceId!); return r.ok ? r.data.sales?.length ?? 0 : 0; }}
          collectLocal={async () => {
            const sales = await dbSelect<Record<string, unknown>>("SELECT * FROM sales WHERE workspace_id = ?", [localWid]);
            return sales.map((s) => ({ id: String(s.id), ...s }));
          }}
          uploadFn={async (items) => {
            const r = await importSalesCloud(jwt, activeWorkspaceId!, items as never);
            return r.ok ? { imported: r.data.imported, skipped: r.data.skipped } : { error: r.error };
          }}
          requires={["customers"]}
          isOwner={isOwner}
          bootstrapStatus={bootstrapStatus}
          activeWorkspaceId={activeWorkspaceId!}
          setBootstrapStatus={setBootstrapStatus}
          showToast={showToast}
          customersStatus={customersStatus}
        />
        <SimpleFeatureCard
          icon={ClipboardCheck} label="Tareas" feature="tasks"
          desc="Las tareas pendientes del equipo. Cuando Caro completa una, vos lo ves."
          fetchLocal={async () => (await dbSelect<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE workspace_id = ?", [localWid]))[0]?.n ?? 0}
          fetchCloud={async () => { const r = await tasksApi.list(jwt, activeWorkspaceId!); return r.ok ? r.data.items.length : 0; }}
          collectLocal={async () => {
            const rows = await dbSelect<Record<string, unknown>>("SELECT * FROM tasks WHERE workspace_id = ?", [localWid]);
            return rows.map((r) => ({ id: String(r.id), ...r }));
          }}
          uploadFn={async (items) => {
            const r = await fetch(`https://clozr-auth.pyter-import.workers.dev/workspaces/${activeWorkspaceId}/tasks/import`, {
              method: "POST",
              headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
              body: JSON.stringify({ items }),
            });
            const j = await r.json() as { imported?: number; skipped?: number; error?: string };
            return r.ok ? { imported: j.imported ?? 0, skipped: j.skipped ?? 0 } : { error: j.error ?? "http_error" };
          }}
          isOwner={isOwner}
          bootstrapStatus={bootstrapStatus}
          activeWorkspaceId={activeWorkspaceId!}
          setBootstrapStatus={setBootstrapStatus}
          showToast={showToast}
        />
        <SimpleFeatureCard
          icon={Coins} label="Caja (movimientos)" feature="cash"
          desc="Ingresos y egresos de caja. Tu equipo ve el saldo en tiempo real."
          fetchLocal={async () => (await dbSelect<{ n: number }>("SELECT COUNT(*) AS n FROM cash_movements WHERE workspace_id = ?", [localWid]))[0]?.n ?? 0}
          fetchCloud={async () => { const r = await cashApi.list(jwt, activeWorkspaceId!); return r.ok ? r.data.items.length : 0; }}
          collectLocal={async () => {
            const rows = await dbSelect<Record<string, unknown>>("SELECT * FROM cash_movements WHERE workspace_id = ?", [localWid]);
            return rows.map((r) => ({
              id: String(r.id),
              kind: String(r.kind),
              amount: Number(r.amount),
              currency: String(r.currency ?? "ARS"),
              description: r.description as string | null,
              category: r.category as string | null,
              sale_id: r.sale_id as string | null,
              customer_name: r.customer_name as string | null,
              payment_method: r.payment_method as string | null,
              moved_at: String(r.created_at ?? r.moved_at ?? ""),
            }));
          }}
          uploadFn={async (items) => {
            const r = await fetch(`https://clozr-auth.pyter-import.workers.dev/workspaces/${activeWorkspaceId}/cash/import`, {
              method: "POST",
              headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
              body: JSON.stringify({ items }),
            });
            const j = await r.json() as { imported?: number; skipped?: number; error?: string };
            return r.ok ? { imported: j.imported ?? 0, skipped: j.skipped ?? 0 } : { error: j.error ?? "http_error" };
          }}
          isOwner={isOwner}
          bootstrapStatus={bootstrapStatus}
          activeWorkspaceId={activeWorkspaceId!}
          setBootstrapStatus={setBootstrapStatus}
          showToast={showToast}
        />
        <SimpleFeatureCard
          icon={Bell} label="Follow-ups" feature="followups"
          desc="Recordatorios de seguimiento de clientes."
          fetchLocal={async () => (await dbSelect<{ n: number }>("SELECT COUNT(*) AS n FROM followups WHERE workspace_id = ?", [localWid]))[0]?.n ?? 0}
          fetchCloud={async () => { const r = await followupsApi.list(jwt, activeWorkspaceId!); return r.ok ? r.data.items.length : 0; }}
          collectLocal={async () => {
            const rows = await dbSelect<Record<string, unknown>>("SELECT * FROM followups WHERE workspace_id = ?", [localWid]);
            return rows.map((r) => ({
              id: String(r.id),
              customer_id: String(r.customer_id),
              customer_name: r.customer_name as string | null,
              reason: r.reason as string | null,
              text: String(r.text ?? ""),
              due_at: String(r.due_date ?? r.due_at ?? ""),
              days_since_contact: r.days_since_contact as number | null,
              amount: r.amount as number | null,
              notes: r.notes as string | null,
              completed_at: r.completed_at as string | null,
            }));
          }}
          uploadFn={async (items) => {
            const r = await fetch(`https://clozr-auth.pyter-import.workers.dev/workspaces/${activeWorkspaceId}/followups/import`, {
              method: "POST",
              headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
              body: JSON.stringify({ items }),
            });
            const j = await r.json() as { imported?: number; skipped?: number; error?: string };
            return r.ok ? { imported: j.imported ?? 0, skipped: j.skipped ?? 0 } : { error: j.error ?? "http_error" };
          }}
          requires={["customers"]}
          isOwner={isOwner}
          bootstrapStatus={bootstrapStatus}
          activeWorkspaceId={activeWorkspaceId!}
          setBootstrapStatus={setBootstrapStatus}
          showToast={showToast}
          customersStatus={customersStatus}
        />
        <SimpleFeatureCard
          icon={Package} label="Catálogo" feature="catalog"
          desc="Productos disponibles. Comparte precios y stock con tu equipo."
          fetchLocal={async () => (await dbSelect<{ n: number }>("SELECT COUNT(*) AS n FROM catalog_items WHERE workspace_id = ?", [localWid]))[0]?.n ?? 0}
          fetchCloud={async () => { const r = await catalogApi.list(jwt, activeWorkspaceId!); return r.ok ? r.data.items.length : 0; }}
          collectLocal={async () => {
            const rows = await dbSelect<Record<string, unknown>>("SELECT * FROM catalog_items WHERE workspace_id = ?", [localWid]);
            return rows.map((r) => ({ id: String(r.id), ...r }));
          }}
          uploadFn={async (items) => {
            const r = await fetch(`https://clozr-auth.pyter-import.workers.dev/workspaces/${activeWorkspaceId}/catalog/import`, {
              method: "POST",
              headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
              body: JSON.stringify({ items }),
            });
            const j = await r.json() as { imported?: number; skipped?: number; error?: string };
            return r.ok ? { imported: j.imported ?? 0, skipped: j.skipped ?? 0 } : { error: j.error ?? "http_error" };
          }}
          isOwner={isOwner}
          bootstrapStatus={bootstrapStatus}
          activeWorkspaceId={activeWorkspaceId!}
          setBootstrapStatus={setBootstrapStatus}
          showToast={showToast}
        />
        <SimpleFeatureCard
          icon={CreditCard} label="Métodos de pago" feature="paymentMethods"
          desc="Las formas de pago aceptadas (efectivo, MP, transferencia, etc)."
          fetchLocal={async () => (await dbSelect<{ n: number }>("SELECT COUNT(*) AS n FROM payment_methods WHERE workspace_id = ?", [localWid]))[0]?.n ?? 0}
          fetchCloud={async () => { const r = await paymentMethodsApi.list(jwt, activeWorkspaceId!); return r.ok ? r.data.items.length : 0; }}
          collectLocal={async () => {
            const rows = await dbSelect<Record<string, unknown>>("SELECT * FROM payment_methods WHERE workspace_id = ?", [localWid]);
            return rows.map((r) => ({ id: String(r.id), ...r }));
          }}
          uploadFn={async (items) => {
            const r = await fetch(`https://clozr-auth.pyter-import.workers.dev/workspaces/${activeWorkspaceId}/payment-methods/import`, {
              method: "POST",
              headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
              body: JSON.stringify({ items }),
            });
            const j = await r.json() as { imported?: number; skipped?: number; error?: string };
            return r.ok ? { imported: j.imported ?? 0, skipped: j.skipped ?? 0 } : { error: j.error ?? "http_error" };
          }}
          isOwner={isOwner}
          bootstrapStatus={bootstrapStatus}
          activeWorkspaceId={activeWorkspaceId!}
          setBootstrapStatus={setBootstrapStatus}
          showToast={showToast}
        />
        <SimpleFeatureCard
          icon={Users} label="Tipos de cliente" feature="customerTypes"
          desc="Tu segmentación de clientes (final, mayorista, etc)."
          fetchLocal={async () => (await dbSelect<{ n: number }>("SELECT COUNT(*) AS n FROM customer_types WHERE workspace_id = ?", [localWid]))[0]?.n ?? 0}
          fetchCloud={async () => { const r = await customerTypesApi.list(jwt, activeWorkspaceId!); return r.ok ? r.data.items.length : 0; }}
          collectLocal={async () => {
            const rows = await dbSelect<Record<string, unknown>>("SELECT * FROM customer_types WHERE workspace_id = ?", [localWid]);
            return rows.map((r) => ({ id: String(r.id), ...r }));
          }}
          uploadFn={async (items) => {
            const r = await fetch(`https://clozr-auth.pyter-import.workers.dev/workspaces/${activeWorkspaceId}/customer-types/import`, {
              method: "POST",
              headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
              body: JSON.stringify({ items }),
            });
            const j = await r.json() as { imported?: number; skipped?: number; error?: string };
            return r.ok ? { imported: j.imported ?? 0, skipped: j.skipped ?? 0 } : { error: j.error ?? "http_error" };
          }}
          isOwner={isOwner}
          bootstrapStatus={bootstrapStatus}
          activeWorkspaceId={activeWorkspaceId!}
          setBootstrapStatus={setBootstrapStatus}
          showToast={showToast}
        />
        <SimpleFeatureCard
          icon={Tag} label="Etiquetas de cliente" feature="customerTags"
          desc="Etiquetas para marcar clientes (VIP, deudor, etc)."
          fetchLocal={async () => (await dbSelect<{ n: number }>("SELECT COUNT(*) AS n FROM customer_tags WHERE workspace_id = ?", [localWid]))[0]?.n ?? 0}
          fetchCloud={async () => { const r = await customerTagsApi.list(jwt, activeWorkspaceId!); return r.ok ? r.data.items.length : 0; }}
          collectLocal={async () => {
            const rows = await dbSelect<Record<string, unknown>>("SELECT * FROM customer_tags WHERE workspace_id = ?", [localWid]);
            return rows.map((r) => ({ id: String(r.id), ...r }));
          }}
          uploadFn={async (items) => {
            const r = await fetch(`https://clozr-auth.pyter-import.workers.dev/workspaces/${activeWorkspaceId}/customer-tags/import`, {
              method: "POST",
              headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
              body: JSON.stringify({ items }),
            });
            const j = await r.json() as { imported?: number; skipped?: number; error?: string };
            return r.ok ? { imported: j.imported ?? 0, skipped: j.skipped ?? 0 } : { error: j.error ?? "http_error" };
          }}
          isOwner={isOwner}
          bootstrapStatus={bootstrapStatus}
          activeWorkspaceId={activeWorkspaceId!}
          setBootstrapStatus={setBootstrapStatus}
          showToast={showToast}
        />
      </div>
    </div>
  );
}

/* ── Reusable feature card (DRY para R3-R5) ──────────────────────────── */

interface SimpleFeatureCardProps {
  icon: React.ComponentType<{ size?: number | string; color?: string }>;
  label: string;
  feature: "sales" | "tasks" | "cash" | "followups" | "catalog" | "paymentMethods" | "customerTypes" | "customerTags";
  desc: string;
  fetchLocal: () => Promise<number>;
  fetchCloud: () => Promise<number>;
  collectLocal: () => Promise<unknown[]>;
  uploadFn: (items: unknown[]) => Promise<{ imported: number; skipped: number } | { error: string }>;
  requires?: Array<"customers">;
  isOwner: boolean;
  bootstrapStatus: Record<string, Record<string, "pending" | "done" | "skip" | undefined>>;
  activeWorkspaceId: string;
  setBootstrapStatus: (wsId: string, feature: SimpleFeatureCardProps["feature"], status: "pending" | "done" | "skip") => void;
  showToast: (msg: string, kind?: "success" | "error") => void;
  customersStatus?: "pending" | "done" | "skip";
}

function SimpleFeatureCard(props: SimpleFeatureCardProps) {
  const { icon: Icon, label, feature, desc, requires, isOwner } = props;
  const status = props.bootstrapStatus[props.activeWorkspaceId]?.[feature] ?? "pending";
  const [localN, setLocalN] = useState<number | null>(null);
  const [cloudN, setCloudN] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const blockedByCustomers = requires?.includes("customers") && props.customersStatus === "pending";

  useEffect(() => {
    let mounted = true;
    Promise.all([props.fetchLocal(), props.fetchCloud()]).then(([l, c]) => {
      if (mounted) { setLocalN(l); setCloudN(c); }
    }).catch(() => {});
    return () => { mounted = false; };
  }, [feature, status]);

  async function handleUpload() {
    if (blockedByCustomers) { props.showToast("Primero subí Clientes", "error"); return; }
    setUploading(true);
    try {
      const items = await props.collectLocal();
      const res = await props.uploadFn(items);
      if ("error" in res) { props.showToast(`No se pudo: ${res.error}`, "error"); return; }
      props.setBootstrapStatus(props.activeWorkspaceId, feature, "done");
      props.showToast(`Subidos ${res.imported} ${label.toLowerCase()}` + (res.skipped > 0 ? ` (${res.skipped} ya estaban)` : ""), "success");
      setCloudN(res.imported + res.skipped);
    } finally { setUploading(false); }
  }

  async function handleSkip() {
    const ok = await confirmAsync({
      title: `Saltear ${label}`,
      message: `¿Saltear "${label}"? Los locales no se suben. Los nuevos sí irán a la nube.`,
      confirmText: "Saltear",
    });
    if (!ok) return;
    props.setBootstrapStatus(props.activeWorkspaceId, feature, "skip");
    props.showToast(`${label}: salteado`, "success");
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: space[3], marginBottom: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: status === "done" ? color.successBg : `${color.primary}22`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Icon size={16} color={status === "done" ? color.success : color.primary} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: text.sm, fontWeight: weight.semibold, color: color.text }}>{label}</div>
          <div style={{ fontSize: text.xs, color: color.textDim, marginTop: 2 }}>
            {status === "done" && <><CheckCircle2 size={11} color={color.success} style={{ verticalAlign: "middle" }} /> Sincronizado · {cloudN ?? "…"} en la nube</>}
            {status === "skip" && <><Cloud size={11} color={color.warning} style={{ verticalAlign: "middle" }} /> Salteado · {cloudN ?? "…"} en la nube</>}
            {status === "pending" && <><CloudOff size={11} color={color.textMuted} style={{ verticalAlign: "middle" }} /> Local · {localN ?? "…"} en tu PC, {cloudN ?? "…"} en la nube</>}
          </div>
        </div>
        {status === "pending" && isOwner && (
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={handleUpload} disabled={uploading || blockedByCustomers} style={btnPrimarySm} title={blockedByCustomers ? "Subí Clientes primero" : undefined}>
              {uploading ? <Loader2 size={12} className="spin" /> : <Cloud size={12} />} Subir
            </button>
            <button onClick={handleSkip} disabled={uploading} style={btnGhostSm}>Saltear</button>
          </div>
        )}
        {status === "pending" && !isOwner && (
          <span style={{ fontSize: text.xs, color: color.textDim, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <AlertCircle size={11} color={color.warning} /> Solo dueño
          </span>
        )}
      </div>
      <div style={{ fontSize: text.xs, color: color.textDim, lineHeight: 1.5, marginLeft: 44 }}>{desc}</div>
    </div>
  );
}

/* styles compartidos viven en ./cloudStyles.ts */
