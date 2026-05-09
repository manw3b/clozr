import { dbSelect, dbExecute } from "./index";
import type {
  PipelineItem,
  PipelineActivity,
  CreatePipelineItemInput,
  CreateActivityInput,
  UrgentPipelineItem,
} from "./types";

export async function getAll(workspaceId: string): Promise<PipelineItem[]> {
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
  await dbExecute(
    `INSERT INTO pipeline_items (
      id, workspace_id, customer_id, customer_name, stage_id, stage_name, stage_order,
      status, estimated_value, currency, inactive_days, created_by, created_at, updated_at,
      product, priority, next_action_at, next_action_label, short_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  };
}

export async function updateStage(
  id: string,
  stageId: string,
  stageName: string,
  stageOrder: number,
): Promise<void> {
  const now = new Date().toISOString();
  await dbExecute(
    "UPDATE pipeline_items SET stage_id = ?, stage_name = ?, stage_order = ?, updated_at = ? WHERE id = ?",
    [stageId, stageName, stageOrder, now, id],
  );
}

export async function closeItem(id: string, status: "won" | "lost"): Promise<void> {
  const now = new Date().toISOString();
  await dbExecute(
    "UPDATE pipeline_items SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?",
    [status, now, now, id],
  );
}

/** Pospone la próxima acción del lead a `nextActionAt` (ISO string). Si
 *  ya había un label de próxima acción, se mantiene. */
export async function snooze(id: string, nextActionAt: string): Promise<void> {
  const now = new Date().toISOString();
  await dbExecute(
    "UPDATE pipeline_items SET next_action_at = ?, updated_at = ? WHERE id = ?",
    [nextActionAt, now, id],
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
  addActivity,
  getActivities,
  getUrgent,
};
