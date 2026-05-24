import { dbSelect, dbExecute } from "./index";
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import { customerContactsApi } from "../cloudAuth";
import { log } from "../logger";

export type ContactKind = "whatsapp" | "call" | "email" | "visit" | "note";

export interface CustomerContact {
  id: string;
  workspace_id: string;
  customer_id: string;
  kind: ContactKind;
  at: string;
  by_user_id: string | null;
  by_user_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface RecordContactInput {
  customer_id: string;
  kind: ContactKind;
  by_user_id?: string | null;
  by_user_name?: string | null;
  notes?: string | null;
}

/**
 * G/A2: dispatcher cloud↔local de customer_contacts. Cuando hay sesión
 * cloud, el log de interacciones vive en Turso → Caro ve lo que vos
 * registraste y viceversa. El "días sin contacto" deja de divergir.
 */
function cloudCtx(): { jwt: string; wsId: string } | null {
  const s = useCloudAuthStore.getState();
  if (!s.isLoggedIn() || !s.activeWorkspaceId) return null;
  return { jwt: s.jwt!, wsId: s.activeWorkspaceId };
}

/** Registra una interacción con un cliente. Devuelve el id creado. */
export async function record(
  workspaceId: string,
  input: RecordContactInput,
): Promise<CustomerContact> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const ctx = cloudCtx();
  if (ctx) {
    const res = await customerContactsApi.create(ctx.jwt, ctx.wsId, input.customer_id, {
      id,
      kind: input.kind,
      notes: input.notes ?? null,
      contacted_by_name: input.by_user_name ?? null,
      contacted_at: now,
    });
    if (!res.ok) throw new Error(`No se pudo registrar contacto en la nube: ${res.error}`);
    return {
      id,
      workspace_id: workspaceId,
      customer_id: input.customer_id,
      kind: input.kind,
      at: now,
      by_user_id: useCloudAuthStore.getState().userId,
      by_user_name: input.by_user_name ?? null,
      notes: input.notes ?? null,
      created_at: now,
    };
  }

  await dbExecute(
    `INSERT INTO customer_contacts
       (id, workspace_id, customer_id, kind, at, by_user_id, by_user_name, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      input.customer_id,
      input.kind,
      now,
      input.by_user_id ?? null,
      input.by_user_name ?? null,
      input.notes ?? null,
      now,
    ],
  );
  return {
    id,
    workspace_id: workspaceId,
    customer_id: input.customer_id,
    kind: input.kind,
    at: now,
    by_user_id: input.by_user_id ?? null,
    by_user_name: input.by_user_name ?? null,
    notes: input.notes ?? null,
    created_at: now,
  };
}

/** Lista los contactos más recientes para un cliente. */
export async function getForCustomer(
  workspaceId: string,
  customerId: string,
  limit = 50,
): Promise<CustomerContact[]> {
  const ctx = cloudCtx();
  if (ctx) {
    const res = await customerContactsApi.list(ctx.jwt, ctx.wsId, customerId);
    if (res.ok) {
      return res.data.items.slice(0, limit).map((c) => ({
        id: c.id,
        workspace_id: workspaceId,
        customer_id: c.customer_id,
        kind: c.kind as ContactKind,
        at: c.contacted_at,
        by_user_id: c.contacted_by,
        by_user_name: c.contacted_by_name,
        notes: c.notes,
        created_at: c.created_at,
      }));
    }
    log.warn("getForCustomer cloud falló, fallback local", { scope: "customerContactsDb", data: { error: res.error } });
  }
  return dbSelect<CustomerContact>(
    `SELECT * FROM customer_contacts
     WHERE workspace_id = ? AND customer_id = ?
     ORDER BY at DESC LIMIT ?`,
    [workspaceId, customerId, limit],
  );
}

/** Devuelve el último contacto por cliente — útil para `Client.lastContactAt`.
 *  Si la tabla no existe (migración no aplicada todavía), devuelve un Map vacío
 *  en vez de propagar el error. Esto evita que el listado de Clientes se rompa
 *  por algo que es enriquecimiento opcional. */
export async function lastContactByCustomer(
  workspaceId: string,
): Promise<Map<string, string>> {
  const ctx = cloudCtx();
  if (ctx) {
    try {
      const res = await customerContactsApi.lastByCustomer(ctx.jwt, ctx.wsId);
      if (res.ok) {
        const m = new Map<string, string>();
        for (const [cid, at] of Object.entries(res.data.lastByCustomer)) {
          m.set(cid, at);
        }
        return m;
      }
    } catch (e) {
      log.warn("lastContactByCustomer cloud falló, fallback local", { scope: "customerContactsDb", err: e });
    }
  }
  try {
    const rows = await dbSelect<{ customer_id: string; last_at: string }>(
      `SELECT customer_id, MAX(at) AS last_at
       FROM customer_contacts
       WHERE workspace_id = ?
       GROUP BY customer_id`,
      [workspaceId],
    );
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.customer_id, r.last_at);
    return m;
  } catch {
    return new Map();
  }
}

export const customerContactsDb = {
  record,
  getForCustomer,
  lastContactByCustomer,
};
