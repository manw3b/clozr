import { dbSelect, dbExecute } from "./index";

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

/** Registra una interacción con un cliente. Devuelve el id creado. */
export async function record(
  workspaceId: string,
  input: RecordContactInput,
): Promise<CustomerContact> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
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
  return dbSelect<CustomerContact>(
    `SELECT * FROM customer_contacts
     WHERE workspace_id = ? AND customer_id = ?
     ORDER BY at DESC LIMIT ?`,
    [workspaceId, customerId, limit],
  );
}

/** Devuelve el último contacto por cliente — útil para `Client.lastContactAt`. */
export async function lastContactByCustomer(
  workspaceId: string,
): Promise<Map<string, string>> {
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
}

export const customerContactsDb = {
  record,
  getForCustomer,
  lastContactByCustomer,
};
