import { dbSelect, dbExecute } from "./index";
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import { followupsApi, type CloudFollowup } from "../cloudAuth";
import type { Followup, CreateFollowupInput } from "./types";

function fuCloudCtx(): { jwt: string; wsId: string } | null {
  const s = useCloudAuthStore.getState();
  if (!s.isCloudModeFor("followups")) return null;
  if (!s.jwt || !s.activeWorkspaceId) return null;
  return { jwt: s.jwt, wsId: s.activeWorkspaceId };
}

function cloudFollowupToLocal(c: Record<string, unknown>, localWid: string, localBid: string): Followup {
  return {
    id: String(c.id),
    workspace_id: localWid,
    business_id: localBid,
    customer_id: String(c.customer_id),
    customer_name: (c.customer_name as string | null) ?? null,
    reason: (c.reason as string | null) ?? null,
    text: String(c.text ?? ""),
    due_date: String(c.due_at ?? ""),
    days_since_contact: (c.days_since_contact as number | null) ?? null,
    amount: (c.amount as number | null) ?? null,
    notes: (c.notes as string | null) ?? null,
    completed: c.completed_at ? 1 : 0,
    completed_at: (c.completed_at as string | null) ?? null,
    created_at: String(c.created_at ?? ""),
  } as unknown as Followup;
}

export async function getForDay(
  workspaceId: string,
  businessId: string,
  date: string,
): Promise<Followup[]> {
  const ctx = fuCloudCtx();
  if (ctx) {
    const res = await followupsApi.list(ctx.jwt, ctx.wsId);
    if (res.ok) {
      return (res.data.items as unknown as Array<Record<string, unknown>>)
        .map((c) => cloudFollowupToLocal(c, workspaceId, businessId))
        .filter((f) => f.due_date <= date || (f.due_date === date && f.completed === 0))
        .sort((a, b) => (a.completed - b.completed) || a.due_date.localeCompare(b.due_date));
    }
  }
  return dbSelect<Followup>(
    `SELECT * FROM followups
     WHERE workspace_id = ? AND business_id = ?
       AND (due_date <= ? OR (due_date = ? AND completed = 0))
     ORDER BY completed ASC, due_date ASC`,
    [workspaceId, businessId, date, date],
  );
}

export async function getAll(workspaceId: string, businessId: string): Promise<Followup[]> {
  const ctx = fuCloudCtx();
  if (ctx) {
    const res = await followupsApi.list(ctx.jwt, ctx.wsId);
    if (res.ok) {
      return (res.data.items as unknown as Array<Record<string, unknown>>)
        .map((c) => cloudFollowupToLocal(c, workspaceId, businessId))
        .sort((a, b) => (a.completed - b.completed) || a.due_date.localeCompare(b.due_date));
    }
  }
  return dbSelect<Followup>(
    `SELECT * FROM followups
     WHERE workspace_id = ? AND business_id = ?
     ORDER BY completed ASC, due_date ASC`,
    [workspaceId, businessId],
  );
}

