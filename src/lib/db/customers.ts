import { dbSelect, dbExecute } from "./index";
import type { Customer, CreateCustomerInput, UpdateCustomerInput, CustomerType } from "./types";
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import {
  fetchCustomers as fetchCustomersCloud,
  createCustomerCloud,
  updateCustomerCloud,
  deleteCustomerCloud,
  type CloudCustomer,
} from "../cloudAuth";

/**
 * customersDb — capa unificada local ↔ cloud.
 *
 * Por feature usamos un flag (`isCloudModeFor("customers")` en
 * cloudAuthStore) que decide a dónde van las queries:
 *   - cloud mode OFF: igual que antes (SQLite local)
 *   - cloud mode ON: API REST al worker; en éxito, write-through a
 *     SQLite local como cache (para resiliency offline + arranque rápido)
 *
 * Cuando cloud mode está ON, el workspaceId que pasan los callers es el
 * LOCAL — lo ignoramos y usamos el cloud workspaceId del store. Hay un
 * solo cloud workspace activo a la vez, así que no hay ambigüedad.
 */

/* ── helpers ─────────────────────────────────────────────────────────── */

function cloudCtx(): { jwt: string; wsId: string } | null {
  const s = useCloudAuthStore.getState();
  if (!s.isCloudModeFor("customers")) return null;
  if (!s.jwt || !s.activeWorkspaceId) return null;
  return { jwt: s.jwt, wsId: s.activeWorkspaceId };
}

/** Mapea un CloudCustomer al shape del Customer local. La diferencia
 *  clave: total_sales viene en 0 hasta que R3 migre sales (cuando esté
 *  todo en cloud, lo computamos del JOIN). */
function cloudToLocal(c: CloudCustomer, localWorkspaceId: string): Customer {
  return {
    id: c.id,
    // Mantenemos el local workspaceId que el caller esperaba — la UI
    // del cliente filtra por ese workspaceId, no podemos romper el contrato.
    workspace_id: localWorkspaceId,
    name: c.name,
    phone: c.phone,
    email: c.email,
    type: (c.type as CustomerType | null) ?? "final",
    status: c.status ?? "potencial",
    pricing_policy_json: c.pricing_policy_json,
    barrio: c.barrio,
    address: c.address,
    notes: c.notes,
    avatar_path: c.avatar_path,
    total_sales: 0, // TODO R3: derivar del cloud sales
    created_by: c.created_by,
    created_at: c.created_at,
    updated_at: c.updated_at,
    instagram: c.instagram,
    facebook: c.facebook,
    tiktok: c.tiktok,
    twitter: c.twitter,
  } as Customer;
}

/* ── local-only helpers (write-through cache) ────────────────────────── */

