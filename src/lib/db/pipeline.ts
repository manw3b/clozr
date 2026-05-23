import { dbSelect, dbExecute } from "./index";
import type {
  PipelineItem,
  PipelineActivity,
  CreatePipelineItemInput,
  CreateActivityInput,
  UrgentPipelineItem,
} from "./types";
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import { log } from "../logger";
import {
  fetchPipelineItems,
  createPipelineItemCloud,
  updatePipelineItemCloud,
  type CloudPipelineItem,
} from "../cloudAuth";

/**
 * pipelineDb — local↔cloud dispatcher (F2-B R2).
 * Cuando isCloudModeFor("pipeline") devuelve true, las operaciones
 * críticas pegan al worker y hacen write-through a SQLite local.
 * Las operaciones de "actividad" (addActivity, getActivities) y la
 * de "urgent" quedan locales por ahora — se migrarán cuando sean
 * críticas para multi-PC.
 */

function cloudCtx(): { jwt: string; wsId: string } | null {
  const s = useCloudAuthStore.getState();
  if (!s.isCloudModeFor("pipeline")) return null;
  if (!s.jwt || !s.activeWorkspaceId) return null;
  return { jwt: s.jwt, wsId: s.activeWorkspaceId };
}

function cloudToLocal(c: CloudPipelineItem, localWorkspaceId: string): PipelineItem {
  return {
    id: c.id,
    workspace_id: localWorkspaceId,
    customer_id: c.customer_id,
    customer_name: c.customer_name,
    stage_id: c.stage_id,
    stage_name: c.stage_name,
    stage_order: c.stage_order,
    status: c.status,
    estimated_value: c.estimated_value,
    currency: (c.currency ?? "ARS") as "ARS" | "USD",
    inactive_days: c.inactive_days ?? 0,
    closed_at: c.closed_at,
    created_by: c.created_by,
    created_at: c.created_at,
    updated_at: c.updated_at,
    last_activity_at: null,
    product: c.product,
    next_action_at: c.next_action_at,
    next_action_label: c.next_action_label,
    owner_id: c.owner_id,
    owner_name: c.owner_name,
    short_note: c.short_note,
    priority: c.priority,
    position: c.position,
    wholesale_code: c.wholesale_code,
    visit_at: c.visit_at,
    lead_source: c.lead_source,
    catalog_item_id: c.catalog_item_id,
  } as PipelineItem;
}

export async function getAll(workspaceId: string): Promise<PipelineItem[]> {
  const ctx = cloudCtx();
  if (ctx) {
    const res = await fetchPipelineItems(ctx.jwt, ctx.wsId);
    if (res.ok) {
      // Filtramos status='open' acá (en cloud no filtramos en la query
      // porque queremos exponer también closed_at en algunos casos).
      return res.data.items
        .filter((i) => i.status === "open")
        .map((i) => cloudToLocal(i, workspaceId));
    }
    // Fallback al cache local si cloud falla.
    log.warn("getAll cloud falló, fallback local", { scope: "pipelineDb", data: { error: res.error } });
  }
  return dbSelect<PipelineItem>(
    `SELECT p.*, c.name AS customer_name,
      (SELECT performed_at FROM pipeline_activities
       WHERE pipeline_item_id = p.id ORDER BY performed_at DESC LIMIT 1
      ) AS last_activity_at
     FROM pipeline_items p
     LEFT JOIN customers c ON c.id = p.customer_id
     WHERE p.workspace_id = ? AND p.status = 'open'
     ORDER BY p.stage_order ASC, p.updated_at DESC`,
    [workspaceId],
  );
}

export async function getByCustomer(
  workspaceId: string,
  customerId: string,
): Promise<PipelineItem[]> {
  return dbSelect<PipelineItem>(
    `SELECT p.*, c.name AS customer_name,
      (SELECT performed_at FROM pipeline_activities
       WHERE pipeline_item_id = p.id ORDER BY performed_at DESC LIMIT 1
      ) AS last_activity_at
     FROM pipeline_items p
     LEFT JOIN customers c ON c.id = p.customer_id
     WHERE p.workspace_id = ? AND p.customer_id = ?
     ORDER BY p.created_at DESC`,
    [workspaceId, customerId],
  );
}

