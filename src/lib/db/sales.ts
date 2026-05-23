import { dbSelect, dbExecute } from "./index";
import { markStockItemSoldWithSale } from "./quickStock";
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import {
  fetchSales, createSaleCloud, updateSaleCloud,
  addSalePaymentCloud,
  type CloudSale,
} from "../cloudAuth";
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

/** Dispatcher cloud para sales (R3). Las funciones críticas (getAll,
 *  reportes que cruzan tabla, addPayment) chequean este flag. */
function cloudCtx(): { jwt: string; wsId: string } | null {
  const s = useCloudAuthStore.getState();
  if (!s.isCloudModeFor("sales")) return null;
  if (!s.jwt || !s.activeWorkspaceId) return null;
  return { jwt: s.jwt, wsId: s.activeWorkspaceId };
}

function cloudSaleToLocal(c: CloudSale, localWid: string): Sale {
  return {
    id: c.id,
    workspace_id: localWid,
    customer_id: c.customer_id,
    customer_name: c.customer_name,
    seller_id: c.seller_id,
    seller_name: c.seller_name,
    subtotal: c.subtotal, total: c.total, total_paid: c.total_paid, balance: c.balance,
    is_paid: c.is_paid,
    payment_method: c.payment_method,
    notes: c.notes,
    out_of_stock_sale: c.out_of_stock_sale,
    regularized_at: c.regularized_at,
    regularized_by: c.regularized_by,
    sale_date: c.sale_date ?? c.created_at,
    created_at: c.created_at,
  } as Sale;
}

