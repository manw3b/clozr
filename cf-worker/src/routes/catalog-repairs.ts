/**
 * Refurbish interno — reparaciones / repuestos por unidad.
 *
 * Routes:
 *   GET    /workspaces/:wid/catalog/:id/repairs            lista las reparaciones
 *   POST   /workspaces/:wid/catalog/:id/repairs            agrega una { description, cost }
 *   DELETE /workspaces/:wid/catalog/:id/repairs/:repairId  borra una
 *
 * Modelo: cada reparación SE SUMA al `cost` del catalog_item (= costo real del
 * equipo refaccionado), así el margen de la venta y los reportes —que ya usan
 * `cost`— quedan bien sin tocar nada más. La tabla guarda el desglose.
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { requireAuth } from "../auth";
import { tursoQuery } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";
import { can } from "../../../src/lib/permissions";

/** GET — lista las reparaciones de un producto (más recientes primero). */
export async function handleListRepairs(wsId: string, itemId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, wsId, auth.userId);
  if (!role) return json({ error: "not_a_member" }, 403);
  const [rows] = await tursoQuery(env, {
    sql: `SELECT id, description, cost, created_at FROM catalog_repairs
            WHERE workspace_id = ? AND catalog_item_id = ?
            ORDER BY created_at DESC`,
    args: [wsId, itemId],
  });
  return json({ repairs: rows ?? [] });
}

/** POST { description, cost } — agrega una reparación y la suma al costo. */
export async function handleAddRepair(wsId: string, itemId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, wsId, auth.userId);
  if (!role) return json({ error: "not_a_member" }, 403);
  if (!can(role, "editCatalogItem")) return json({ error: "forbidden" }, 403);

  let body: { description?: unknown; cost?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const cost = Number(body.cost);
  if (!description) return json({ error: "invalid_description" }, 400);
  if (!Number.isFinite(cost) || cost < 0 || cost > 100_000_000) return json({ error: "invalid_cost" }, 400);

  const [itemRows] = await tursoQuery(env, {
    sql: `SELECT id FROM catalog_items WHERE id = ? AND workspace_id = ?`,
    args: [itemId, wsId],
  });
  if (!itemRows?.[0]) return json({ error: "not_found" }, 404);

  const id = crypto.randomUUID();
  await tursoQuery(env, {
    sql: `INSERT INTO catalog_repairs (id, workspace_id, catalog_item_id, description, cost, created_by)
            VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, wsId, itemId, description, cost, auth.userId],
  });
  // La reparación se suma al costo real del equipo.
  await tursoQuery(env, {
    sql: `UPDATE catalog_items SET cost = COALESCE(cost, 0) + ? WHERE id = ? AND workspace_id = ?`,
    args: [cost, itemId, wsId],
  });
  const [after] = await tursoQuery(env, {
    sql: `SELECT cost FROM catalog_items WHERE id = ? AND workspace_id = ?`,
    args: [itemId, wsId],
  });
  return json({
    ok: true,
    cost: Number(after?.[0]?.cost ?? 0),
    repair: { id, description, cost },
  });
}

/** DELETE — borra una reparación y resta su costo del costo del equipo. */
export async function handleDeleteRepair(
  wsId: string,
  itemId: string,
  repairId: string,
  req: Request,
  env: Env,
): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, wsId, auth.userId);
  if (!role) return json({ error: "not_a_member" }, 403);
  if (!can(role, "editCatalogItem")) return json({ error: "forbidden" }, 403);

  const [rows] = await tursoQuery(env, {
    sql: `SELECT cost FROM catalog_repairs WHERE id = ? AND workspace_id = ? AND catalog_item_id = ?`,
    args: [repairId, wsId, itemId],
  });
  const row = rows?.[0];
  if (!row) return json({ error: "not_found" }, 404);
  const cost = Number(row.cost ?? 0);

  await tursoQuery(env, {
    sql: `DELETE FROM catalog_repairs WHERE id = ? AND workspace_id = ?`,
    args: [repairId, wsId],
  });
  await tursoQuery(env, {
    sql: `UPDATE catalog_items SET cost = MAX(0, COALESCE(cost, 0) - ?) WHERE id = ? AND workspace_id = ?`,
    args: [cost, itemId, wsId],
  });
  const [after] = await tursoQuery(env, {
    sql: `SELECT cost FROM catalog_items WHERE id = ? AND workspace_id = ?`,
    args: [itemId, wsId],
  });
  return json({ ok: true, cost: Number(after?.[0]?.cost ?? 0) });
}
