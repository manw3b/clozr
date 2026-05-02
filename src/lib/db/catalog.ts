import { dbSelect, dbExecute, getDb } from "./index";
import type {
  CatalogItem,
  CatalogImei,
  CatalogItemWithImeis,
  StockViewItem,
  CatalogImeiRow,
  InventorySummary,
  CreateCatalogItemInput,
  UpdateCatalogItemInput,
} from "./types";

export async function getAll(workspaceId: string): Promise<CatalogItemWithImeis[]> {
  const rows = await dbSelect<CatalogItemWithImeis>(
    `SELECT c.*,
      COUNT(CASE WHEN ci.sold_at IS NULL THEN 1 END) as available_imeis,
      COUNT(ci.id) as total_imeis
     FROM catalog_items c
     LEFT JOIN catalog_imei ci ON ci.catalog_item_id = c.id
     WHERE c.workspace_id = ? AND c.active = 1
     GROUP BY c.id
     ORDER BY c.sort_order ASC, c.name ASC`,
    [workspaceId],
  );
  for (const item of rows) {
    if (item.condition_details_json) {
      try { item.conditionDetails = JSON.parse(item.condition_details_json); } catch { /* ignore */ }
    }
  }
  return rows;
}

export async function getStockView(workspaceId: string): Promise<StockViewItem[]> {
  return dbSelect<StockViewItem>(
    `SELECT c.*,
      (SELECT COUNT(*) FROM catalog_imei WHERE catalog_item_id = c.id AND sold_at IS NULL) as available_imeis,
      (SELECT COUNT(*) FROM catalog_imei WHERE catalog_item_id = c.id) as total_imeis,
      (SELECT MAX(s.sale_date) FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE si.catalog_item_id = c.id) as last_sale_date
     FROM catalog_items c
     WHERE c.workspace_id = ? AND c.active = 1
     ORDER BY c.name ASC`,
    [workspaceId],
  );
}

export async function getInventorySummary(workspaceId: string): Promise<InventorySummary> {
  const rows = await dbSelect<InventorySummary>(
    `SELECT
      COUNT(*) as total_items,
      COUNT(CASE WHEN track_stock = 1 AND stock > 0 THEN 1 END) as in_stock,
      COUNT(CASE WHEN track_stock = 1 AND stock = 0 THEN 1 END) as out_of_stock,
      COALESCE(SUM(CASE WHEN track_stock = 1 AND price IS NOT NULL THEN price * stock ELSE 0 END), 0) as total_value
    FROM catalog_items
    WHERE workspace_id = ? AND active = 1`,
    [workspaceId],
  );
  return rows[0] ?? { total_items: 0, in_stock: 0, out_of_stock: 0, total_value: 0 };
}

export async function getAllImeis(workspaceId: string): Promise<CatalogImeiRow[]> {
  return dbSelect<CatalogImeiRow>(
    `SELECT ci.*, c.name as product_name
     FROM catalog_imei ci
     JOIN catalog_items c ON c.id = ci.catalog_item_id
     WHERE c.workspace_id = ?
     ORDER BY CASE WHEN ci.sold_at IS NULL THEN 0 ELSE 1 END, ci.sold_at DESC`,
    [workspaceId],
  );
}

export async function getCategories(workspaceId: string): Promise<string[]> {
  const rows = await dbSelect<{ category: string }>(
    `SELECT DISTINCT category FROM catalog_items
     WHERE workspace_id = ? AND active = 1 AND category IS NOT NULL
     ORDER BY category ASC`,
    [workspaceId],
  );
  return rows.map((r) => r.category);
}

export async function getSubcategories(workspaceId: string, category: string): Promise<string[]> {
  const rows = await dbSelect<{ subcategory: string }>(
    `SELECT DISTINCT subcategory FROM catalog_items
     WHERE workspace_id = ? AND active = 1 AND category = ? AND subcategory IS NOT NULL
     ORDER BY subcategory ASC`,
    [workspaceId, category],
  );
  return rows.map((r) => r.subcategory);
}