export async function getAll(workspaceId: string): Promise<Sale[]> {
  const ctx = cloudCtx();
  if (ctx) {
    const res = await fetchSales(ctx.jwt, ctx.wsId);
    if (res.ok) return res.data.sales.map((s) => cloudSaleToLocal(s, workspaceId));
    // eslint-disable-next-line no-console
    console.warn("[salesDb.getAll] cloud falló, fallback local:", res.error);
  }
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

  // ── Cloud path ───────────────────────────────────────────────────
  // Si estamos en cloud mode, creamos en Turso (sale + items + payments
  // en una pipeline atómica). El frontend ve la misma Sale de retorno.
  //
  // IMPORTANTE: el cloud path NO maneja IMEI auto-FIFO, descuento de
  // stock, ni cash_movements derivados. Esas operaciones siguen siendo
  // LOCAL y se ejecutan abajo en el path SQLite. Cuando cloud mode
  // tenga inventory + cash escribiendo cloud (futuro), unificamos.
  const cloudC = cloudCtx();
  if (cloudC) {
    const subtotal = data.items.reduce(
      (sum, item) => sum + item.unit_price * item.quantity,
      0,
    );
    const rate = data.usd_to_ars ?? 0;
    const totalPaid = data.payments.reduce((sum, p) => {
      if ((p.currency ?? "ARS") === "USD" || rate <= 0) return sum + p.amount;
      return sum + p.amount / rate;
    }, 0);
    const balance = subtotal - totalPaid;
    const isPaid = balance <= 0.01 ? 1 : 0;
    const primaryPayment =
      data.payments.find((p) => !p.is_deposit) ?? data.payments[0];
    const paymentMethod = primaryPayment?.method ?? null;
    const outOfStock = data.out_of_stock_sale ? 1 : 0;

    const res = await createSaleCloud(cloudC.jwt, cloudC.wsId, {
      id,
      customer_id: data.customer_id ?? null,
      customer_name: data.customer_name ?? null,
      seller_id: data.seller_id ?? null,
      seller_name: data.seller_name ?? null,
      subtotal, total: subtotal, total_paid: totalPaid, balance, is_paid: isPaid,
      notes: data.notes ?? null,
      payment_method: paymentMethod,
      out_of_stock_sale: outOfStock,
      sale_date: now,
      items: data.items.map((it) => ({
        id: crypto.randomUUID(),
        catalog_item_id: it.catalog_item_id ?? null,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        base_price: it.base_price ?? null,
        subtotal: it.unit_price * it.quantity,
        imei: it.imei ?? null,
        from_stock: it.from_stock ? 1 : 0,
      })),
      payments: data.payments.map((p) => ({
        id: crypto.randomUUID(),
        method: p.method,
        currency: p.currency ?? "ARS",
        amount: p.amount,
        is_deposit: p.is_deposit ? 1 : 0,
      })),
    });
    if (!res.ok) throw new Error(`No se pudo crear venta en la nube: ${res.error}`);

    // Devolver Sale sintetizado — los callers esperan el shape completo.
    return {
      id, workspace_id: workspaceId,
      business_id: data.business_id ?? null,
      customer_id: data.customer_id ?? null,
      customer_name: data.customer_name ?? null,
      seller_id: data.seller_id ?? null,
      seller_name: data.seller_name ?? null,
      subtotal, total: subtotal, total_paid: totalPaid, balance, is_paid: isPaid,
      notes: data.notes ?? null,
      sale_date: now, created_at: now,
      payment_method: paymentMethod,
      out_of_stock_sale: outOfStock,
      regularized_at: null, regularized_by: null,
    };
  }

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

  // Auto-register cash movements — UNO POR MONEDA del payment, no uno
  // por venta con el subtotal en USD hard-codeado a ARS (bug histórico).
  //
  // Lógica:
  //   - Agrupamos los payments por currency, sumando amounts.
  //   - cuenta-corriente NO va a caja (es deuda del cliente, no efectivo).
  //   - El amount del movement queda EN LA MONEDA del payment (sin
  //     convertir): si pagaron US$1.100 efectivo, el movement es
  //     currency=USD amount=1100; si pagaron $1.500.000 transferencia,
  //     currency=ARS amount=1500000.
  //   - Si una venta tiene pagos en mixto (parte USD efectivo + parte
  //     ARS transferencia), generamos 2 movements distintos pero ambos
  //     con reference_id = saleId, así "Ver venta original" sigue
  //     funcionando para los dos.
  if (data.business_id) {
    const cashByCurrency: Record<"ARS" | "USD", number> = { ARS: 0, USD: 0 };
    for (const p of data.payments) {
      if (p.method === "cuenta-corriente") continue; // deuda, no caja
      const currency = (p.currency ?? "ARS") as "ARS" | "USD";
      cashByCurrency[currency] += p.amount;
    }
    for (const [currency, amount] of Object.entries(cashByCurrency) as Array<["ARS" | "USD", number]>) {
      if (amount <= 0) continue;
      await dbExecute(
        `INSERT INTO cash_movements
           (id, workspace_id, business_id, type, direction, amount, currency, description,
            customer_id, customer_name, reference_id, reference_type, created_at)
         VALUES (?, ?, ?, 'venta', 'in', ?, ?, ?, ?, ?, ?, 'sale', ?)`,
        [
          crypto.randomUUID(), workspaceId, data.business_id,
          amount, currency,
          data.customer_name ? `Venta — ${data.customer_name}` : "Venta",
          data.customer_id ?? null, data.customer_name ?? null,
          id, now,
        ],
      );
    }
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
  const cloudC = cloudCtx();
  if (cloudC) {
    // En cloud sólo soportamos PATCH de campos top-level (notes, totales).
    // Los pagos se manejan vía addPayment endpoint. Cambiar la lista
    // completa de pagos requiere wipe + re-add → fuera de alcance ahora.
    const totalPaid = data.payments.reduce((sum, p) => sum + p.amount, 0);
    const res = await updateSaleCloud(cloudC.jwt, cloudC.wsId, saleId, {
      notes: data.notes,
      total_paid: totalPaid,
    });
    if (!res.ok) throw new Error(`No se pudo actualizar venta en la nube: ${res.error}`);
    return;
  }

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
  const cloudC = cloudCtx();
  if (cloudC) {
    const res = await updateSaleCloud(cloudC.jwt, cloudC.wsId, saleId, {
      is_paid: 1, balance: 0,
    } as Partial<CloudSale>);
    if (!res.ok) throw new Error(`No se pudo marcar como pagada: ${res.error}`);
    return;
  }
  await dbExecute(
    "UPDATE sales SET is_paid = 1, balance = 0, total_paid = total WHERE id = ?",
    [saleId],
  );
}

/**
 * Registra UN cobro contra una venta — el camino "correcto" cuando el
 * cliente paga, en vez de markAsPaid (que asume "pagado todo" sin
 * registrar con qué). Usado por CollectPaymentModal desde Mi Día y
 * SaleDrawer.
 *
 * Recalcula total_paid / balance / is_paid en base a TODOS los
 * sale_payments (incluido el nuevo). is_paid=1 cuando balance llega a 0
 * o menos (caso "el cliente pagó más del balance" → balance queda 0).
 *
 * Si amount > balance pendiente, lo clampeamos al balance para no
 * acreditar de más por error de tipeo. El caller puede mostrar un
 * warning si quiere.
 */
export async function addPayment(
  saleId: string,
  payment: { method: string; currency: "ARS" | "USD"; amount: number },
): Promise<void> {
  const cloudC = cloudCtx();
  if (cloudC) {
    // El endpoint cloud /payments recalcula total_paid/balance/is_paid
    // server-side. NO clampeamos amount al balance en el cloud — el
    // server acepta amounts mayores (caso "pago de más"), aunque la UI
    // del cliente puede pre-validar.
    const res = await addSalePaymentCloud(cloudC.jwt, cloudC.wsId, saleId, {
      method: payment.method,
      currency: payment.currency,
      amount: payment.amount,
      is_deposit: 0,
    });
    if (!res.ok) throw new Error(`No se pudo registrar el pago en la nube: ${res.error}`);
    return;
  }

  // 1) Leer total de la venta para calcular balance nuevo
  const rows = await dbSelect<{ total: number; total_paid: number }>(
    "SELECT total, total_paid FROM sales WHERE id = ?",
    [saleId],
  );
  const sale = rows[0];
  if (!sale) throw new Error(`Venta no encontrada: ${saleId}`);

  const currentBalance = sale.total - sale.total_paid;
  const applied = Math.min(payment.amount, currentBalance);

  // 2) Insert del pago
  await dbExecute(
    `INSERT INTO sale_payments (id, sale_id, method, currency, amount, is_deposit)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [
      crypto.randomUUID(),
      saleId,
      payment.method,
      payment.currency,
      applied,
    ],
  );

  // 3) Recalc del header de la venta. Hacemos SUM sobre sale_payments
  //    para que sea idempotente — si por alguna razón el INSERT y el
  //    UPDATE quedan fuera de fase, el próximo read converge.
  const sumRows = await dbSelect<{ paid: number }>(
    "SELECT COALESCE(SUM(amount), 0) AS paid FROM sale_payments WHERE sale_id = ?",
    [saleId],
  );
  const totalPaid = sumRows[0]?.paid ?? 0;
  const newBalance = Math.max(0, sale.total - totalPaid);
  const isPaid = newBalance === 0 ? 1 : 0;

  await dbExecute(
    "UPDATE sales SET total_paid = ?, balance = ?, is_paid = ? WHERE id = ?",
    [totalPaid, newBalance, isPaid, saleId],
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

/**
 * Crea una "deuda manual" — un caso especial de venta sin items reales,
 * usado para registrar dinero que el cliente debe sin que haya una venta
 * concreta detrás. Ej: saldo de un cellu anterior, préstamo personal,
 * pago de garantía atrasado.
 *
 * Internamente es una row en `sales` con:
 *   - 1 sale_item descriptivo (concept = description, qty 1)
 *   - total_paid = 0 → todo va al balance, queda como deuda
 *   - notes opcionales (ej: fecha de vencimiento)
 *   - out_of_stock_sale = 1 para que no toque inventario nunca
 *
 * Aparece en la lista de Deudas del cliente y en Caja igual que cualquier
 * otra venta no pagada. Cuando el cliente paga, se usa el flujo normal de
 * cobro (markAsPaid o agregando un sale_payment).
 */
export async function createManualDebt(
  workspaceId: string,
  data: {
    customer_id: string;
    customer_name: string;
    business_id?: string | null;
    concept: string;
    amount: number;
    currency?: "ARS" | "USD";
    due_date?: string | null;
    seller_id?: string | null;
    seller_name?: string | null;
  },
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const concept = data.concept.trim();
  if (concept.length < 2) throw new Error("El concepto es obligatorio");
  if (!data.amount || data.amount <= 0) throw new Error("Monto inválido");

  // Notes capturan la fecha de vencimiento si vino
  const noteParts: string[] = [`Deuda manual: ${concept}`];
  if (data.due_date) noteParts.push(`Vence: ${data.due_date}`);
  const notes = noteParts.join(" · ");

  await dbExecute(
    `INSERT INTO sales (
      id, workspace_id, business_id, customer_id, customer_name, seller_id, seller_name,
      subtotal, total, total_paid, balance, is_paid, notes, sale_date, created_at, payment_method,
      out_of_stock_sale
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, 1)`,
    [
      id,
      workspaceId,
      data.business_id ?? null,
      data.customer_id,
      data.customer_name,
      data.seller_id ?? null,
      data.seller_name ?? null,
      data.amount,
      data.amount,
      0,
      data.amount,
      notes,
      now,
      now,
    ],
  );

  // Una sola sale_item descriptiva (sin catalog_item_id, sin IMEI)
  const itemId = crypto.randomUUID();
  await dbExecute(
    `INSERT INTO sale_items (
      id, sale_id, catalog_item_id, description, quantity, unit_price, base_price, subtotal, imei, from_stock
    ) VALUES (?, ?, NULL, ?, 1, ?, ?, ?, NULL, 0)`,
    [itemId, id, concept, data.amount, data.amount, data.amount],
  );

  return { id };
}

export const salesDb = {
  getAll,
  getByCustomer,
  getMonthTotal,
  getRecent,
  getItems,
  getPayments,
  createSale,
  createManualDebt,
  updateSale,
  markAsPaid,
  addPayment,
  getRows,
  getSalesMetrics,
  getTopCustomers,
  getSalesByVendor,
  getSalesByMonth,
  getDayStats,
  getPendingRegularization,
  regularizeSale,
  getPendingCobros,
  getMarginMetrics,
  getTopProducts,
  getMarginByCategory,
  getMarginByMonth,
  getMarginByVendor,
};

/* ─────────────────────────────────────────────────────────────────────
 * Margin reports — todos los montos en USD (post-refactor USD-first).
 *
 * Costo: catalog_items.cost_usd (column de mig 024).
 * Revenue: sale_items.unit_price * sale_items.quantity (siempre USD).
 *
 * Items sin catalog_item_id (out_of_stock) se cuentan en revenue pero no
 * en cost (no podemos calcular margen sin costo). Aparecen separados.
 * ─────────────────────────────────────────────────────────────────── */

export interface MarginMetrics {
  revenue_this_month: number;
  cost_this_month: number;
  margin_this_month: number;
  margin_pct_this_month: number;
  revenue_last_month: number;
  cost_last_month: number;
  margin_last_month: number;
  margin_pct_last_month: number;
  /** Ítems vendidos este mes sin costo cargado (revenue conocido, cost = NULL) */
  uncosted_revenue_this_month: number;
}

export async function getMarginMetrics(workspaceId: string): Promise<MarginMetrics> {
  // Agregamos revenue y cost por mes via JOIN con catalog_items
  const rows = await dbSelect<{
    period: string;
    revenue: number;
    cost: number;
    uncosted_revenue: number;
  }>(
    `SELECT
       CASE
         WHEN strftime('%Y-%m', s.sale_date) = strftime('%Y-%m', 'now') THEN 'this'
         WHEN strftime('%Y-%m', s.sale_date) = strftime('%Y-%m', date('now', '-1 month')) THEN 'last'
         ELSE 'other'
       END AS period,
       COALESCE(SUM(si.unit_price * si.quantity), 0) AS revenue,
       COALESCE(SUM(
         CASE WHEN ci.cost_usd > 0
           THEN ci.cost_usd * si.quantity
           ELSE 0
         END
       ), 0) AS cost,
       COALESCE(SUM(
         CASE WHEN ci.cost_usd IS NULL OR ci.cost_usd <= 0
           THEN si.unit_price * si.quantity
           ELSE 0
         END
       ), 0) AS uncosted_revenue
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     LEFT JOIN catalog_items ci ON ci.id = si.catalog_item_id
     WHERE s.workspace_id = ?
       AND (
         strftime('%Y-%m', s.sale_date) = strftime('%Y-%m', 'now')
         OR strftime('%Y-%m', s.sale_date) = strftime('%Y-%m', date('now', '-1 month'))
       )
     GROUP BY period`,
    [workspaceId],
  ).catch(() => [] as Array<{ period: string; revenue: number; cost: number; uncosted_revenue: number }>);

  const thisM = rows.find((r) => r.period === "this");
  const lastM = rows.find((r) => r.period === "last");

  const revenue_this = thisM?.revenue ?? 0;
  const cost_this = thisM?.cost ?? 0;
  const margin_this = revenue_this - cost_this;
  const margin_pct_this = cost_this > 0 ? (margin_this / cost_this) * 100 : 0;

  const revenue_last = lastM?.revenue ?? 0;
  const cost_last = lastM?.cost ?? 0;
  const margin_last = revenue_last - cost_last;
  const margin_pct_last = cost_last > 0 ? (margin_last / cost_last) * 100 : 0;

  return {
    revenue_this_month: revenue_this,
    cost_this_month: cost_this,
    margin_this_month: margin_this,
    margin_pct_this_month: margin_pct_this,
    revenue_last_month: revenue_last,
    cost_last_month: cost_last,
    margin_last_month: margin_last,
    margin_pct_last_month: margin_pct_last,
    uncosted_revenue_this_month: thisM?.uncosted_revenue ?? 0,
  };
}

export interface TopProduct {
  catalog_item_id: string;
  name: string;
  category: string | null;
  image_path: string | null;
  units_sold: number;
  revenue: number;
  cost: number;
  margin: number;
  margin_pct: number;
}

export async function getTopProducts(
  workspaceId: string,
  limit = 10,
  windowMonths = 6,
): Promise<TopProduct[]> {
  return dbSelect<TopProduct>(
    `SELECT
       ci.id AS catalog_item_id,
       ci.name AS name,
       ci.category AS category,
       ci.image_path AS image_path,
       COALESCE(SUM(si.quantity), 0) AS units_sold,
       COALESCE(SUM(si.unit_price * si.quantity), 0) AS revenue,
       COALESCE(SUM(COALESCE(ci.cost_usd, 0) * si.quantity), 0) AS cost,
       COALESCE(SUM((si.unit_price - COALESCE(ci.cost_usd, 0)) * si.quantity), 0) AS margin,
       CASE
         WHEN SUM(COALESCE(ci.cost_usd, 0) * si.quantity) > 0
         THEN (SUM((si.unit_price - COALESCE(ci.cost_usd, 0)) * si.quantity) * 100.0)
              / SUM(COALESCE(ci.cost_usd, 0) * si.quantity)
         ELSE 0
       END AS margin_pct
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN catalog_items ci ON ci.id = si.catalog_item_id
     WHERE s.workspace_id = ? AND s.sale_date >= date('now', ?)
     GROUP BY ci.id
     ORDER BY revenue DESC
     LIMIT ?`,
    [workspaceId, `-${windowMonths} months`, limit],
  ).catch(() => [] as TopProduct[]);
}

export interface CategoryStats {
  category: string;
  units_sold: number;
  revenue: number;
  cost: number;
  margin: number;
  margin_pct: number;
}

export async function getMarginByCategory(
  workspaceId: string,
  windowMonths = 6,
): Promise<CategoryStats[]> {
  return dbSelect<CategoryStats>(
    `SELECT
       COALESCE(ci.category, 'Sin categoría') AS category,
       COALESCE(SUM(si.quantity), 0) AS units_sold,
       COALESCE(SUM(si.unit_price * si.quantity), 0) AS revenue,
       COALESCE(SUM(COALESCE(ci.cost_usd, 0) * si.quantity), 0) AS cost,
       COALESCE(SUM((si.unit_price - COALESCE(ci.cost_usd, 0)) * si.quantity), 0) AS margin,
       CASE
         WHEN SUM(COALESCE(ci.cost_usd, 0) * si.quantity) > 0
         THEN (SUM((si.unit_price - COALESCE(ci.cost_usd, 0)) * si.quantity) * 100.0)
              / SUM(COALESCE(ci.cost_usd, 0) * si.quantity)
         ELSE 0
       END AS margin_pct
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     LEFT JOIN catalog_items ci ON ci.id = si.catalog_item_id
     WHERE s.workspace_id = ? AND s.sale_date >= date('now', ?)
     GROUP BY category
     ORDER BY revenue DESC`,
    [workspaceId, `-${windowMonths} months`],
  ).catch(() => [] as CategoryStats[]);
}

export interface MonthlyMargin {
  month: string;
  revenue: number;
  cost: number;
  margin: number;
  sales_count: number;
}

export async function getMarginByMonth(
  workspaceId: string,
  months = 6,
): Promise<MonthlyMargin[]> {
  return dbSelect<MonthlyMargin>(
    `SELECT
       strftime('%Y-%m', s.sale_date) AS month,
       COUNT(DISTINCT s.id) AS sales_count,
       COALESCE(SUM(si.unit_price * si.quantity), 0) AS revenue,
       COALESCE(SUM(COALESCE(ci.cost_usd, 0) * si.quantity), 0) AS cost,
       COALESCE(SUM((si.unit_price - COALESCE(ci.cost_usd, 0)) * si.quantity), 0) AS margin
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     LEFT JOIN catalog_items ci ON ci.id = si.catalog_item_id
     WHERE s.workspace_id = ? AND s.sale_date >= date('now', ?)
     GROUP BY month
     ORDER BY month ASC`,
    [workspaceId, `-${months} months`],
  ).catch(() => [] as MonthlyMargin[]);
}

export interface VendorMarginStats {
  seller_id: string | null;
  seller_name: string | null;
  sales_count: number;
  revenue: number;
  cost: number;
  margin: number;
  margin_pct: number;
}

export async function getMarginByVendor(workspaceId: string): Promise<VendorMarginStats[]> {
  return dbSelect<VendorMarginStats>(
    `SELECT
       s.seller_id,
       s.seller_name,
       COUNT(DISTINCT s.id) AS sales_count,
       COALESCE(SUM(si.unit_price * si.quantity), 0) AS revenue,
       COALESCE(SUM(COALESCE(ci.cost_usd, 0) * si.quantity), 0) AS cost,
       COALESCE(SUM((si.unit_price - COALESCE(ci.cost_usd, 0)) * si.quantity), 0) AS margin,
       CASE
         WHEN SUM(COALESCE(ci.cost_usd, 0) * si.quantity) > 0
         THEN (SUM((si.unit_price - COALESCE(ci.cost_usd, 0)) * si.quantity) * 100.0)
              / SUM(COALESCE(ci.cost_usd, 0) * si.quantity)
         ELSE 0
       END AS margin_pct
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     LEFT JOIN catalog_items ci ON ci.id = si.catalog_item_id
     WHERE s.workspace_id = ?
     GROUP BY s.seller_id
     ORDER BY revenue DESC`,
    [workspaceId],
  ).catch(() => [] as VendorMarginStats[]);
}