export async function create(
  workspaceId: string,
  data: CreatePipelineItemInput,
): Promise<PipelineItem> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const currency = data.currency ?? "USD";

  const ctx = cloudCtx();
  if (ctx) {
    const res = await createPipelineItemCloud(ctx.jwt, ctx.wsId, {
      id,
      customer_id: data.customer_id,
      customer_name: data.customer_name ?? null,
      stage_id: data.stage_id,
      stage_name: data.stage_name,
      stage_order: data.stage_order,
      status: "open",
      estimated_value: data.estimated_value ?? null,
      currency,
      product: data.product ?? null,
      priority: data.priority ?? null,
      next_action_at: data.next_action_at ?? null,
      next_action_label: data.next_action_label ?? null,
      short_note: data.short_note ?? null,
      lead_source: data.lead_source ?? null,
      catalog_item_id: data.catalog_item_id ?? null,
    });
    if (!res.ok) throw new Error(`No se pudo crear lead en la nube: ${res.error}`);
    // Devolvemos el item localmente sintetizado — el caller espera
    // PipelineItem completo; no esperamos otro GET.
    return {
      id, workspace_id: workspaceId,
      customer_id: data.customer_id,
      customer_name: data.customer_name ?? null,
      stage_id: data.stage_id, stage_name: data.stage_name, stage_order: data.stage_order,
      status: "open",
      estimated_value: data.estimated_value ?? null,
      currency, inactive_days: 0, closed_at: null,
      created_by: data.created_by ?? null, created_at: now, updated_at: now,
      last_activity_at: null,
      product: data.product ?? null,
      next_action_at: data.next_action_at ?? null,
      next_action_label: data.next_action_label ?? null,
      owner_id: null, owner_name: null,
      short_note: data.short_note ?? null,
      priority: data.priority ?? null,
      position: null,
      wholesale_code: null, visit_at: null,
      lead_source: data.lead_source ?? null,
      catalog_item_id: data.catalog_item_id ?? null,
    } as PipelineItem;
  }

  await dbExecute(
    `INSERT INTO pipeline_items (
      id, workspace_id, customer_id, customer_name, stage_id, stage_name, stage_order,
      status, estimated_value, currency, inactive_days, created_by, created_at, updated_at,
      product, priority, next_action_at, next_action_label, short_note,
      lead_source, catalog_item_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      data.customer_id,
      data.customer_name ?? null,
      data.stage_id,
      data.stage_name,
      data.stage_order,
      data.estimated_value ?? null,
      currency,
      data.created_by ?? null,
      now,
      now,
      data.product ?? null,
      data.priority ?? null,
      data.next_action_at ?? null,
      data.next_action_label ?? null,
      data.short_note ?? null,
      data.lead_source ?? null,
      data.catalog_item_id ?? null,
    ],
  );
  return {
    id,
    workspace_id: workspaceId,
    customer_id: data.customer_id,
    customer_name: data.customer_name ?? null,
    stage_id: data.stage_id,
    stage_name: data.stage_name,
    stage_order: data.stage_order,
    status: "open",
    estimated_value: data.estimated_value ?? null,
    currency,
    inactive_days: 0,
    closed_at: null,
    created_by: data.created_by ?? null,
    created_at: now,
    updated_at: now,
    last_activity_at: null,
    product: data.product ?? null,
    next_action_at: data.next_action_at ?? null,
    next_action_label: data.next_action_label ?? null,
    owner_id: null,
    owner_name: null,
    short_note: data.short_note ?? null,
    priority: data.priority ?? null,
    position: null,
    wholesale_code: null,
    visit_at: null,
    lead_source: data.lead_source ?? null,
    catalog_item_id: data.catalog_item_id ?? null,
  };
}

export async function updateStage(
  id: string,
  stageId: string,
  stageName: string,
  stageOrder: number,
): Promise<void> {
  const ctx = cloudCtx();
  if (ctx) {
    const res = await updatePipelineItemCloud(ctx.jwt, ctx.wsId, id, {
      stage_id: stageId,
      stage_name: stageName,
      stage_order: stageOrder,
    });
    if (!res.ok) throw new Error(`No se pudo mover stage en la nube: ${res.error}`);
    return;
  }
  const now = new Date().toISOString();
  await dbExecute(
    "UPDATE pipeline_items SET stage_id = ?, stage_name = ?, stage_order = ?, updated_at = ? WHERE id = ?",
    [stageId, stageName, stageOrder, now, id],
  );
}

export async function closeItem(id: string, status: "won" | "lost"): Promise<void> {
  const ctx = cloudCtx();
  if (ctx) {
    const now = new Date().toISOString();
    const res = await updatePipelineItemCloud(ctx.jwt, ctx.wsId, id, { status, closed_at: now });
    if (!res.ok) throw new Error(`No se pudo cerrar lead en la nube: ${res.error}`);
    return;
  }
  const now = new Date().toISOString();
  await dbExecute(
    "UPDATE pipeline_items SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?",
    [status, now, now, id],
  );
}

/** Pospone la próxima acción del lead a `nextActionAt` (ISO string). Si
 *  ya había un label de próxima acción, se mantiene. */
export async function snooze(id: string, nextActionAt: string): Promise<void> {
  const ctx = cloudCtx();
  if (ctx) {
    const res = await updatePipelineItemCloud(ctx.jwt, ctx.wsId, id, { next_action_at: nextActionAt });
    if (!res.ok) throw new Error(`No se pudo posponer en la nube: ${res.error}`);
    return;
  }
  const now = new Date().toISOString();
  await dbExecute(
    "UPDATE pipeline_items SET next_action_at = ?, updated_at = ? WHERE id = ?",
    [nextActionAt, now, id],
  );
}

/**
 * Agenda una visita: mueve el lead a la etapa "visita-agendada", graba
 * `visit_at`, opcionalmente actualiza producto, y si recibió un
 * `wholesaleCode` (ya generado afuera) lo persiste. También copia el
 * timestamp a `next_action_at` para que la card siga ordenándose por
 * próxima acción.
 */
export async function scheduleVisit(
  id: string,
  data: {
    visitAt: string;
    product?: string | null;
    wholesaleCode?: string | null;
    /** stage del workspace; lo pasamos desde afuera por si el negocio renombró las etapas */
    stageId: string;
    stageName: string;
    stageOrder: number;
  },
): Promise<void> {
  const ctx = cloudCtx();
  if (ctx) {
    const patch: Record<string, unknown> = {
      stage_id: data.stageId,
      stage_name: data.stageName,
      stage_order: data.stageOrder,
      visit_at: data.visitAt,
      next_action_at: data.visitAt,
      next_action_label: "Visita agendada",
    };
    if (data.product != null) patch.product = data.product;
    if (data.wholesaleCode != null) patch.wholesale_code = data.wholesaleCode;
    const res = await updatePipelineItemCloud(ctx.jwt, ctx.wsId, id, patch);
    if (!res.ok) throw new Error(`No se pudo agendar en la nube: ${res.error}`);
    return;
  }
  const now = new Date().toISOString();
  await dbExecute(
    `UPDATE pipeline_items SET
       stage_id = ?, stage_name = ?, stage_order = ?,
       visit_at = ?, next_action_at = ?, next_action_label = ?,
       product = COALESCE(?, product),
       wholesale_code = COALESCE(?, wholesale_code),
       updated_at = ?
     WHERE id = ?`,
    [
      data.stageId,
      data.stageName,
      data.stageOrder,
      data.visitAt,
      data.visitAt,
      "Visita agendada",
      data.product ?? null,
      data.wholesaleCode ?? null,
      now,
      id,
    ],
  );
}

export async function addActivity(
  itemId: string,
  data: CreateActivityInput,
): Promise<PipelineActivity> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await dbExecute(
    `INSERT INTO pipeline_activities
      (id, pipeline_item_id, type, description, result, performed_at, performed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      itemId,
      data.type,
      data.description ?? null,
      data.result ?? null,
      now,
      data.performed_by ?? null,
    ],
  );
  await dbExecute(
    "UPDATE pipeline_items SET updated_at = ? WHERE id = ?",
    [now, itemId],
  );
  return {
    id,
    pipeline_item_id: itemId,
    type: data.type,
    description: data.description ?? null,
    result: data.result ?? null,
    performed_at: now,
    performed_by: data.performed_by ?? null,
  };
}

