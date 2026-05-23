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
// C5: matriz de permisos compartida con el frontend. La fuente única
// de verdad evita que un permiso cambie en un lado y no en el otro.
import { can } from "../../../src/lib/permissions";

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
  if (!can(role, "decrementStock")) return json({ error: "forbidden" }, 403);

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
