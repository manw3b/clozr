/**
 * Sales + sale_items + sale_payments (F2-B R3).
 *
 * Routes:
 *   GET    /workspaces/:wid/sales                    list (sin items/payments — solo header)
 *   GET    /workspaces/:wid/sales/:sid               get one (con items + payments)
 *   POST   /workspaces/:wid/sales                    crear sale + items + payments (atomic)
 *   PATCH  /workspaces/:wid/sales/:sid               editar campos top-level del sale
 *   POST   /workspaces/:wid/sales/:sid/payments      agregar un pago
 *   DELETE /workspaces/:wid/sales/:sid               soft-delete
 *   POST   /workspaces/:wid/sales/import             bootstrap (sale + items + payments)
 *
 * Permisos:
 *   read = todos los roles activos
 *   create/edit = owner|admin|vendedor
 *   delete = owner|admin
 *   import = owner only
 */

import type { Env } from "../index";
import { ensureSchema } from "../schema";
import { requireAuth } from "../auth";
import { tursoExec, tursoFirst, tursoQuery, tursoTransaction, type TursoArg } from "../turso";
import { getRoleInWorkspace, json } from "./_generic";
import { requirePerm } from "../permissions";
import { sendWarrantyEmail } from "../email";

const ROLES_READ = new Set(["owner", "admin", "vendedor", "viewer"]);

const SALE_EDITABLE = [
  "customer_id", "customer_name", "seller_id", "seller_name",
  "subtotal", "total", "total_paid", "balance", "is_paid",
  "payment_method", "notes", "out_of_stock_sale",
  "regularized_at", "regularized_by", "sale_date",
] as const;

const ITEM_EDITABLE = [
  "catalog_item_id", "description", "quantity", "unit_price",
  "base_price", "subtotal", "imei", "from_stock", "unit_cost",
] as const;

const PAYMENT_EDITABLE = [
  "method", "currency", "amount", "is_deposit",
] as const;

const CASH_MOVEMENT_EDITABLE = [
  "kind", "amount", "currency", "description", "category",
  "sale_id", "customer_name", "payment_method", "moved_at",
] as const;

function pick(input: Record<string, unknown>, allowed: readonly string[]): Record<string, TursoArg> {
  const out: Record<string, TursoArg> = {};
  for (const k of allowed) {
    if (k in input) {
      const v = input[k];
      out[k] = v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? v : null;
    }
  }
  return out;
}

/**
 * T2: si el rol es 'vendedor', verifica que la venta le pertenezca antes de
 * mutarla (PATCH/payment/DELETE). Devuelve Response (404/403) o null si OK.
 */
