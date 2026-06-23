/**
 * Turnos (appointments) — Fase ④. Entidad propia: el turno es del CLIENTE y
 * puede ser para distintas cosas (reparación, plan canje, venta, …), no está
 * atado a una venta.
 *
 * Routes:
 *   GET    /workspaces/:wid/appointments          list (cualquier miembro — todos ven todos)
 *   POST   /workspaces/:wid/appointments          crear (sales.write)
 *   PATCH  /workspaces/:wid/appointments/:id      editar (sales.write)
 *   DELETE /workspaces/:wid/appointments/:id      soft-delete (sales.write)
 *
 * Decisión de producto: agenda compartida → la lista NO filtra por responsable.
 * Igual guardamos owner_id/owner_name (quién lo creó) para mostrarlo.
 */

import type { Env } from "../index";
import { ensureSchema, ensureAppointments } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoFirst, tursoQuery, type TursoArg } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";
import { requirePermWs } from "../permissionsWs";

const ROLES_READ = new Set(["owner", "admin", "vendedor", "viewer"]);

const EDITABLE = [
  "customer_id", "customer_name", "customer_phone",
  "appointment_at", "type", "origin", "notes", "status",
] as const;

const STATUSES = new Set(["pending", "done", "cancelled"]);

function pick(input: Record<string, unknown>, allowed: readonly string[]): Record<string, TursoArg> {
  const out: Record<string, TursoArg> = {};
  for (const k of allowed) {
    if (k in input) {
      const v = input[k];
      out[k] = v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : null;
    }
  }
  return out;
}

export async function handleListAppointments(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureAppointments(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role || !ROLES_READ.has(role)) return json({ error: "forbidden" }, 403);

  const [rows] = await tursoQuery(env, {
    sql: `SELECT * FROM appointments
            WHERE workspace_id = ? AND deleted_at IS NULL
            ORDER BY appointment_at ASC`,
    args: [workspaceId],
  });
  return json({ appointments: rows ?? [] });
}

export async function handleCreateAppointment(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureAppointments(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = await requirePermWs(env, workspaceId, role, "sales.write");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }

  const appointmentAt = typeof body.appointment_at === "string" ? body.appointment_at.trim() : "";
  if (!appointmentAt) return json({ error: "missing_appointment_at" }, 400);
  const status = typeof body.status === "string" && STATUSES.has(body.status) ? body.status : "pending";

  const saleId = typeof body.sale_id === "string" && body.sale_id ? body.sale_id : null;
  const customerId = typeof body.customer_id === "string" ? body.customer_id : null;
  const customerName = typeof body.customer_name === "string" ? body.customer_name : null;
  const customerPhone = typeof body.customer_phone === "string" ? body.customer_phone : null;
  const type = typeof body.type === "string" ? body.type : null;
  const origin = typeof body.origin === "string" ? body.origin : null;
  const notes = typeof body.notes === "string" ? body.notes : null;

  // Upsert por venta: "Generar turno" desde la misma venta actualiza el turno
  // existente en vez de duplicarlo.
  if (saleId) {
    const existing = await tursoFirst(
      env,
      `SELECT id FROM appointments WHERE workspace_id = ? AND sale_id = ? AND deleted_at IS NULL LIMIT 1`,
      [workspaceId, saleId],
    );
    if (existing) {
      const eid = String(existing.id);
      await tursoExec(
        env,
        `UPDATE appointments SET customer_id = ?, customer_name = ?, customer_phone = ?, appointment_at = ?, type = ?, origin = ?, notes = ?, status = ?, updated_at = datetime('now')
           WHERE id = ? AND workspace_id = ?`,
        [customerId, customerName, customerPhone, appointmentAt, type, origin, notes, status, eid, workspaceId],
      );
      return json({ id: eid });
    }
  }

  const id = typeof body.id === "string" && body.id ? body.id : crypto.randomUUID();
  const ownerName = typeof body.owner_name === "string" ? body.owner_name : auth.email ?? null;
  await tursoExec(
    env,
    `INSERT INTO appointments
       (id, workspace_id, sale_id, customer_id, customer_name, customer_phone, appointment_at, type, origin, notes, status, owner_id, owner_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, workspaceId, saleId, customerId, customerName, customerPhone, appointmentAt, type, origin, notes, status, auth.userId, ownerName],
  );
  return json({ id }, 201);
}

export async function handleUpdateAppointment(workspaceId: string, appointmentId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureAppointments(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = await requirePermWs(env, workspaceId, role, "sales.write");
  if (denied) return denied;

  const exists = await tursoFirst(
    env,
    `SELECT id FROM appointments WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    [appointmentId, workspaceId],
  );
  if (!exists) return json({ error: "not_found" }, 404);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }
  if (typeof body.status === "string" && !STATUSES.has(body.status)) return json({ error: "invalid_status" }, 400);

  const fields = pick(body, EDITABLE);
  if (Object.keys(fields).length === 0) return json({ error: "no_fields" }, 400);

  const setSql = Object.keys(fields).map((c) => `${c} = ?`).join(", ");
  await tursoExec(
    env,
    `UPDATE appointments SET ${setSql}, updated_at = datetime('now') WHERE id = ? AND workspace_id = ?`,
    [...Object.values(fields), appointmentId, workspaceId],
  );
  return json({ ok: true });
}

export async function handleDeleteAppointment(workspaceId: string, appointmentId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  await ensureAppointments(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = await requirePermWs(env, workspaceId, role, "sales.write");
  if (denied) return denied;

  await tursoExec(
    env,
    `UPDATE appointments SET deleted_at = datetime('now')
       WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    [appointmentId, workspaceId],
  );
  return json({ ok: true });
}
