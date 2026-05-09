import { dbSelect, dbExecute } from "./index";

/**
 * Etiquetas configurables que el workspace puede asignar a clientes.
 * Patrón análogo al de pipeline_stages — el user las edita desde Settings.
 *
 * Diseño:
 *   - customer_tags: definición de la etiqueta (nombre, color, orden)
 *   - customer_tag_assignments: junction many-to-many con clientes
 *
 * Color usa la misma paleta que el resto de la app (lib/colorPalette.ts).
 */

export interface CustomerTag {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface CustomerTagWithCount extends CustomerTag {
  customer_count: number;
}

export async function getAll(workspaceId: string): Promise<CustomerTag[]> {
  return dbSelect<CustomerTag>(
    "SELECT * FROM customer_tags WHERE workspace_id = ? ORDER BY sort_order ASC, name ASC",
    [workspaceId],
  );
}

export async function getAllWithCount(
  workspaceId: string,
): Promise<CustomerTagWithCount[]> {
  return dbSelect<CustomerTagWithCount>(
    `SELECT t.*, COUNT(a.customer_id) as customer_count
     FROM customer_tags t
     LEFT JOIN customer_tag_assignments a ON a.tag_id = t.id
     WHERE t.workspace_id = ?
     GROUP BY t.id
     ORDER BY t.sort_order ASC, t.name ASC`,
    [workspaceId],
  );
}

export async function create(
  workspaceId: string,
  data: { name: string; color?: string; sort_order?: number },
): Promise<CustomerTag> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const color = data.color ?? "gray";
  const sort = data.sort_order ?? Date.now();
  await dbExecute(
    `INSERT INTO customer_tags (id, workspace_id, name, color, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, workspaceId, data.name.trim(), color, sort, now],
  );
  return {
    id,
    workspace_id: workspaceId,
    name: data.name.trim(),
    color,
    sort_order: sort,
    created_at: now,
  };
}

export async function update(
  id: string,
  data: Partial<Pick<CustomerTag, "name" | "color" | "sort_order">>,
): Promise<void> {
  const updates: string[] = [];
  const values: unknown[] = [];
  if (data.name !== undefined) {
    updates.push("name = ?");
    values.push(data.name.trim());
  }
  if (data.color !== undefined) {
    updates.push("color = ?");
    values.push(data.color);
  }
  if (data.sort_order !== undefined) {
    updates.push("sort_order = ?");
    values.push(data.sort_order);
  }
  if (updates.length === 0) return;
  values.push(id);
  await dbExecute(
    `UPDATE customer_tags SET ${updates.join(", ")} WHERE id = ?`,
    values,
  );
}

export async function remove(id: string): Promise<void> {
  // assignments con FK ON DELETE CASCADE no aplica acá (no la definimos en
  // ensureSchema con FK explícita). Borramos manualmente.
  await dbExecute("DELETE FROM customer_tag_assignments WHERE tag_id = ?", [id]);
  await dbExecute("DELETE FROM customer_tags WHERE id = ?", [id]);
}

/* ── Asignaciones ──────────────────────────────────────────── */

/** Tags asignados a un cliente. */
export async function getForCustomer(customerId: string): Promise<CustomerTag[]> {
  return dbSelect<CustomerTag>(
    `SELECT t.* FROM customer_tags t
     JOIN customer_tag_assignments a ON a.tag_id = t.id
     WHERE a.customer_id = ?
     ORDER BY t.sort_order ASC, t.name ASC`,
    [customerId],
  );
}

/** Mapa customerId → tags[] — útil para listar muchos clientes con tags. */
export async function getForCustomerIds(
  customerIds: string[],
): Promise<Map<string, CustomerTag[]>> {
  const out = new Map<string, CustomerTag[]>();
  if (customerIds.length === 0) return out;
  const placeholders = customerIds.map(() => "?").join(", ");
  const rows = await dbSelect<CustomerTag & { customer_id: string }>(
    `SELECT t.*, a.customer_id as customer_id
     FROM customer_tags t
     JOIN customer_tag_assignments a ON a.tag_id = t.id
     WHERE a.customer_id IN (${placeholders})
     ORDER BY t.sort_order ASC, t.name ASC`,
    customerIds,
  );
  for (const r of rows) {
    const arr = out.get(r.customer_id) ?? [];
    const { customer_id: _drop, ...tag } = r;
    arr.push(tag);
    out.set(r.customer_id, arr);
  }
  return out;
}

export async function assign(customerId: string, tagId: string): Promise<void> {
  const now = new Date().toISOString();
  await dbExecute(
    `INSERT OR IGNORE INTO customer_tag_assignments (customer_id, tag_id, assigned_at)
     VALUES (?, ?, ?)`,
    [customerId, tagId, now],
  );
}

export async function unassign(
  customerId: string,
  tagId: string,
): Promise<void> {
  await dbExecute(
    "DELETE FROM customer_tag_assignments WHERE customer_id = ? AND tag_id = ?",
    [customerId, tagId],
  );
}

/** Reemplaza el set de tags de un cliente atómicamente. */
export async function setForCustomer(
  customerId: string,
  tagIds: string[],
): Promise<void> {
  await dbExecute(
    "DELETE FROM customer_tag_assignments WHERE customer_id = ?",
    [customerId],
  );
  const now = new Date().toISOString();
  for (const tagId of tagIds) {
    await dbExecute(
      `INSERT OR IGNORE INTO customer_tag_assignments (customer_id, tag_id, assigned_at)
       VALUES (?, ?, ?)`,
      [customerId, tagId, now],
    );
  }
}

export const customerTagsDb = {
  getAll,
  getAllWithCount,
  create,
  update,
  remove,
  getForCustomer,
  getForCustomerIds,
  assign,
  unassign,
  setForCustomer,
};
