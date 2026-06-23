/**
 * POST /workspaces/:wid/catalog/:id/decrement-stock
 * Body: { quantity: number }
 *
 * Decrementa stock de forma ATÓMICA via SQL:
 *   UPDATE catalog_items SET stock = MAX(0, stock - ?) WHERE id = ? ...
 *
 * Antes la decremento la hacía el cliente: leer stock → calcular → escribir.
 * En cloud (R5+), si 2 vendedores hacían venta del mismo producto al mismo
 * tiempo, ambos leían el mismo stock y escribían el mismo valor — quedaba
 * subdescontado por 1. El comentario "race condition aceptable" reconocía
 * el problema; este endpoint lo cierra.
 *
 * Sólo touches `stock` cuando `track_stock=1` — los productos sin tracking
 * de stock (servicios, accesorios genéricos) quedan iguales.
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { requireAuth } from "../auth";
import { tursoQuery } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";
// Enforcement con la matriz del Worker (espejo del frontend web), igual que el
// resto de las rutas. decrement-stock = sales.write (el vendedor descuenta al
// vender); alta/baja de IMEIs = inventory.write (gestión de inventario).
import { requirePermWs } from "../permissionsWs";

export async function handleDecrementStock(
  wsId: string,
  itemId: string,
  req: Request,
  env: Env,
): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const role = await getRoleInWorkspace(env, wsId, auth.userId);
  if (!role) return json({ error: "not_a_member" }, 403);
  {
    const denied = await requirePermWs(env, wsId, role, "sales.write");
    if (denied) return denied;
  }

  let body: { quantity?: unknown };
  try {
    body = (await req.json()) as { quantity?: unknown };
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const qty = Number(body.quantity);
  if (!Number.isFinite(qty) || qty <= 0 || qty > 10_000) {
    return json({ error: "invalid_quantity" }, 400);
  }

  // UPDATE atómico. Devolvemos affected rows + el nuevo stock para que
  // el cliente pueda actualizar la UI sin refetch.
  const [updateRes] = await tursoQuery(
    env,
    {
      sql: `UPDATE catalog_items
              SET stock = MAX(0, stock - ?)
              WHERE id = ? AND workspace_id = ? AND track_stock = 1`,
      args: [qty, itemId, wsId],
    },
  );
  void updateRes;

  // Releer para devolver el nuevo stock (atomic: misma fila, próxima query
  // ya ve el UPDATE anterior).
  const [rows] = await tursoQuery(
    env,
    {
      sql: `SELECT stock, track_stock FROM catalog_items
              WHERE id = ? AND workspace_id = ?`,
      args: [itemId, wsId],
    },
  );
  const row = rows?.[0];
  if (!row) return json({ error: "not_found" }, 404);

  return json({
    ok: true,
    stock: Number(row.stock ?? 0),
    track_stock: Number(row.track_stock ?? 0),
  });
}

/* ── IMEIs por producto (unidades serializadas) ───────────────────────────
 * El stock de un producto serializado = cantidad de IMEIs no vendidos. */

/** GET /workspaces/:wid/catalog/:id/imeis — lista los IMEIs del producto. */
export async function handleListImeis(wsId: string, itemId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, wsId, auth.userId);
  if (!role) return json({ error: "not_a_member" }, 403);
  const [rows] = await tursoQuery(env, {
    sql: `SELECT id, imei, sold_at, sale_id, created_at FROM catalog_imei
            WHERE workspace_id = ? AND catalog_item_id = ?
            ORDER BY (sold_at IS NOT NULL), created_at DESC`,
    args: [wsId, itemId],
  });
  return json({ imeis: rows ?? [] });
}

/** POST /workspaces/:wid/catalog/:id/imeis  Body: { imeis: string[] }
 *  Agrega IMEIs (dedup contra los existentes) y recalcula stock. */
