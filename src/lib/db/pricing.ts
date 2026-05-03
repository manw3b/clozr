/**
 * Capa de acceso a precios del catálogo y de unidades individuales.
 *
 * Lookup de precio al vender:
 *   1. ¿Hay precio en stock_item_prices(stock_item_id, customer_type_id)? → usar
 *   2. ¿Hay precio en catalog_prices(catalog_item_id, customer_type_id)? → usar
 *   3. Sin precio definido → null (vendedor lo ingresa manual)
 */
import { dbSelect, dbExecute } from "./index";
import type { CatalogPriceRow, StockItemPriceRow } from "./types";

/* ── Catalog item pricing ────────────────────────────────────────── */

export async function getCatalogPrices(
  catalogItemId: string,
): Promise<CatalogPriceRow[]> {
  try {
    return await dbSelect<CatalogPriceRow>(
      "SELECT * FROM catalog_prices WHERE catalog_item_id = ?",
      [catalogItemId],
    );
  } catch {
    return [];
  }
}

export async function setCatalogPrice(
  catalogItemId: string,
  customerTypeId: string,
  priceUsd: number,
): Promise<void> {
  const now = new Date().toISOString();
  await dbExecute(
    `INSERT INTO catalog_prices (catalog_item_id, customer_type_id, price_usd, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(catalog_item_id, customer_type_id) DO UPDATE SET
       price_usd = excluded.price_usd,
       updated_at = excluded.updated_at`,
    [catalogItemId, customerTypeId, priceUsd, now],
  );
}

export async function removeCatalogPrice(
  catalogItemId: string,
  customerTypeId: string,
): Promise<void> {
  await dbExecute(
    "DELETE FROM catalog_prices WHERE catalog_item_id = ? AND customer_type_id = ?",
    [catalogItemId, customerTypeId],
  );
}

export async function setCatalogCost(
  catalogItemId: string,
  costUsd: number,
): Promise<void> {
  await dbExecute(
    "UPDATE catalog_items SET cost_usd = ?, updated_at = ? WHERE id = ?",
    [costUsd, new Date().toISOString(), catalogItemId],
  );
}

/* ── Stock item pricing (overrides) ──────────────────────────────── */

export async function getStockItemPrices(
  stockItemId: string,
): Promise<StockItemPriceRow[]> {
  try {
    return await dbSelect<StockItemPriceRow>(
      "SELECT * FROM stock_item_prices WHERE stock_item_id = ?",
      [stockItemId],
    );
  } catch {
    return [];
  }
}

export async function setStockItemPrice(
  stockItemId: string,
  customerTypeId: string,
  priceUsd: number,
): Promise<void> {
  const now = new Date().toISOString();
  await dbExecute(
    `INSERT INTO stock_item_prices (stock_item_id, customer_type_id, price_usd, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(stock_item_id, customer_type_id) DO UPDATE SET
       price_usd = excluded.price_usd,
       updated_at = excluded.updated_at`,
    [stockItemId, customerTypeId, priceUsd, now],
  );
}

export async function setStockItemCost(
  stockItemId: string,
  costUsd: number | null,
): Promise<void> {
  await dbExecute("UPDATE stock_items SET cost_usd_override = ? WHERE id = ?", [costUsd, stockItemId]);
}

/* ── Resolver de precio (con fallback) ───────────────────────────── */

/**
 * Devuelve el precio aplicable para un (item, tipo de cliente).
 * Pasar `stockItemId` opcional para considerar overrides individuales.
 */
export async function resolvePrice(
  catalogItemId: string,
  customerTypeId: string,
  stockItemId?: string,
): Promise<{ priceUsd: number | null; source: "stock-override" | "catalog" | "none" }> {
  // 1. Stock override
  if (stockItemId) {
    const rows = await dbSelect<{ price_usd: number }>(
      `SELECT price_usd FROM stock_item_prices
       WHERE stock_item_id = ? AND customer_type_id = ? LIMIT 1`,
      [stockItemId, customerTypeId],
    ).catch(() => []);
    if (rows.length > 0) return { priceUsd: rows[0].price_usd, source: "stock-override" };
  }
  // 2. Catalog price
  const rows = await dbSelect<{ price_usd: number }>(
    `SELECT price_usd FROM catalog_prices
     WHERE catalog_item_id = ? AND customer_type_id = ? LIMIT 1`,
    [catalogItemId, customerTypeId],
  ).catch(() => []);
  if (rows.length > 0) return { priceUsd: rows[0].price_usd, source: "catalog" };
  return { priceUsd: null, source: "none" };
}

export const pricingDb = {
  getCatalogPrices,
  setCatalogPrice,
  removeCatalogPrice,
  setCatalogCost,
  getStockItemPrices,
  setStockItemPrice,
  setStockItemCost,
  resolvePrice,
};