async function assertOwnsSale(
  env: Env,
  workspaceId: string,
  saleId: string,
  role: string,
  userId: string,
): Promise<Response | null> {
  if (role !== "vendedor") return null;
  const row = await tursoFirst(
    env,
    `SELECT owner_id FROM sales WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    [saleId, workspaceId],
  );
  if (!row) return json({ error: "not_found" }, 404);
  if (String(row.owner_id ?? "") !== userId) return json({ error: "forbidden" }, 403);
  return null;
}

/* ── POST garantía: envía el certificado por mail al cliente ─────────── */

export async function handleSendWarranty(
  workspaceId: string,
  saleId: string,
  req: Request,
  env: Env,
): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role || !new Set(["owner", "admin", "vendedor"]).has(role)) {
    return json({ error: "forbidden" }, 403);
  }
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    return json({ error: "email_not_configured" }, 503);
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const months = Number(body.months);
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: "invalid_email" }, 400);
  if (!Number.isFinite(months) || months <= 0) return json({ error: "invalid_months" }, 400);
  void saleId; // disponible por si más adelante guardamos la garantía en la venta
  try {
    await sendWarrantyEmail({
      to,
      customerName: typeof body.customerName === "string" && body.customerName.trim() ? body.customerName : "Cliente",
      businessName: typeof body.businessName === "string" && body.businessName.trim() ? body.businessName : "tu compra",
      items: typeof body.items === "string" ? body.items : "",
      months,
      startDate: typeof body.startDate === "string" ? body.startDate : "",
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM,
    });
  } catch (e) {
    return json({ error: "send_failed", detail: String(e).slice(0, 200) }, 502);
  }
  return json({ ok: true });
}

/* ── GET list (header only) ─────────────────────────────────────────── */

export async function handleListSales(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role || !ROLES_READ.has(role)) return json({ error: "forbidden" }, 403);

  // T2: el vendedor ve solo SUS ventas; managers y viewer ven todo.
  const scoped = role === "vendedor";
  const [rows] = await tursoQuery(env, {
    sql: `SELECT * FROM sales
            WHERE workspace_id = ? AND deleted_at IS NULL${scoped ? " AND owner_id = ?" : ""}
            ORDER BY sale_date DESC, created_at DESC`,
    args: scoped ? [workspaceId, auth.userId] : [workspaceId],
  });
  return json({ sales: rows ?? [] });
}

/* ── GET sale-items (bulk, para reportes) ────────────────────────────── */
//
// Todos los ítems de venta del workspace en UNA query (JOIN con sales para
// traer sale_date + scope por workspace_id). Evita el N+1 de pedir getSale
// por cada venta. Read-only. Lo consume Reportes v2 (margen + top productos),
// cruzando catalog_item_id → cost del catálogo client-side.
export async function handleListSaleItems(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  // GET /sale-items alimenta Reportes → requiere reports.view (managers).
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const deniedReports = requirePerm(role, "reports.view");
  if (deniedReports) return deniedReports;

  const [rows] = await tursoQuery(env, {
    sql: `SELECT si.id, si.sale_id, si.catalog_item_id, si.description,
                 si.quantity, si.unit_price, si.subtotal, si.unit_cost,
                 s.sale_date, s.created_at AS sale_created_at,
                 s.seller_name, s.customer_name
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            WHERE s.workspace_id = ? AND s.deleted_at IS NULL
            ORDER BY s.sale_date DESC, s.created_at DESC`,
    args: [workspaceId],
  });
  return json({ items: rows ?? [] });
}

/* ── GET one (con items + payments) ──────────────────────────────────── */

export async function handleGetSale(workspaceId: string, saleId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role || !ROLES_READ.has(role)) return json({ error: "forbidden" }, 403);

  // T2: el vendedor solo abre SUS ventas.
  const scoped = role === "vendedor";
  const sale = await tursoFirst(
    env,
    `SELECT * FROM sales WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL${scoped ? " AND owner_id = ?" : ""}`,
    scoped ? [saleId, workspaceId, auth.userId] : [saleId, workspaceId],
  );
  if (!sale) return json({ error: "not_found" }, 404);

  const [itemRows, payRows] = await tursoQuery(
    env,
    { sql: `SELECT * FROM sale_items WHERE sale_id = ?`, args: [saleId] },
    { sql: `SELECT * FROM sale_payments WHERE sale_id = ?`, args: [saleId] },
  );
  return json({ sale, items: itemRows ?? [], payments: payRows ?? [] });
}

/* ── POST sale (con items + payments) ────────────────────────────────── */

interface CreateSaleBody {
  id?: unknown;
  items?: Array<Record<string, unknown>>;
  payments?: Array<Record<string, unknown>>;
  /**
   * E1: cash_movements + stock_decrements opcionales — si vienen,
   * los insertamos DENTRO de la misma transacción que la sale. Cierra
   * el gap C2 (esos side-effects vivían en el cliente como best-effort).
   * Si el caller no los manda, el endpoint se comporta igual que antes
   * (back-compat).
   */
  cash_movements?: Array<Record<string, unknown>>;
  stock_decrements?: Array<{ catalog_item_id?: unknown; quantity?: unknown }>;
  [k: string]: unknown;
}

export async function handleCreateSale(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "sales.write");
  if (denied) return denied;

  let body: CreateSaleBody;
  try { body = (await req.json()) as CreateSaleBody; } catch { return json({ error: "invalid_body" }, 400); }

  const id = (typeof body.id === "string" && body.id) ? body.id : crypto.randomUUID();
  const saleFields = pick(body as Record<string, unknown>, SALE_EDITABLE);

  // T2: owner_id = creador (sub del JWT) para el alcance del vendedor.
  const cols = ["id", "workspace_id", "created_by", "owner_id", ...Object.keys(saleFields)];
  const vals: TursoArg[] = [id, workspaceId, auth.userId, auth.userId, ...Object.values(saleFields)];

  // C2: insertamos sale + items + payments en una transacción atómica
  // via tursoTransaction (BEGIN/COMMIT en la misma pipeline). Si CUALQUIER
  // insert falla, ROLLBACK — no queda una sale a medio crear con items
  // sin payments o viceversa.
  // Unidades serializadas vendidas en esta venta (catalog_item_id + IMEI),
  // recolectadas al recorrer los ítems y marcadas como vendidas en la misma tx.
  const imeiSales: Array<{ catalogItemId: string; imei: string }> = [];

  const stmts: Array<{ sql: string; args: TursoArg[] }> = [
    {
      sql: `INSERT INTO sales (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
      args: vals,
    },
  ];

  if (Array.isArray(body.items)) {
    for (const it of body.items) {
      if (!it || typeof it !== "object") continue;
      const itemId = typeof it.id === "string" && it.id ? it.id : crypto.randomUUID();
      if (typeof it.description !== "string" || typeof it.unit_price !== "number" || typeof it.subtotal !== "number") {
        return json({ error: "invalid_item", needed: ["description", "unit_price", "subtotal"] }, 400);
      }
      const ifields = pick(it as Record<string, unknown>, ITEM_EDITABLE);
      const icols = ["id", "sale_id", ...Object.keys(ifields)];
      const ivals: TursoArg[] = [itemId, id, ...Object.values(ifields)];
      stmts.push({
        sql: `INSERT INTO sale_items (${icols.join(", ")}) VALUES (${icols.map(() => "?").join(", ")})`,
        args: ivals,
      });
      // Si la línea es una unidad serializada (catálogo + IMEI elegido en la
      // venta), la marcamos para vender más abajo, en la misma transacción.
      const cii = typeof it.catalog_item_id === "string" ? it.catalog_item_id : "";
      const imei = typeof it.imei === "string" ? it.imei.trim() : "";
      if (cii && imei) imeiSales.push({ catalogItemId: cii, imei });
    }
  }

  // IMEIs vendidos: marcar la unidad (sold_at + sale_id) y recalcular el stock
  // del producto (= unidades sin vender) DENTRO de la misma tx. El guard
  // `sold_at IS NULL` evita re-vender una unidad ya entregada (idempotente).
  if (imeiSales.length > 0) {
    for (const s of imeiSales) {
      stmts.push({
        sql: `UPDATE catalog_imei SET sold_at = datetime('now'), sale_id = ?
                WHERE workspace_id = ? AND catalog_item_id = ? AND imei = ? AND sold_at IS NULL`,
        args: [id, workspaceId, s.catalogItemId, s.imei],
      });
    }
    for (const cii of Array.from(new Set(imeiSales.map((s) => s.catalogItemId)))) {
      stmts.push({
        sql: `UPDATE catalog_items
                SET stock = (SELECT COUNT(*) FROM catalog_imei WHERE catalog_item_id = ? AND sold_at IS NULL)
                WHERE id = ? AND workspace_id = ?`,
        args: [cii, cii, workspaceId],
      });
    }
  }

  if (Array.isArray(body.payments)) {
    for (const p of body.payments) {
      if (!p || typeof p !== "object") continue;
      const payId = typeof p.id === "string" && p.id ? p.id : crypto.randomUUID();
      if (typeof p.method !== "string" || typeof p.amount !== "number") {
        return json({ error: "invalid_payment", needed: ["method", "amount"] }, 400);
      }
      const pfields = pick(p as Record<string, unknown>, PAYMENT_EDITABLE);
      const pcols = ["id", "sale_id", ...Object.keys(pfields)];
      const pvals: TursoArg[] = [payId, id, ...Object.values(pfields)];
      stmts.push({
        sql: `INSERT INTO sale_payments (${pcols.join(", ")}) VALUES (${pcols.map(() => "?").join(", ")})`,
        args: pvals,
      });
    }
  }

  // E1: cash_movements DENTRO de la misma tx. Cada movimiento es un
  // ingreso/egreso de caja auto-derivado de la venta (por cada moneda
  // cobrada NO en cuenta-corriente). Si falla cualquier insert, el
  // BEGIN/COMMIT/ROLLBACK garantiza que la venta tampoco se persista.
  if (Array.isArray(body.cash_movements)) {
    for (const m of body.cash_movements) {
      if (!m || typeof m !== "object") continue;
      const mId = typeof m.id === "string" && m.id ? m.id : crypto.randomUUID();
      if (typeof m.kind !== "string" || typeof m.amount !== "number") {
        return json({ error: "invalid_cash_movement", needed: ["kind", "amount"] }, 400);
      }
      const mfields = pick(m as Record<string, unknown>, CASH_MOVEMENT_EDITABLE);
      const mcols = ["id", "workspace_id", "created_by", ...Object.keys(mfields)];
      const mvals: TursoArg[] = [mId, workspaceId, auth.userId, ...Object.values(mfields)];
      stmts.push({
        sql: `INSERT INTO cash_movements (${mcols.join(", ")}) VALUES (${mcols.map(() => "?").join(", ")})`,
        args: mvals,
      });
    }
  }

  // E1: decremento de stock DENTRO de la misma tx. Atómico via
  // `stock = MAX(0, stock - ?)` (mismo SQL que C1, pero por dentro
  // de la transacción). Sólo afecta filas con track_stock=1.
  if (Array.isArray(body.stock_decrements)) {
    for (const d of body.stock_decrements) {
      if (!d || typeof d !== "object") continue;
      const catalogItemId = typeof d.catalog_item_id === "string" ? d.catalog_item_id : null;
      const qty = Number(d.quantity);
      if (!catalogItemId || !Number.isFinite(qty) || qty <= 0) {
        return json({ error: "invalid_stock_decrement", needed: ["catalog_item_id", "quantity>0"] }, 400);
      }
      stmts.push({
        sql: `UPDATE catalog_items SET stock = MAX(0, stock - ?)
                WHERE id = ? AND workspace_id = ? AND track_stock = 1`,
        args: [qty, catalogItemId, workspaceId],
      });
    }
  }

  try {
    await tursoTransaction(env, ...stmts);
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : String(e);
    if (msg.includes("unique") || msg.includes("primary key")) {
      return json({ error: "duplicate_id", id }, 409);
    }
    throw e;
  }
  return json({ ok: true, id }, 201);
}