export async function handleAddImeis(wsId: string, itemId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, wsId, auth.userId);
  if (!role) return json({ error: "not_a_member" }, 403);
  {
    const denied = await requirePermWs(env, wsId, role, "inventory.write");
    if (denied) return denied;
  }

  let body: { imeis?: unknown };
  try {
    body = (await req.json()) as { imeis?: unknown };
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  const raw = Array.isArray(body.imeis) ? body.imeis : [];
  const clean = Array.from(new Set(raw.map((x) => String(x).trim()).filter((x) => x.length > 0)));
  if (clean.length === 0) return json({ error: "no_imeis" }, 400);
  if (clean.length > 500) return json({ error: "too_many" }, 400);

  const [itemRows] = await tursoQuery(env, {
    sql: `SELECT id FROM catalog_items WHERE id = ? AND workspace_id = ?`,
    args: [itemId, wsId],
  });
  if (!itemRows?.[0]) return json({ error: "not_found" }, 404);

  const [existRows] = await tursoQuery(env, {
    sql: `SELECT imei FROM catalog_imei WHERE workspace_id = ? AND catalog_item_id = ?`,
    args: [wsId, itemId],
  });
  const existing = new Set((existRows ?? []).map((r) => String(r.imei)));
  const toAdd = clean.filter((i) => !existing.has(i));

  for (const imei of toAdd) {
    await tursoQuery(env, {
      sql: `INSERT INTO catalog_imei (id, workspace_id, catalog_item_id, imei) VALUES (?, ?, ?, ?)`,
      args: [crypto.randomUUID(), wsId, itemId, imei],
    });
  }
  // Serializado → tracked; stock = unidades no vendidas.
  await tursoQuery(env, {
    sql: `UPDATE catalog_items
            SET track_stock = 1,
                stock = (SELECT COUNT(*) FROM catalog_imei WHERE catalog_item_id = ? AND sold_at IS NULL)
            WHERE id = ? AND workspace_id = ?`,
    args: [itemId, itemId, wsId],
  });
  const [rows] = await tursoQuery(env, {
    sql: `SELECT id, imei, sold_at, sale_id, created_at FROM catalog_imei
            WHERE workspace_id = ? AND catalog_item_id = ?
            ORDER BY (sold_at IS NOT NULL), created_at DESC`,
    args: [wsId, itemId],
  });
  const stock = (rows ?? []).filter((r) => !r.sold_at).length;
  return json({ ok: true, added: toAdd.length, skipped: clean.length - toAdd.length, stock, imeis: rows ?? [] });
}

/** DELETE /workspaces/:wid/catalog/:id/imeis/:imeiId — borra (si no fue vendido). */
export async function handleDeleteImei(wsId: string, itemId: string, imeiId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, wsId, auth.userId);
  if (!role) return json({ error: "not_a_member" }, 403);
  {
    const denied = await requirePermWs(env, wsId, role, "inventory.write");
    if (denied) return denied;
  }

  const [rows] = await tursoQuery(env, {
    sql: `SELECT sold_at FROM catalog_imei WHERE id = ? AND workspace_id = ? AND catalog_item_id = ?`,
    args: [imeiId, wsId, itemId],
  });
  const row = rows?.[0];
  if (!row) return json({ error: "not_found" }, 404);
  if (row.sold_at) return json({ error: "already_sold" }, 409);

  await tursoQuery(env, { sql: `DELETE FROM catalog_imei WHERE id = ? AND workspace_id = ?`, args: [imeiId, wsId] });
  await tursoQuery(env, {
    sql: `UPDATE catalog_items
            SET stock = (SELECT COUNT(*) FROM catalog_imei WHERE catalog_item_id = ? AND sold_at IS NULL)
            WHERE id = ? AND workspace_id = ?`,
    args: [itemId, itemId, wsId],
  });
  const [after] = await tursoQuery(env, {
    sql: `SELECT COUNT(*) AS n FROM catalog_imei WHERE catalog_item_id = ? AND sold_at IS NULL`,
    args: [itemId],
  });
  return json({ ok: true, stock: Number(after?.[0]?.n ?? 0) });
}
