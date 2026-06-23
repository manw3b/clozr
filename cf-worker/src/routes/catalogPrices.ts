/**
 * Precios por tipo de cliente (catalog_prices).
 *
 * Cada producto del catálogo puede tener un precio sugerido distinto por tipo
 * de cliente (final/revendedor/mayorista/empresa), en ARS. La venta usa estos
 * precios para autocompletar el unit_price según el tipo del cliente; si no hay
 * fila para (producto, tipo), cae al precio base del catálogo.
 *
 * Routes:
 *   GET /workspaces/:wid/catalog-prices   → todas las filas con precio del workspace
 *   PUT /workspaces/:wid/catalog-prices   → upsert un precio (borra si null/<=0)
 *
 * La tabla usa PK compuesta (catalog_item_id, customer_type) → no entra en el
 * dispatcher genérico (single-id + soft-delete), por eso vive en su propia ruta
 * con upsert ON CONFLICT (espejo de pricingDb.setCatalogPrice del desktop).
 *
 * Permisos: read = todos los roles activos; set = owner|admin.
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoFirst, tursoQuery } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";
import { requirePermWs } from "../permissionsWs";

const ROLES_READ = new Set(["owner", "admin", "vendedor", "viewer"]);
const ALLOWED_TYPES = new Set(["final", "revendedor", "mayorista", "empresa"]);

export async function handleListCatalogPrices(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role || !ROLES_READ.has(role)) return json({ error: "forbidden" }, 403);

  const [rows] = await tursoQuery(env, {
    sql: `SELECT catalog_item_id, customer_type, price
            FROM catalog_prices
            WHERE workspace_id = ? AND price IS NOT NULL`,
    args: [workspaceId],
  });
  return json({ prices: rows ?? [] });
}

export async function handleSetCatalogPrice(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = await requirePermWs(env, workspaceId, role, "inventory.write");
  if (denied) return denied;

  let body: { catalog_item_id?: unknown; customer_type?: unknown; price?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return json({ error: "invalid_body" }, 400); }

  const itemId = typeof body.catalog_item_id === "string" ? body.catalog_item_id : "";
  const type = typeof body.customer_type === "string" ? body.customer_type : "";
  if (!itemId || !ALLOWED_TYPES.has(type)) {
    return json(
      { error: "invalid_input", needed: ["catalog_item_id", "customer_type in final|revendedor|mayorista|empresa"] },
      400,
    );
  }
  const priceNum = typeof body.price === "number" && isFinite(body.price) ? body.price : null;

  // Scope (golden rule): el producto debe pertenecer al workspace.
  const owner = await tursoFirst(
    env,
    `SELECT id FROM catalog_items WHERE id = ? AND workspace_id = ?`,
    [itemId, workspaceId],
  );
  if (!owner) return json({ error: "not_found" }, 404);

  // Precio null / <= 0 = sin precio especial para ese tipo → borrar la fila.
  if (priceNum == null || priceNum <= 0) {
    await tursoExec(
      env,
      `DELETE FROM catalog_prices WHERE workspace_id = ? AND catalog_item_id = ? AND customer_type = ?`,
      [workspaceId, itemId, type],
    );
    return json({ ok: true, cleared: true });
  }

  // catalog_item_id es UUID global → (catalog_item_id, customer_type) ya es
  // único por workspace. El workspace_id se fija al insertar y NO se toca en el
  // UPDATE (ownership inmutable; evita cualquier reescritura de scope).
  await tursoExec(
    env,
    `INSERT INTO catalog_prices (workspace_id, catalog_item_id, customer_type, price, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(catalog_item_id, customer_type)
       DO UPDATE SET price = excluded.price, updated_at = excluded.updated_at`,
    [workspaceId, itemId, type, priceNum],
  );
  return json({ ok: true });
}