export async function create(
  workspaceId: string,
  businessId: string,
  data: CreateFollowupInput,
): Promise<Followup> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const kind = data.kind ?? "manual";
  const out: Followup = {
    id, workspace_id: workspaceId, business_id: businessId,
    customer_id: data.customer_id ?? null, customer_name: data.customer_name ?? null,
    text: data.text, due_date: data.due_date,
    completed: 0, completed_at: null, created_at: now, kind,
  };

  const ctx = fuCloudCtx();
  if (ctx) {
    // El worker exige customer_id (NOT NULL). Followups manuales sin
    // cliente solo se soportan en modo local — en cloud los skipeamos
    // silenciosamente para no romper el flujo del vendedor.
    if (!data.customer_id) return out;
    const res = await followupsApi.create(ctx.jwt, ctx.wsId, {
      id,
      customer_id: data.customer_id,
      customer_name: data.customer_name ?? null,
      text: data.text,
      due_at: data.due_date,
    } as unknown as Partial<CloudFollowup> & { id?: string });
    if (!res.ok) throw new Error(`No se pudo crear el recordatorio en la nube: ${res.error}`);
    return out;
  }

  await dbExecute(
    `INSERT INTO followups (id, workspace_id, business_id, customer_id, customer_name, text, due_date, completed, created_at, kind)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, workspaceId, businessId, data.customer_id ?? null, data.customer_name ?? null, data.text, data.due_date, now, kind],
  );
  return out;
}

export async function toggleComplete(id: string, completed: boolean): Promise<void> {
  const now = new Date().toISOString();
  const ctx = fuCloudCtx();
  if (ctx) {
    // El estado completed en cloud se deriva de completed_at (no hay
    // columna `completed` separada — ver cloudFollowupToLocal).
    const res = await followupsApi.update(ctx.jwt, ctx.wsId, id, {
      completed_at: completed ? now : null,
    } as unknown as Partial<CloudFollowup>);
    if (!res.ok) throw new Error(`No se pudo actualizar el recordatorio en la nube: ${res.error}`);
    return;
  }
  await dbExecute(
    "UPDATE followups SET completed = ?, completed_at = ? WHERE id = ?",
    [completed ? 1 : 0, completed ? now : null, id],
  );
}

export async function remove(id: string): Promise<void> {
  const ctx = fuCloudCtx();
  if (ctx) {
    const res = await followupsApi.remove(ctx.jwt, ctx.wsId, id);
    if (!res.ok) throw new Error(`No se pudo borrar el recordatorio en la nube: ${res.error}`);
    return;
  }
  await dbExecute("DELETE FROM followups WHERE id = ?", [id]);
}

/**
 * Crea un followup de seguimiento post-venta a N días.
 * Idempotente por (customer_id + sale_date): si ya hay uno auto-postsale
 * pendiente para el cliente, no crea otro.
 */
export async function createPostSaleFollowup(
  workspaceId: string,
  businessId: string,
  customerId: string,
  customerName: string,
  productDescription: string,
  daysAfter = 30,
): Promise<void> {
  if (!customerId) return;
  const existing = await dbSelect<{ id: string }>(
    `SELECT id FROM followups
     WHERE workspace_id = ? AND customer_id = ? AND kind = 'auto-postsale' AND completed = 0
     LIMIT 1`,
    [workspaceId, customerId],
  ).catch(() => [] as Array<{ id: string }>);
  if (existing.length > 0) return;

  const due = new Date();
  due.setDate(due.getDate() + daysAfter);
  const dueIso = due.toISOString().slice(0, 10);

  await create(workspaceId, businessId, {
    customer_id: customerId,
    customer_name: customerName,
    text: `Post-venta · ${productDescription}`,
    due_date: dueIso,
    kind: "auto-postsale",
  });
}

/**
 * Escanea customers que compraron pero no en los últimos N días, y crea
 * followup auto-inactive para los que no tengan ya uno pendiente.
 * Corre en cada boot de la app — el WHERE NOT EXISTS asegura idempotencia.
 */
export async function scanInactiveCustomers(
  workspaceId: string,
  businessId: string,
  daysThreshold = 60,
): Promise<number> {
  // Customers con al menos 1 venta, última venta >= daysThreshold días atrás,
  // y sin followup auto-inactive activo
  const inactive = await dbSelect<{
    customer_id: string;
    customer_name: string;
    last_sale: string;
  }>(
    `SELECT s.customer_id, c.name as customer_name, MAX(s.sale_date) as last_sale
     FROM sales s
     JOIN customers c ON c.id = s.customer_id
     WHERE s.workspace_id = ? AND s.customer_id IS NOT NULL
     GROUP BY s.customer_id
     HAVING MAX(s.sale_date) < datetime('now', ?)
       AND NOT EXISTS (
         SELECT 1 FROM followups f
         WHERE f.workspace_id = s.workspace_id
           AND f.customer_id = s.customer_id
           AND f.kind = 'auto-inactive'
           AND f.completed = 0
       )
     LIMIT 50`,
    [workspaceId, `-${daysThreshold} days`],
  ).catch(() => [] as Array<{ customer_id: string; customer_name: string; last_sale: string }>);

  if (inactive.length === 0) return 0;

  const today = new Date().toISOString().slice(0, 10);
  let created = 0;
  for (const row of inactive) {
    const days = Math.floor(
      (Date.now() - new Date(row.last_sale).getTime()) / 86_400_000,
    );
    try {
      await create(workspaceId, businessId, {
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        text: `${row.customer_name} no compra hace ${days} días`,
        due_date: today,
        kind: "auto-inactive",
      });
      created++;
    } catch {
      /* ignore */
    }
  }
  return created;
}

/**
 * Crea un followup automático cuando un lead cambia de etapa en el pipeline.
 * Idempotente por (customer_id + same-day): si ya hay un auto-stage hoy
 * para ese cliente, se skipea — evita ráfaga de followups si el vendedor
 * mueve el lead varias veces seguidas.
 */
export async function createStageFollowup(
  workspaceId: string,
  businessId: string,
  customerId: string,
  customerName: string,
  text: string,
  daysAfter: number,
): Promise<void> {
  if (!customerId) return;
  const existing = await dbSelect<{ id: string }>(
    `SELECT id FROM followups
     WHERE workspace_id = ?
       AND customer_id = ?
       AND kind = 'auto-stage'
       AND completed = 0
       AND date(created_at) = date('now')
     LIMIT 1`,
    [workspaceId, customerId],
  ).catch(() => [] as Array<{ id: string }>);
  if (existing.length > 0) return;

  const due = new Date();
  due.setDate(due.getDate() + daysAfter);
  const dueIso = due.toISOString().slice(0, 10);

  await create(workspaceId, businessId, {
    customer_id: customerId,
    customer_name: customerName,
    text,
    due_date: dueIso,
    kind: "auto-stage",
  });
}

export const followupsDb = {
  getForDay,
  getAll,
  create,
  toggleComplete,
  remove,
  createPostSaleFollowup,
  createStageFollowup,
  scanInactiveCustomers,
};