/* ── PATCH ───────────────────────────────────────────────────────────── */

export async function handleUpdateSale(workspaceId: string, saleId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "sales.write");
  if (denied) return denied;

  const ownerErr = await assertOwnsSale(env, workspaceId, saleId, role, auth.userId);
  if (ownerErr) return ownerErr;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }
  const fields = pick(body, SALE_EDITABLE);
  if (Object.keys(fields).length === 0) return json({ error: "no_fields" }, 400);

  const set = Object.keys(fields).map((c) => `${c} = ?`).concat(["updated_at = datetime('now')"]);
  const args: TursoArg[] = [...Object.values(fields), saleId, workspaceId];
  await tursoExec(
    env,
    `UPDATE sales SET ${set.join(", ")}
       WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    args,
  );
  return json({ ok: true });
}

/* ── POST payment ────────────────────────────────────────────────────── */

export async function handleAddPayment(workspaceId: string, saleId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "sales.write");
  if (denied) return denied;

  const ownerErr = await assertOwnsSale(env, workspaceId, saleId, role, auth.userId);
  if (ownerErr) return ownerErr;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "invalid_body" }, 400); }
  if (typeof body.method !== "string" || typeof body.amount !== "number") {
    return json({ error: "invalid_payment" }, 400);
  }

  // Verificar que la sale existe en este workspace.
  const sale = await tursoFirst(
    env,
    `SELECT total, total_paid FROM sales WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    [saleId, workspaceId],
  );
  if (!sale) return json({ error: "sale_not_found" }, 404);

  const payId = (typeof body.id === "string" && body.id) ? body.id : crypto.randomUUID();
  const pfields = pick(body, PAYMENT_EDITABLE);
  const cols = ["id", "sale_id", ...Object.keys(pfields)];
  const vals: TursoArg[] = [payId, saleId, ...Object.values(pfields)];

  // Insert payment + recalcular total_paid / balance / is_paid en una pipeline.
  const total = Number(sale.total ?? 0);
  await tursoQuery(
    env,
    {
      sql: `INSERT INTO sale_payments (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
      args: vals,
    },
    {
      sql: `UPDATE sales SET
              total_paid = COALESCE((SELECT SUM(amount) FROM sale_payments WHERE sale_id = ?), 0),
              balance = ? - COALESCE((SELECT SUM(amount) FROM sale_payments WHERE sale_id = ?), 0),
              is_paid = CASE WHEN ? - COALESCE((SELECT SUM(amount) FROM sale_payments WHERE sale_id = ?), 0) <= 0.01 THEN 1 ELSE 0 END,
              updated_at = datetime('now')
            WHERE id = ?`,
      args: [saleId, total, saleId, total, saleId, saleId],
    },
  );
  return json({ ok: true, id: payId }, 201);
}

/* ── DELETE soft ─────────────────────────────────────────────────────── */

export async function handleDeleteSale(workspaceId: string, saleId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (!role) return json({ error: "forbidden" }, 403);
  const denied = requirePerm(role, "sales.write");
  if (denied) return denied;

  const ownerErr = await assertOwnsSale(env, workspaceId, saleId, role, auth.userId);
  if (ownerErr) return ownerErr;

  // Unidades serializadas que esta venta había marcado vendidas → vuelven al
  // stock al borrar (sold_at/sale_id → NULL). Si la venta no tenía IMEIs, la
  // lista queda vacía y sólo se hace el soft-delete.
  const [affected] = await tursoQuery(env, {
    sql: `SELECT DISTINCT catalog_item_id FROM catalog_imei WHERE workspace_id = ? AND sale_id = ?`,
    args: [workspaceId, saleId],
  });
  const affectedIds = (affected ?? []).map((r) => String(r.catalog_item_id));

  const stmts: Array<{ sql: string; args: TursoArg[] }> = [
    {
      sql: `UPDATE sales SET deleted_at = datetime('now')
              WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
      args: [saleId, workspaceId],
    },
  ];
  if (affectedIds.length > 0) {
    stmts.push({
      sql: `UPDATE catalog_imei SET sold_at = NULL, sale_id = NULL WHERE workspace_id = ? AND sale_id = ?`,
      args: [workspaceId, saleId],
    });
    for (const cii of affectedIds) {
      stmts.push({
        sql: `UPDATE catalog_items
                SET stock = (SELECT COUNT(*) FROM catalog_imei WHERE catalog_item_id = ? AND sold_at IS NULL)
                WHERE id = ? AND workspace_id = ?`,
        args: [cii, cii, workspaceId],
      });
    }
  }
  await tursoTransaction(env, ...stmts);
  return json({ ok: true });
}

