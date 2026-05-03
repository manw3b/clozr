import { dbSelect, dbExecute } from "./index";
import { markStockItemSoldWithSale } from "./quickStock";
import type {
  Sale,
  SaleItem,
  SalePayment,
  CreateSaleInput,
  UpdateSaleInput,
  SalesMetrics,
  TopCustomer,
  VendorStats,
  MonthlyRevenue,
  SaleRow,
} from "./types";

export async function getAll(workspaceId: string): Promise<Sale[]> {
  return dbSelect<Sale>(
    "SELECT * FROM sales WHERE workspace_id = ? ORDER BY sale_date DESC",
    [workspaceId],
  );
}

export async function getByCustomer(
  workspaceId: string,
  customerId: string,
): Promise<Sale[]> {
  return dbSelect<Sale>(
    "SELECT * FROM sales WHERE workspace_id = ? AND customer_id = ? ORDER BY sale_date DESC",
    [workspaceId, customerId],
  );
}

export async function getMonthTotal(workspaceId: string): Promise<number> {
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const rows = await dbSelect<{ total: number }>(
    "SELECT COALESCE(SUM(total), 0) AS total FROM sales WHERE workspace_id = ? AND sale_date >= ?",
    [workspaceId, start],
  );
  return rows[0]?.total ?? 0;
}

export async function getRecent(workspaceId: string, limit = 5): Promise<Sale[]> {
  return dbSelect<Sale>(
    "SELECT * FROM sales WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?",
    [workspaceId, limit],
  );
}

export async function getItems(saleId: string): Promise<SaleItem[]> {
  return dbSelect<SaleItem>(
    "SELECT * FROM sale_items WHERE sale_id = ?",
    [saleId],
  );
}

export async function getPayments(saleId: string): Promise<SalePayment[]> {
  return dbSelect<SalePayment>(
    "SELECT * FROM sale_payments WHERE sale_id = ?",
    [saleId],
  );
}

