/**
 * Customer contacts (G/A2) — log de interacciones con cada cliente.
 *
 * Routes:
 *   GET   /workspaces/:wid/customers/:cid/contacts     historia del cliente
 *   POST  /workspaces/:wid/customers/:cid/contacts     registrar contacto
 *   GET   /workspaces/:wid/customer-contacts/last-by-customer
 *                                                      mapa { customerId → lastAt }
 *
 * El último endpoint optimiza el "días sin contacto" en la pantalla de
 * Clientes (Caro y vos ven el mismo número). Sin él, tendríamos que pedir
 * la historia de cada cliente individualmente.
 *
 * Permisos:
 *   - read = todos los miembros activos
 *   - create = owner|admin|vendedor (cualquiera que pueda atender clientes)
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoQuery, type TursoArg } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";
import { requirePermWs } from "../permissionsWs";

const ROLES_READ = new Set(["owner", "admin", "vendedor", "viewer"]);

export async function handleListCustomerContacts(workspaceId: string, customerId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role || !ROLES_READ.has(role)) return json({ error: "forbidden" }, 403);

  const [rows] = await tursoQuery(env, {
    sql: `SELECT * FROM customer_contacts
            WHERE workspace_id = ? AND customer_id = ?
            ORDER BY contacted_at DESC`,
    args: [workspaceId, customerId],
  });
  return json({ items: rows ?? [] });
}

export async function handleCreateCustomerContact(workspaceId: string, customerId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = await requirePermWs(env, workspaceId, role, "customers.write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }

  if (typeof body.kind !== "string" || !body.kind.trim()) {
    return json({ error: "missing_kind" }, 400);
  }

  const id = typeof body.id === "string" && body.id ? body.id : crypto.randomUUID();
  const notes = typeof body.notes === "string" ? body.notes : null;
  const contactedAt = typeof body.contacted_at === "string" ? body.contacted_at : null;
  const contactedByName = typeof body.contacted_by_name === "string" ? body.contacted_by_name : null;

  const cols = ["id", "workspace_id", "customer_id", "kind", "notes", "contacted_by", "contacted_by_name"];
  const vals: TursoArg[] = [id, workspaceId, customerId, body.kind, notes, auth.userId, contactedByName];
  if (contactedAt) {
    cols.push("contacted_at");
    vals.push(contactedAt);
  }

  await tursoExec(
    env,
    `INSERT INTO customer_contacts (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    vals,
  );
  return json({ ok: true, id }, 201);
}

/**
 * Devuelve `{ customer_id → contacted_at }` para la pantalla Clientes.
 * Un solo round-trip en vez de N (uno por cliente).
 */
export async function handleLastContactByCustomer(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role || !ROLES_READ.has(role)) return json({ error: "forbidden" }, 403);

  const [rows] = await tursoQuery(env, {
    sql: `SELECT customer_id, MAX(contacted_at) as last_at
            FROM customer_contacts
            WHERE workspace_id = ?
            GROUP BY customer_id`,
    args: [workspaceId],
  });
  const map: Record<string, string> = {};
  for (const r of rows ?? []) {
    if (r.customer_id && r.last_at) {
      map[String(r.customer_id)] = String(r.last_at);
    }
  }
  return json({ lastByCustomer: map });
}