export async function getActivities(itemId: string): Promise<PipelineActivity[]> {
  return dbSelect<PipelineActivity>(
    "SELECT * FROM pipeline_activities WHERE pipeline_item_id = ? ORDER BY performed_at DESC",
    [itemId],
  );
}

export async function getUrgent(
  workspaceId: string,
  minDays: number,
  limit = 5,
): Promise<UrgentPipelineItem[]> {
  return dbSelect<UrgentPipelineItem>(
    `SELECT
       p.id,
       p.customer_id,
       p.customer_name,
       c.phone AS customer_phone,
       p.stage_name,
       CAST(
         (julianday('now') - julianday(COALESCE(
           (SELECT performed_at FROM pipeline_activities
            WHERE pipeline_item_id = p.id ORDER BY performed_at DESC LIMIT 1),
           p.created_at
         )))
       AS INTEGER) AS inactive_days
     FROM pipeline_items p
     LEFT JOIN customers c ON c.id = p.customer_id
     WHERE p.workspace_id = ? AND p.status = 'open'
     HAVING inactive_days >= ?
     ORDER BY inactive_days DESC
     LIMIT ?`,
    [workspaceId, minDays, limit],
  );
}

export const pipelineDb = {
  getAll,
  getByCustomer,
  create,
  updateStage,
  closeItem,
  snooze,
  scheduleVisit,
  addActivity,
  getActivities,
  getUrgent,
};
