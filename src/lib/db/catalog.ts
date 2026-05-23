import { dbSelect, dbExecute } from "./index";
import { useCloudAuthStore } from "../../store/cloudAuthStore";
import { catalogApi, decrementCatalogStock } from "../cloudAuth";
import { log } from "../logger";
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

/** Dispatcher cloud para catálogo (R5 extended). Solo cuando isCloudModeFor
 *  ("catalog") es true. */
function cloudCtx(): { jwt: string; wsId: string } | null {
  const s = useCloudAuthStore.getState();
  if (!s.isCloudModeFor("catalog")) return null;
  if (!s.jwt || !s.activeWorkspaceId) return null;
  return { jwt: s.jwt, wsId: s.activeWorkspaceId };
}

/** Mapea cloud row → CatalogItemWithImeis local. IMEIs vienen en 0/0
 *  porque no las traemos del cloud todavía. Si necesitan, pide endpoint
 *  específico de catalog_imei. */
function cloudToLocal(c: Record<string, unknown>, localWid: string): CatalogItemWithImeis {
  return {
    id: String(c.id),
    workspace_id: localWid,
    name: String(c.name ?? ""),
    category: (c.category as string | null) ?? null,
    subcategory: (c.subcategory as string | null) ?? null,
    price: (c.price as number | null) ?? null,
    currency: (c.currency as string | null) ?? "ARS",
    track_stock: Number(c.track_stock ?? 0),
    stock: Number(c.stock ?? 0),
    stock_min: Number(c.stock_min ?? 0),
    active: Number(c.active ?? 1),
    sort_order: Number(c.sort_order ?? 0),
    custom_fields_json: (c.custom_fields_json as string | null) ?? null,
    image_path: (c.image_path as string | null) ?? null,
    condition: (c.condition as string | null) ?? "new",
    condition_details_json: (c.condition_details_json as string | null) ?? null,
    created_at: String(c.created_at ?? ""),
    available_imeis: 0,
    total_imeis: 0,
  } as CatalogItemWithImeis;
}

export async function getAll(workspaceId: string): Promise<CatalogItemWithImeis[]> {
  const ctx = cloudCtx();
  if (ctx) {
    const res = await catalogApi.list(ctx.jwt, ctx.wsId);
    if (res.ok) {
      return (res.data.items as unknown as Array<Record<string, unknown>>)
        .filter((c) => Number(c.active ?? 1) === 1)
        .map((c) => cloudToLocal(c, workspaceId));
    }
    log.warn("getAll cloud falló, fallback local", { scope: "catalogDb", data: { error: res.error } });
  }
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

  const ctx = cloudCtx();
  if (ctx) {
    const res = await catalogApi.create(ctx.jwt, ctx.wsId, {
      id, name: data.name,
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
    } as never);
    if (!res.ok) throw new Error(`No se pudo crear item de catálogo en la nube: ${res.error}`);
    return {
      id, workspace_id: workspaceId,
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

  const ctx = cloudCtx();
  if (ctx) {
    const res = await catalogApi.update(ctx.jwt, ctx.wsId, id, mapped as never);
    if (!res.ok) throw new Error(`No se pudo actualizar catálogo en la nube: ${res.error}`);
    return;
  }

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
  const ctx = cloudCtx();
  if (ctx) {
    // En cloud "soft delete" lo hacemos seteando active=0 (no usamos
    // deleted_at acá para mantener compat con queries que filtran por active=1).
    const res = await catalogApi.update(ctx.jwt, ctx.wsId, id, { active: 0 } as never);
    if (!res.ok) throw new Error(`No se pudo desactivar catálogo en la nube: ${res.error}`);
    return;
  }
  await dbExecute(
    "UPDATE catalog_items SET active = 0 WHERE workspace_id = ? AND id = ?",
    [workspaceId, id],
  );
}

export async function decrementStock(id: string, quantity: number): Promise<void> {
  const ctx = cloudCtx();
  if (ctx) {
    // C1: endpoint atómico backend — `UPDATE ... MAX(0, stock - ?)` en
    // una sola query, sin race condition. Antes hacíamos read+calc+write,
    // que con 2 vendedores creando ventas del mismo producto al mismo
    // tiempo subdescontaba en 1. El endpoint sólo afecta filas con
    // track_stock=1, así que productos sin tracking siguen igual.
    const res = await decrementCatalogStock(ctx.jwt, ctx.wsId, id, quantity);
    if (!res.ok) {
      log.warn("decrementStock cloud falló", { scope: "catalogDb", data: { error: res.error } });
    }
    return;
  }
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
  // Sin BEGIN/COMMIT manuales: tauri-plugin-sql ya envuelve cada execute en su
  // propia tx. BEGIN crudo + INSERTs + COMMIT genera "database is locked" o
  // "cannot commit - no transaction is active" porque el pool reabre conexión
  // entre statements.
  let added = 0;
  try {
    for (const imei of imeis) {
      const result = await dbExecute(
        "INSERT OR IGNORE INTO catalog_imei (id, catalog_item_id, imei) VALUES (?, ?, ?)",
        [crypto.randomUUID(), catalogItemId, imei],
      );
      added += result.rowsAffected;
    }
    await dbExecute(
      `UPDATE catalog_items
       SET stock = (SELECT COUNT(*) FROM catalog_imei WHERE catalog_item_id = ? AND sold_at IS NULL)
       WHERE id = ?`,
      [catalogItemId, catalogItemId],
    );
  } catch (e) {
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

  try {
    await dbExecute("DELETE FROM catalog_imei WHERE id = ?", [imeiId]);
    await dbExecute(
      `UPDATE catalog_items
       SET stock = (SELECT COUNT(*) FROM catalog_imei WHERE catalog_item_id = ? AND sold_at IS NULL)
       WHERE id = ?`,
      [row.catalog_item_id, row.catalog_item_id],
    );
  } catch (e) {
    throw new Error(`Error al eliminar IMEI: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function updateImei(imeiId: string, newImei: string): Promise<void> {
  const trimmed = newImei.trim();
  if (trimmed.length < 4) throw new Error("IMEI demasiado corto");
  const rows = await dbSelect<CatalogImei>("SELECT * FROM catalog_imei WHERE id = ?", [imeiId]);
  const row = rows[0];
  if (!row) throw new Error("IMEI no encontrado");
  if (row.sold_at) throw new Error("No se puede editar un IMEI que ya fue vendido");
  await dbExecute("UPDATE catalog_imei SET imei = ? WHERE id = ?", [trimmed, imeiId]);
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
  updateImei,
};