// BUG 2 FIX: removed explicit BEGIN/COMMIT/ROLLBACK — tauri-plugin-sql
// wraps each execute internally, causing "cannot start a transaction within a
// transaction". Statements run sequentially without explicit transaction.
export async function createSale(
  workspaceId: string,
  data: CreateSaleInput,
): Promise<Sale> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // sales.subtotal y sales.total siempre en USD (fuente de verdad). items.unit_price es USD.
  const subtotal = data.items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0,
  );
  // total_paid también en USD. Si el payment está en ARS, convertimos con la cotización del momento.
  const rate = data.usd_to_ars ?? 0;
  const totalPaid = data.payments.reduce((sum, p) => {
    if ((p.currency ?? "ARS") === "USD" || rate <= 0) return sum + p.amount;
    return sum + p.amount / rate;
  }, 0);
  const balance = subtotal - totalPaid;
  const isPaid = balance <= 0.01 ? 1 : 0; // tolerancia para errores de redondeo

  // Migration 022: denormalized payment_method for quick listing.
  // Pick first non-deposit payment, fallback to first payment.
  const primaryPayment =
    data.payments.find((p) => !p.is_deposit) ?? data.payments[0];
  const paymentMethod = primaryPayment?.method ?? null;

  const outOfStock = data.out_of_stock_sale ? 1 : 0;
  await dbExecute(
    `INSERT INTO sales (
      id, workspace_id, business_id, customer_id, customer_name, seller_id, seller_name,
      subtotal, total, total_paid, balance, is_paid, notes, sale_date, created_at, payment_method,
      out_of_stock_sale
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, workspaceId,
      data.business_id ?? null,
      data.customer_id ?? null,
      data.customer_name ?? null,
      data.seller_id ?? null,
      data.seller_name ?? null,
      subtotal, subtotal, totalPaid, balance, isPaid,
      data.notes ?? null, now, now, paymentMethod, outOfStock,
    ],
  );

  for (const item of data.items) {
    // Auto-FIFO: si hay catalog_item pero no IMEI explícito, intentamos
    // marcar los primeros N IMEIs disponibles (FIFO por created_at).
    // Esto descuenta el inventario aunque el vendedor no haya elegido unidad.
    let assignedImeis: string[] = [];
    if (!item.imei && item.catalog_item_id && data.out_of_stock_sale !== true) {
      try {
        const available = await dbSelect<{ imei: string }>(
          `SELECT imei FROM catalog_imei
           WHERE catalog_item_id = ? AND sold_at IS NULL
           ORDER BY rowid ASC LIMIT ?`,
          [item.catalog_item_id, item.quantity],
        );
        assignedImeis = available.map((r) => r.imei);
      } catch {
        /* tabla puede no existir en DBs muy viejas */
      }
    }

    // El primer IMEI asignado va al sale_item (legacy: una sola columna imei).
    // Los demás (cuando quantity > 1) se marcan vendidos abajo pero el
    // sale_item sigue refiriendo solo al primero. Mejora futura: una fila
    // sale_items por IMEI.
    const recordedImei = item.imei ?? assignedImeis[0] ?? null;
    const isFromStock = item.from_stock || assignedImeis.length > 0;

    await dbExecute(
      `INSERT INTO sale_items
        (id, sale_id, catalog_item_id, description, quantity, unit_price, base_price, subtotal, imei, from_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(), id,
        item.catalog_item_id ?? null,
        item.description, item.quantity, item.unit_price,
        item.base_price ?? null,
        item.unit_price * item.quantity,
        recordedImei,
        isFromStock ? 1 : 0,
      ],
    );

    if (isFromStock && item.catalog_item_id) {
      await dbExecute(
        "UPDATE catalog_items SET stock = MAX(0, stock - ?) WHERE id = ? AND track_stock = 1",
        [item.quantity, item.catalog_item_id],
      );
    }

    // Marcar todos los IMEIs vendidos: el explícito + los auto-asignados
    const imeisToMark = item.imei ? [item.imei] : assignedImeis;
    for (const imei of imeisToMark) {
      await dbExecute(
        "UPDATE catalog_imei SET sold_at = ?, sale_id = ? WHERE imei = ?",
        [now, id, imei],
      );
      await markStockItemSoldWithSale(imei, workspaceId, id, data.customer_name ?? null).catch(() => {});
    }
  }

  for (const payment of data.payments) {
    await dbExecute(
      `INSERT INTO sale_payments (id, sale_id, method, currency, amount, is_deposit)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(), id,
        payment.method,
        payment.currency ?? "ARS",
        payment.amount,
        payment.is_deposit ? 1 : 0,
      ],
    );
  }

  if (data.customer_id) {
    await dbExecute(
      "UPDATE customers SET total_sales = total_sales + ? WHERE id = ?",
      [subtotal, data.customer_id],
    );
  }

  // Auto-register cash movement
  if (data.business_id && subtotal > 0) {
    await dbExecute(
      `INSERT INTO cash_movements
         (id, workspace_id, business_id, type, direction, amount, currency, description,
          customer_id, customer_name, reference_id, reference_type, created_at)
       VALUES (?, ?, ?, 'venta', 'in', ?, 'ARS', ?, ?, ?, ?, 'sale', ?)`,
      [
        crypto.randomUUID(), workspaceId, data.business_id,
        subtotal,
        data.customer_name ? `Venta — ${data.customer_name}` : "Venta",
        data.customer_id ?? null, data.customer_name ?? null,
        id, now,
      ],
    );
  }

  return {
    id,
    workspace_id: workspaceId,
    business_id: data.business_id ?? null,
    customer_id: data.customer_id ?? null,
    customer_name: data.customer_name ?? null,
    seller_id: data.seller_id ?? null,
    seller_name: data.seller_name ?? null,
    subtotal,
    total: subtotal,
    total_paid: totalPaid,
    balance,
    is_paid: isPaid,
    notes: data.notes ?? null,
    sale_date: now,
    created_at: now,
    payment_method: paymentMethod,
    out_of_stock_sale: outOfStock,
    regularized_at: null,
    regularized_by: null,
  };
}

export async function updateSale(saleId: string, data: UpdateSaleInput): Promise<void> {
  const rows = await dbSelect<{ total: number }>(
    "SELECT total FROM sales WHERE id = ?",
    [saleId],
  );
  const total = rows[0]?.total ?? 0;
  const totalPaid = data.payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = total - totalPaid;
  const isPaid = balance <= 0 ? 1 : 0;

  await dbExecute(
    "UPDATE sales SET notes = ?, is_paid = ?, total_paid = ?, balance = ? WHERE id = ?",
    [data.notes, isPaid, totalPaid, balance, saleId],
  );

  await dbExecute("DELETE FROM sale_payments WHERE sale_id = ?", [saleId]);

  for (const p of data.payments) {
    await dbExecute(
      "INSERT INTO sale_payments (id, sale_id, method, currency, amount, is_deposit) VALUES (?, ?, ?, ?, ?, ?)",
      [crypto.randomUUID(), saleId, p.method, p.currency, p.amount, p.is_deposit ? 1 : 0],
    );
  }
}

export async function markAsPaid(saleId: string): Promise<void> {
  await dbExecute(
    "UPDATE sales SET is_paid = 1, balance = 0, total_paid = total WHERE id = ?",
    [saleId],
  );
}

export async function getRows(
  workspaceId: string,
  period: "today" | "week" | "month" | "all" = "all",
): Promise<SaleRow[]> {
  let periodFilter = "";
  if (period === "today") {
    periodFilter = " AND date(s.sale_date) = date('now')";
  } else if (period === "week") {
    periodFilter = " AND s.sale_date >= date('now', '-7 days')";
  } else if (period === "month") {
    periodFilter =
      " AND strftime('%Y-%m', s.sale_date) = strftime('%Y-%m', 'now')";
  }

  return dbSelect<SaleRow>(
    `SELECT s.*,
      (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as items_count,
      (SELECT GROUP_CONCAT(description, ', ')
       FROM (SELECT description FROM sale_items WHERE sale_id = s.id LIMIT 2)) as items_preview
     FROM sales s
     WHERE s.workspace_id = ?${periodFilter}
     ORDER BY s.sale_date DESC`,
    [workspaceId],
  );
}

export async function getSalesMetrics(workspaceId: string): Promise<SalesMetrics> {
  const rows = await dbSelect<SalesMetrics>(
    `SELECT
      COUNT(*) as total_sales,
      COALESCE(SUM(total), 0) as total_revenue,
      COALESCE(AVG(total), 0) as avg_ticket,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', sale_date) = strftime('%Y-%m', 'now')
        THEN total ELSE 0 END), 0) as this_month,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', sale_date) = strftime('%Y-%m', date('now', '-1 month'))
        THEN total ELSE 0 END), 0) as last_month,
      COALESCE(SUM(balance), 0) as total_pending,
      COUNT(CASE WHEN strftime('%Y-%m', sale_date) = strftime('%Y-%m', 'now') THEN 1 END) as month_sales_count
    FROM sales WHERE workspace_id = ?`,
    [workspaceId],
  );
  return (
    rows[0] ?? {
      total_sales: 0,
      total_revenue: 0,
      avg_ticket: 0,
      this_month: 0,
      last_month: 0,
      total_pending: 0,
      month_sales_count: 0,
    }
  );
}

export async function getTopCustomers(
  workspaceId: string,
  limit = 10,
): Promise<TopCustomer[]> {
  return dbSelect<TopCustomer>(
    `SELECT customer_id, customer_name,
      COUNT(*) as purchases,
      COALESCE(SUM(total), 0) as total_spent,
      COALESCE(AVG(total), 0) as avg_ticket,
      MAX(sale_date) as last_purchase
    FROM sales
    WHERE workspace_id = ? AND customer_id IS NOT NULL
    GROUP BY customer_id
    ORDER BY total_spent DESC
    LIMIT ?`,
    [workspaceId, limit],
  );
}

export async function getSalesByVendor(workspaceId: string): Promise<VendorStats[]> {
  return dbSelect<VendorStats>(
    `SELECT seller_id, seller_name,
      COUNT(*) as sales_count,
      COALESCE(SUM(total), 0) as total_revenue,
      COALESCE(AVG(total), 0) as avg_ticket
    FROM sales WHERE workspace_id = ?
    GROUP BY seller_id
    ORDER BY total_revenue DESC`,
    [workspaceId],
  );
}

export async function getSalesByMonth(
  workspaceId: string,
  months = 6,
): Promise<MonthlyRevenue[]> {
  return dbSelect<MonthlyRevenue>(
    `SELECT strftime('%Y-%m', sale_date) as month,
      COUNT(*) as sales_count,
      COALESCE(SUM(total), 0) as revenue
    FROM sales
    WHERE workspace_id = ? AND sale_date >= date('now', ?)
    GROUP BY month
    ORDER BY month ASC`,
    [workspaceId, `-${months} months`],
  );
}

export async function getDayStats(
  workspaceId: string,
  businessId: string,
  date: string,
): Promise<{ total: number; count: number }> {
  const rows = await dbSelect<{ total: number; count: number }>(
    `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
     FROM sales
     WHERE workspace_id = ? AND business_id = ? AND date(sale_date) = ?`,
    [workspaceId, businessId, date],
  );
  return rows[0] ?? { total: 0, count: 0 };
}

export async function getPendingCobros(workspaceId: string, limit = 3): Promise<Sale[]> {
  return dbSelect<Sale>(
    `SELECT * FROM sales
     WHERE workspace_id = ? AND is_paid = 0 AND balance > 0
     ORDER BY sale_date DESC LIMIT ?`,
    [workspaceId, limit],
  );
}

/** Migration 025 — Ventas fuera de stock pendientes de regularizar. */
export async function getPendingRegularization(workspaceId: string): Promise<Sale[]> {
  try {
    return await dbSelect<Sale>(
      `SELECT * FROM sales
       WHERE workspace_id = ? AND out_of_stock_sale = 1 AND regularized_at IS NULL
       ORDER BY created_at DESC`,
      [workspaceId],
    );
  } catch {
    return [];
  }
}

export async function regularizeSale(
  saleId: string,
  catalogItemId: string | null,
  imei: string | null,
  byUserId: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  await dbExecute(
    `UPDATE sales SET regularized_at = ?, regularized_by = ? WHERE id = ?`,
    [now, byUserId, saleId],
  );
  if (catalogItemId) {
    await dbExecute(
      `UPDATE sale_items SET catalog_item_id = ?, imei = ?
       WHERE sale_id = ? AND id IN (SELECT id FROM sale_items WHERE sale_id = ? LIMIT 1)`,
      [catalogItemId, imei, saleId, saleId],
    );
  }
}

export const salesDb = {
  getAll,
  getByCustomer,
  getMonthTotal,
  getRecent,
  getItems,
  getPayments,
  createSale,
  updateSale,
  markAsPaid,
  getRows,
  getSalesMetrics,
  getTopCustomers,
  getSalesByVendor,
  getSalesByMonth,
  getDayStats,
  getPendingRegularization,
  regularizeSale,
  getPendingCobros,
};
