import { dbSelect, dbExecute } from "./index";
import type { CashMovement, CashSummary, CreateCashMovementInput } from "./types";

export async function getMovements(
  workspaceId: string,
  businessId: string,
  opts: { from?: string; to?: string; limit?: number } = {},
): Promise<CashMovement[]> {
  let sql = "SELECT * FROM cash_movements WHERE workspace_id = ? AND business_id = ?";
  const params: unknown[] = [workspaceId, businessId];
  if (opts.from) { sql += " AND date(created_at) >= ?"; params.push(opts.from); }
  if (opts.to) { sql += " AND date(created_at) <= ?"; params.push(opts.to); }
  sql += " ORDER BY created_at DESC";
  if (opts.limit) { sql += " LIMIT ?"; params.push(opts.limit); }
  return dbSelect<CashMovement>(sql, params);
}

export async function getSummary(
  workspaceId: string,
  businessId: string,
  opts: { from?: string; to?: string } = {},
): Promise<CashSummary> {
  let sql = `
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END), 0) AS ingresos,
      COALESCE(SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END), 0) AS egresos
    FROM cash_movements
    WHERE workspace_id = ? AND business_id = ?`;
  const params: unknown[] = [workspaceId, businessId];
  if (opts.from) { sql += " AND date(created_at) >= ?"; params.push(opts.from); }
  if (opts.to) { sql += " AND date(created_at) <= ?"; params.push(opts.to); }
  const rows = await dbSelect<{ ingresos: number; egresos: number }>(sql, params);
  const { ingresos = 0, egresos = 0 } = rows[0] ?? {};
  return { ingresos, egresos, balance: ingresos - egresos };
}

export async function getSummaryByCurrency(
  workspaceId: string,
  businessId: string,
  opts: { from?: string; to?: string } = {},
): Promise<{ ars: CashSummary; usd: CashSummary }> {
  let sql = `
    SELECT currency, direction, COALESCE(SUM(amount), 0) as total
    FROM cash_movements
    WHERE workspace_id = ? AND business_id = ?`;
  const params: unknown[] = [workspaceId, businessId];
  if (opts.from) { sql += " AND date(created_at) >= ?"; params.push(opts.from); }
  if (opts.to) { sql += " AND date(created_at) <= ?"; params.push(opts.to); }
  sql += " GROUP BY currency, direction";

  const rows = await dbSelect<{ currency: string; direction: string; total: number }>(sql, params);

  const get = (cur: string, dir: string) =>
    rows.find((r) => r.currency === cur && r.direction === dir)?.total ?? 0;

  const arsIn = get("ARS", "in");
  const arsOut = get("ARS", "out");
  const usdIn = get("USD", "in");
  const usdOut = get("USD", "out");

  return {
    ars: { ingresos: arsIn, egresos: arsOut, balance: arsIn - arsOut },
    usd: { ingresos: usdIn, egresos: usdOut, balance: usdIn - usdOut },
  };
}

export async function createMovement(
  workspaceId: string,
  businessId: string,
  data: CreateCashMovementInput,
): Promise<CashMovement> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await dbExecute(
    `INSERT INTO cash_movements
       (id, workspace_id, business_id, type, direction, amount, currency, description,
        customer_id, customer_name, reference_id, reference_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, null, ?)`,
    [
      id, workspaceId, businessId,
      data.type, data.direction, data.amount,
      data.currency ?? "ARS",
      data.description ?? null,
      data.customer_id ?? null,
      data.customer_name ?? null,
      now,
    ],
  );
  return {
    id, workspace_id: workspaceId, business_id: businessId,
    type: data.type, direction: data.direction,
    amount: data.amount, currency: data.currency ?? "ARS",
    description: data.description ?? null,
    customer_id: data.customer_id ?? null,
    customer_name: data.customer_name ?? null,
    reference_id: null, reference_type: null,
    created_at: now,
  };
}

/**
 * Helper que NO se usa hoy (sales.ts hace el insert inline para crear
 * un movement por moneda). Lo dejo por si lo necesitamos desde otro
 * caller, pero ahora respeta la moneda recibida en lugar de hard-codear.
 */
export async function createMovementFromSale(
  workspaceId: string,
  businessId: string,
  saleId: string,
  amount: number,
  currency: "ARS" | "USD",
  customerName: string | null,
  customerId: string | null,
): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await dbExecute(
    `INSERT INTO cash_movements
       (id, workspace_id, business_id, type, direction, amount, currency, description,
        customer_id, customer_name, reference_id, reference_type, created_at)
     VALUES (?, ?, ?, 'venta', 'in', ?, ?, ?, ?, ?, ?, 'sale', ?)`,
    [
      id, workspaceId, businessId, amount, currency,
      customerName ? `Venta — ${customerName}` : "Venta",
      customerId ?? null, customerName ?? null,
      saleId, now,
    ],
  );
}

export async function remove(id: string): Promise<void> {
  await dbExecute("DELETE FROM cash_movements WHERE id = ? AND reference_type IS NULL", [id]);
}

export const cashDb = { getMovements, getSummary, getSummaryByCurrency, createMovement, createMovementFromSale, remove };
