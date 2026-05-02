import { dbSelect, dbExecute } from "./index";
import type { Customer, CreateCustomerInput, UpdateCustomerInput, CustomerType } from "./types";

export async function getAll(workspaceId: string): Promise<Customer[]> {
  return dbSelect<Customer>(
    "SELECT * FROM customers WHERE workspace_id = ? ORDER BY name ASC",
    [workspaceId],
  );
}

export async function getById(
  workspaceId: string,
  id: string,
): Promise<Customer | null> {
  const rows = await dbSelect<Customer>(
    "SELECT * FROM customers WHERE workspace_id = ? AND id = ?",
    [workspaceId, id],
  );
  return rows[0] ?? null;
}

export async function search(
  workspaceId: string,
  options: { query?: string; type?: CustomerType } = {},
): Promise<Customer[]> {
  const { query, type } = options;
  let sql = "SELECT * FROM customers WHERE workspace_id = ?";
  const params: unknown[] = [workspaceId];

  if (type) {
    sql += " AND type = ?";
    params.push(type);
  }

  if (query) {
    sql += " AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)";
    const like = `%${query}%`;
    params.push(like, like, like);
  }

  sql += " ORDER BY name ASC";
  return dbSelect<Customer>(sql, params);
}

export async function create(
  workspaceId: string,
  data: CreateCustomerInput,
  id: string = crypto.randomUUID(),
): Promise<Customer> {
  const now = new Date().toISOString();
  await dbExecute(
    `INSERT INTO customers (
      id, workspace_id, name, phone, email, type, status,
      barrio, address, notes, pricing_policy_json, avatar_path, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      data.name,
      data.phone ?? null,
      data.email ?? null,
      data.type ?? "final",
      data.status ?? "potencial",
      data.barrio ?? null,
      data.address ?? null,
      data.notes ?? null,
      data.pricing_policy_json ?? null,
      data.avatar_path ?? null,
      data.created_by ?? null,
      now,
      now,
    ],
  );
  return {
    id,
    workspace_id: workspaceId,
    name: data.name,
    phone: data.phone ?? null,
    email: data.email ?? null,
    type: data.type ?? "final",
    status: data.status ?? "potencial",
    pricing_policy_json: data.pricing_policy_json ?? null,
    barrio: data.barrio ?? null,
    address: data.address ?? null,
    notes: data.notes ?? null,
    avatar_path: data.avatar_path ?? null,
    total_sales: 0,
    created_by: data.created_by ?? null,
    created_at: now,
    updated_at: now,
  };
}

export async function update(
  workspaceId: string,
  id: string,
  data: UpdateCustomerInput,
): Promise<void> {
  const now = new Date().toISOString();
  const filtered = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined),
  );
  const updatable = { ...filtered, updated_at: now };
  const fields = Object.keys(updatable)
    .map((k) => `${k} = ?`)
    .join(", ");
  const values = [...Object.values(updatable), workspaceId, id];
  await dbExecute(
    `UPDATE customers SET ${fields} WHERE workspace_id = ? AND id = ?`,
    values,
  );
}

export async function remove(workspaceId: string, id: string): Promise<void> {
  await dbExecute(
    "DELETE FROM customers WHERE workspace_id = ? AND id = ?",
    [workspaceId, id],
  );
}

export const customersDb = { getAll, getById, search, create, update, remove };
