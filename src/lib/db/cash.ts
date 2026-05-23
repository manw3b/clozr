import { dbSelect, dbExecute } from "./index";
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import { cashApi } from "../cloudAuth";
import { log } from "../logger";
import type { CashMovement, CashSummary, CreateCashMovementInput, CashMovementType, CashDirection } from "./types";

function cashCloudCtx(): { jwt: string; wsId: string } | null {
  const s = useCloudAuthStore.getState();
  if (!s.isCloudModeFor("cash")) return null;
  if (!s.jwt || !s.activeWorkspaceId) return null;
  return { jwt: s.jwt, wsId: s.activeWorkspaceId };
}

export async function getMovements(
  workspaceId: string,
  businessId: string,
  opts: { from?: string; to?: string; limit?: number } = {},
): Promise<CashMovement[]> {
  const ctx = cashCloudCtx();
  if (ctx) {
    const res = await cashApi.list(ctx.jwt, ctx.wsId);
    if (res.ok) {
      // Mapeo cloud → local: el shape cloud usa kind/category; el local
      // usa type/direction. Derivamos:
      //   kind 'income' → direction 'in', type 'venta'
      //   kind 'expense' → direction 'out', type 'gasto'
      // No es 1:1 perfecto pero es el mejor mapping sin info adicional.
      let items = (res.data.items as unknown as Array<Record<string, unknown>>).map((m): CashMovement => {
        const kind = String(m.kind ?? "income");
        const direction: CashDirection = kind === "expense" ? "out" : "in";
        const type: CashMovementType = (kind === "expense" ? "gasto" : "venta") as CashMovementType;
        return {
          id: String(m.id),
          workspace_id: workspaceId,
          business_id: businessId,
          type,
          direction,
          amount: Number(m.amount ?? 0),
          currency: String(m.currency ?? "ARS"),
          description: (m.description as string | null) ?? null,
          customer_id: null,
          customer_name: (m.customer_name as string | null) ?? null,
          reference_id: (m.sale_id as string | null) ?? null,
          reference_type: m.sale_id ? "sale" : null,
          created_at: String(m.moved_at ?? m.created_at ?? ""),
        };
      });
      if (opts.from) items = items.filter((m) => m.created_at >= opts.from!);
      if (opts.to)   items = items.filter((m) => m.created_at <= opts.to!);
      if (opts.limit) items = items.slice(0, opts.limit);
      return items;
    }
    log.warn("getMovements cloud falló", { scope: "cashDb", data: { error: res.error } });
  }
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

  const ctx = cashCloudCtx();
  if (ctx) {
    // Mapeo local→cloud: type/direction → kind/category
    //   direction 'in' → kind 'income'
    //   direction 'out' → kind 'expense'
    //   type → category (lo guardamos crudo, no hay mapping estricto)
    const res = await cashApi.create(ctx.jwt, ctx.wsId, {
      id,
      kind: data.direction === "out" ? "expense" : "income",
      amount: data.amount,
      currency: data.currency ?? "ARS",
      description: data.description ?? null,
      category: data.type,
      customer_name: data.customer_name ?? null,
      moved_at: now,
    } as never);
    if (!res.ok) throw new Error(`No se pudo crear movimiento en la nube: ${res.error}`);
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

/**
 * Borra un cash movement por id. Antes había un guardrail
 * \`AND reference_type IS NULL\` que bloqueaba borrar movements
 * vinculados a ventas — pero en la práctica eso impedía corregir
 * errores históricos (ej: venta cargada con moneda incorrecta).
 *
 * Ahora se permite. La venta original NO se borra — sólo el movement,
 * que es la "manifestación en caja" del cobro. Si después se cobra de
 * nuevo o el usuario carga el movement manualmente correcto, todo
 * queda bien.
 */
export async function remove(id: string): Promise<void> {
  await dbExecute("DELETE FROM cash_movements WHERE id = ?", [id]);
}

export const cashDb = { getMovements, getSummary, getSummaryByCurrency, createMovement, createMovementFromSale, remove };