/* ── POST import (bootstrap) ─────────────────────────────────────────── */

interface ImportSaleEntry {
  id: string;
  items?: Array<Record<string, unknown>>;
  payments?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

export async function handleImportSales(workspaceId: string, req: Request, env: Env): Promise<Response> {
  await ensureSchema(env);
  const auth = await requireAuth(req, env);
  if (!auth) return json({ error: "unauthorized" }, 401);
  const role = await getRoleInWorkspace(env, workspaceId, auth.userId);
  if (role !== "owner") return json({ error: "forbidden" }, 403);

  let body: { sales?: ImportSaleEntry[] };
  try { body = (await req.json()) as typeof body; } catch { return json({ error: "invalid_body" }, 400); }
  if (!Array.isArray(body.sales)) return json({ error: "missing_sales" }, 400);
  if (body.sales.length > 10000) return json({ error: "too_many", limit: 10000 }, 413);

  let imported = 0;
  let skipped = 0;
  const errors: Array<{ id: string; error: string }> = [];
  for (const s of body.sales) {
    const id = typeof s.id === "string" && s.id ? s.id : crypto.randomUUID();
    const exists = await tursoFirst(env, `SELECT id FROM sales WHERE id = ?`, [id]);
    if (exists) { skipped++; continue; }
    const fields = pick(s as Record<string, unknown>, SALE_EDITABLE);
    const createdAt = typeof s.created_at === "string" ? s.created_at : null;
    // Import es owner-only → owner_id = el owner que sube el bootstrap.
    const cols = ["id", "workspace_id", "created_by", "owner_id", ...Object.keys(fields)];
    const vals: TursoArg[] = [id, workspaceId, auth.userId, auth.userId, ...Object.values(fields)];
    if (createdAt) { cols.push("created_at"); vals.push(createdAt); }

    const stmts: Array<{ sql: string; args: TursoArg[] }> = [{
      sql: `INSERT OR IGNORE INTO sales (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
      args: vals,
    }];

    if (Array.isArray(s.items)) {
      for (const it of s.items) {
        if (!it || typeof it !== "object") continue;
        const itemId = typeof it.id === "string" && it.id ? it.id : crypto.randomUUID();
        if (typeof it.description !== "string" || typeof it.unit_price !== "number" || typeof it.subtotal !== "number") continue;
        const ifields = pick(it as Record<string, unknown>, ITEM_EDITABLE);
        const icols = ["id", "sale_id", ...Object.keys(ifields)];
        const ivals: TursoArg[] = [itemId, id, ...Object.values(ifields)];
        stmts.push({
          sql: `INSERT OR IGNORE INTO sale_items (${icols.join(", ")}) VALUES (${icols.map(() => "?").join(", ")})`,
          args: ivals,
        });
      }
    }
    if (Array.isArray(s.payments)) {
      for (const p of s.payments) {
        if (!p || typeof p !== "object") continue;
        const payId = typeof p.id === "string" && p.id ? p.id : crypto.randomUUID();
        if (typeof p.method !== "string" || typeof p.amount !== "number") continue;
        const pfields = pick(p as Record<string, unknown>, PAYMENT_EDITABLE);
        const pcols = ["id", "sale_id", ...Object.keys(pfields)];
        const pvals: TursoArg[] = [payId, id, ...Object.values(pfields)];
        stmts.push({
          sql: `INSERT OR IGNORE INTO sale_payments (${pcols.join(", ")}) VALUES (${pcols.map(() => "?").join(", ")})`,
          args: pvals,
        });
      }
    }

    try {
      await tursoQuery(env, ...stmts);
      imported++;
    } catch (e) {
      errors.push({ id, error: e instanceof Error ? e.message : "unknown" });
    }
  }
  return json({ ok: true, imported, skipped, errors });
}