export async function create(
  workspaceId: string,
  data: CreateCatalogItemInput,
  id: string = crypto.randomUUID(),
): Promise<CatalogItem> {
  const now = new Date().toISOString();
  const trackStock = data.track_stock ? 1 : 0;
  const condition = data.condition ?? "new";
  await dbExecute(
    `INSERT INTO catalog_items
      (id, workspace_id, name, category, subcategory, price, currency,
       track_stock, stock, stock_min, active, sort_order, custom_fields_json,
       image_path, condition, condition_details_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      data.name,
      data.category ?? null,
      data.subcategory ?? null,
      data.price ?? null,
      data.currency ?? "ARS",
      trackStock,
      data.stock ?? 0,
      data.stock_min ?? 0,
      data.sort_order ?? 0,
      data.custom_fields_json ?? null,
      data.image_path ?? null,
      condition,
      data.condition_details_json ?? null,
      now,
    ],
  );
  return {
    id,
    workspace_id: workspaceId,
    name: data.name,
    category: data.category ?? null,
    subcategory: data.subcategory ?? null,
    price: data.price ?? null,
    currency: data.currency ?? "ARS",
    track_stock: trackStock,
    stock: data.stock ?? 0,
    stock_min: data.stock_min ?? 0,
    active: 1,
    sort_order: data.sort_order ?? 0,
    custom_fields_json: data.custom_fields_json ?? null,
    image_path: data.image_path ?? null,
    condition,
    condition_details_json: data.condition_details_json ?? null,
    created_at: now,
  };
}

export async function update(
  workspaceId: string,
  id: string,
  data: UpdateCatalogItemInput,
): Promise<void> {
  const mapped: Record<string, unknown> = {};
  if (data.name !== undefined) mapped.name = data.name;
  if (data.category !== undefined) mapped.category = data.category;
  if (data.subcategory !== undefined) mapped.subcategory = data.subcategory;
  if (data.price !== undefined) mapped.price = data.price;
  if (data.currency !== undefined) mapped.currency = data.currency;
  if (data.track_stock !== undefined) mapped.track_stock = data.track_stock ? 1 : 0;
  if (data.stock !== undefined) mapped.stock = data.stock;
  if (data.stock_min !== undefined) mapped.stock_min = data.stock_min;
  if (data.active !== undefined) mapped.active = data.active ? 1 : 0;
  if (data.sort_order !== undefined) mapped.sort_order = data.sort_order;
  if (data.custom_fields_json !== undefined) mapped.custom_fields_json = data.custom_fields_json;
  if (data.image_path !== undefined) mapped.image_path = data.image_path;
  if (data.condition !== undefined) mapped.condition = data.condition;
  if (data.condition_details_json !== undefined) mapped.condition_details_json = data.condition_details_json;

  if (Object.keys(mapped).length === 0) return;

  const fields = Object.keys(mapped)
    .map((k) => `${k} = ?`)
    .join(", ");
  const values = [...Object.values(mapped), workspaceId, id];
  await dbExecute(
    `UPDATE catalog_items SET ${fields} WHERE workspace_id = ? AND id = ?`,
    values,
  );
}

export async function softDelete(workspaceId: string, id: string): Promise<void> {
  await dbExecute(
    "UPDATE catalog_items SET active = 0 WHERE workspace_id = ? AND id = ?",
    [workspaceId, id],
  );
}

export async function decrementStock(id: string, quantity: number): Promise<void> {
  await dbExecute(
    "UPDATE catalog_items SET stock = MAX(0, stock - ?) WHERE id = ? AND track_stock = 1",
    [quantity, id],
  );
}

export async function adjustStock(id: string, delta: number): Promise<void> {
  await dbExecute(
    "UPDATE catalog_items SET stock = MAX(0, stock + ?) WHERE id = ?",
    [delta, id],
  );
}

export async function search(workspaceId: string, query: string): Promise<CatalogItemWithImeis[]> {
  return dbSelect<CatalogItemWithImeis>(
    `SELECT c.*,
      COUNT(CASE WHEN ci.sold_at IS NULL THEN 1 END) as available_imeis,
      COUNT(ci.id) as total_imeis
     FROM catalog_items c
     LEFT JOIN catalog_imei ci ON ci.catalog_item_id = c.id
     WHERE c.workspace_id = ? AND c.active = 1 AND c.name LIKE ?
     GROUP BY c.id
     ORDER BY c.name ASC
     LIMIT 20`,
    [workspaceId, `%${query}%`],
  );
}

export async function getAvailableImeis(catalogItemId: string): Promise<CatalogImei[]> {
  return dbSelect<CatalogImei>(
    "SELECT * FROM catalog_imei WHERE catalog_item_id = ? AND sold_at IS NULL ORDER BY imei ASC",
    [catalogItemId],
  );
}

export async function getImeisForItem(catalogItemId: string): Promise<CatalogImei[]> {
  return dbSelect<CatalogImei>(
    "SELECT * FROM catalog_imei WHERE catalog_item_id = ? ORDER BY imei ASC",
    [catalogItemId],
  );
}

export async function addImeis(
  catalogItemId: string,
  imeis: string[],
): Promise<{ added: number }> {
  if (imeis.length === 0) return { added: 0 };
  const db = await getDb();
  let added = 0;
  try {
    await db.execute("BEGIN", []);
    for (const imei of imeis) {
      const result = await db.execute(
        "INSERT OR IGNORE INTO catalog_imei (id, catalog_item_id, imei) VALUES (?, ?, ?)",
        [crypto.randomUUID(), catalogItemId, imei],
      );
      added += result.rowsAffected;
    }
    await db.execute(
      `UPDATE catalog_items
       SET stock = (SELECT COUNT(*) FROM catalog_imei WHERE catalog_item_id = ? AND sold_at IS NULL)
       WHERE id = ?`,
      [catalogItemId, catalogItemId],
    );
    await db.execute("COMMIT", []);
  } catch (e) {
    await db.execute("ROLLBACK", []).catch(() => {});
    throw new Error(`Error al agregar IMEIs: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { added };
}

export async function deleteImei(imeiId: string): Promise<void> {
  const rows = await dbSelect<CatalogImei>(
    "SELECT * FROM catalog_imei WHERE id = ?",
    [imeiId],
  );
  const row = rows[0];
  if (!row) throw new Error("IMEI no encontrado");
  if (row.sold_at) throw new Error("No se puede eliminar un IMEI que ya fue vendido");

  const db = await getDb();
  try {
    await db.execute("BEGIN", []);
    await db.execute("DELETE FROM catalog_imei WHERE id = ?", [imeiId]);
    await db.execute(
      `UPDATE catalog_items
       SET stock = (SELECT COUNT(*) FROM catalog_imei WHERE catalog_item_id = ? AND sold_at IS NULL)
       WHERE id = ?`,
      [row.catalog_item_id, row.catalog_item_id],
    );
    await db.execute("COMMIT", []);
  } catch (e) {
    await db.execute("ROLLBACK", []).catch(() => {});
    throw new Error(`Error al eliminar IMEI: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function getWithUnitCount(workspaceId: string): Promise<CatalogItemWithImeis[]> {
  const rows = await dbSelect<CatalogItemWithImeis>(
    `SELECT ci.*,
       COUNT(CASE WHEN ci2.sold_at IS NULL THEN 1 END) as available_imeis,
       COUNT(ci2.id) as total_imeis
     FROM catalog_items ci
     LEFT JOIN catalog_imei ci2 ON ci2.catalog_item_id = ci.id
     WHERE ci.workspace_id = ? AND ci.active = 1
     GROUP BY ci.id
     ORDER BY ci.sort_order ASC, ci.name ASC`,
    [workspaceId],
  );
  for (const item of rows) {
    if (item.condition_details_json) {
      try { item.conditionDetails = JSON.parse(item.condition_details_json); } catch { /* ignore */ }
    }
  }
  return rows;
}

export async function getRecentSalesForProduct(
  workspaceId: string,
  catalogItemId: string,
  limit = 5,
): Promise<Array<{ sale_id: string; sale_date: string; customer_name: string | null; unit_price: number; quantity: number }>> {
  return dbSelect(
    `SELECT si.sale_id, s.sale_date, s.customer_name, si.unit_price, si.quantity
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.workspace_id = ? AND si.catalog_item_id = ?
     ORDER BY s.sale_date DESC
     LIMIT ?`,
    [workspaceId, catalogItemId, limit],
  );
}

export const catalogDb = {
  getAll,
  getWithUnitCount,
  getStockView,
  getInventorySummary,
  getRecentSalesForProduct,
  getAllImeis,
  getCategories,
  getSubcategories,
  create,
  update,
  softDelete,
  decrementStock,
  adjustStock,
  search,
  getAvailableImeis,
  getImeisForItem,
  addImeis,
  deleteImei,
};