async function upsertLocal(c: Customer): Promise<void> {
  // INSERT con conflict UPDATE — mantiene la cache local en sync con
  // el cloud. Si por algún motivo falla, no lo propagamos (es cache).
  try {
    await dbExecute(
      `INSERT INTO customers (
        id, workspace_id, name, phone, email, type, status,
        barrio, address, notes, pricing_policy_json, avatar_path,
        created_by, created_at, updated_at,
        instagram, facebook, tiktok, twitter
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, phone = excluded.phone, email = excluded.email,
        type = excluded.type, status = excluded.status,
        barrio = excluded.barrio, address = excluded.address, notes = excluded.notes,
        pricing_policy_json = excluded.pricing_policy_json,
        avatar_path = excluded.avatar_path,
        updated_at = excluded.updated_at,
        instagram = excluded.instagram, facebook = excluded.facebook,
        tiktok = excluded.tiktok, twitter = excluded.twitter`,
      [
        c.id, c.workspace_id, c.name, c.phone, c.email, c.type, c.status,
        c.barrio, c.address, c.notes, c.pricing_policy_json, c.avatar_path,
        c.created_by, c.created_at, c.updated_at,
        c.instagram, c.facebook, c.tiktok, c.twitter,
      ],
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[customersDb] write-through local cache failed:", e);
  }
}

/* ── operaciones públicas ────────────────────────────────────────────── */

export async function getAll(workspaceId: string): Promise<Customer[]> {
  const ctx = cloudCtx();
  if (ctx) {
    const res = await fetchCustomersCloud(ctx.jwt, ctx.wsId);
    if (res.ok) {
      // NOTA: removí el write-through a SQLite local. Antes hacíamos
      // upsertLocal de cada customer en cada poll, lo que con 200 customers
      // y polling 5s daba ~2400 writes/min sin que NADIE consulte la cache
      // local en cloud mode. Era pura sobrecarga.
      // Si en el futuro queremos "modo offline" (ver datos cuando se cae
      // internet), reintroducimos cache pero con un write rate más bajo
      // (ej: solo al primer fetch del día, o un debounce 5min).
      return res.data.customers.map((c) => cloudToLocal(c, workspaceId));
    }
    // eslint-disable-next-line no-console
    console.warn("[customersDb.getAll] cloud failed, leyendo cache local:", res.error);
  }
  return dbSelect<Customer>(
    "SELECT * FROM customers WHERE workspace_id = ? ORDER BY name ASC",
    [workspaceId],
  );
}

export async function getById(
  workspaceId: string,
  id: string,
): Promise<Customer | null> {
  // Para getById no hay endpoint individual todavía — usamos el cache
  // local que se hidrata por getAll() en background. Suficiente para
  // los casos actuales (drawer, edit form) porque siempre vienen de
  // una lista ya cargada.
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
  // Search en cache local — suficiente porque getAll() acaba de
  // hidratar. Si en un futuro necesitamos full-text del cloud, agregamos
  // endpoint dedicado.
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
  const customer: Customer = {
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
    instagram: data.instagram ?? null,
    facebook: data.facebook ?? null,
    tiktok: data.tiktok ?? null,
    twitter: data.twitter ?? null,
  };

  const ctx = cloudCtx();
  if (ctx) {
    const res = await createCustomerCloud(ctx.jwt, ctx.wsId, {
      id, // mantenemos el mismo UUID
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      type: customer.type,
      status: customer.status,
      pricing_policy_json: customer.pricing_policy_json,
      barrio: customer.barrio,
      address: customer.address,
      notes: customer.notes,
      avatar_path: customer.avatar_path,
      instagram: customer.instagram,
      facebook: customer.facebook,
      tiktok: customer.tiktok,
      twitter: customer.twitter,
    });
    if (!res.ok) {
      throw new Error(`No se pudo crear en la nube: ${res.error}`);
    }
    // Write-through al local.
    void upsertLocal(customer);
    return customer;
  }

  await dbExecute(
    `INSERT INTO customers (
      id, workspace_id, name, phone, email, type, status,
      barrio, address, notes, pricing_policy_json, avatar_path, created_by, created_at, updated_at,
      instagram, facebook, tiktok, twitter
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, workspaceId, customer.name, customer.phone, customer.email,
      customer.type, customer.status,
      customer.barrio, customer.address, customer.notes,
      customer.pricing_policy_json, customer.avatar_path,
      customer.created_by, now, now,
      customer.instagram, customer.facebook, customer.tiktok, customer.twitter,
    ],
  );
  return customer;
}

export async function update(
  workspaceId: string,
  id: string,
  data: UpdateCustomerInput,
): Promise<void> {
  const ctx = cloudCtx();
  if (ctx) {
    const res = await updateCustomerCloud(ctx.jwt, ctx.wsId, id, data as Partial<CloudCustomer>);
    if (!res.ok) {
      throw new Error(`No se pudo actualizar en la nube: ${res.error}`);
    }
    // Write-through al local. Hacemos un UPDATE simple — si la fila no
    // existe en local (cliente creado por otro PC), no pasa nada.
    const now = new Date().toISOString();
    const filtered = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined),
    );
    const updatable = { ...filtered, updated_at: now };
    const fields = Object.keys(updatable).map((k) => `${k} = ?`).join(", ");
    const values = [...Object.values(updatable), workspaceId, id];
    try {
      await dbExecute(
        `UPDATE customers SET ${fields} WHERE workspace_id = ? AND id = ?`,
        values,
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[customersDb.update] write-through falló:", e);
    }
    return;
  }

  const now = new Date().toISOString();
  const filtered = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined),
  );
  const updatable = { ...filtered, updated_at: now };
  const fields = Object.keys(updatable).map((k) => `${k} = ?`).join(", ");
  const values = [...Object.values(updatable), workspaceId, id];
  await dbExecute(
    `UPDATE customers SET ${fields} WHERE workspace_id = ? AND id = ?`,
    values,
  );
}

export async function remove(workspaceId: string, id: string): Promise<void> {
  const ctx = cloudCtx();
  if (ctx) {
    const res = await deleteCustomerCloud(ctx.jwt, ctx.wsId, id);
    if (!res.ok) {
      throw new Error(`No se pudo eliminar en la nube: ${res.error}`);
    }
    // Write-through al local.
    try {
      await dbExecute(
        "DELETE FROM customers WHERE workspace_id = ? AND id = ?",
        [workspaceId, id],
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[customersDb.remove] write-through falló:", e);
    }
    return;
  }

  await dbExecute(
    "DELETE FROM customers WHERE workspace_id = ? AND id = ?",
    [workspaceId, id],
  );
}

export const customersDb = { getAll, getById, search, create, update, remove };
