import { dbSelect, dbExecute } from "./index";
import type { ProductTemplate } from "./types";

export async function search(query: string): Promise<ProductTemplate[]> {
  const like = `%${query}%`;
  return dbSelect<ProductTemplate>(
    `SELECT * FROM product_templates
     WHERE name LIKE ? OR color LIKE ? OR storage LIKE ?
     ORDER BY brand, year DESC, name
     LIMIT 20`,
    [like, like, like],
  );
}

export async function getByCategory(category: string): Promise<ProductTemplate[]> {
  return dbSelect<ProductTemplate>(
    "SELECT * FROM product_templates WHERE category = ? ORDER BY year DESC, name",
    [category],
  );
}

// tuple: [id, brand, category, subcategory, name, storage, color, screen_size, year, condition]
type TemplateRow = [string, string, string, string, string, string | null, string | null, string | null, number, string];

const TEMPLATES: TemplateRow[] = [
  // ── iPhone 17 ─────────────────────────────────────────────────
  ["tpl-iph17-256-negro","Apple","iPhone","iPhone 17","iPhone 17 256GB Black","256GB","Black","6.3\" OLED",2025,"new"],
  ["tpl-iph17-256-blanco","Apple","iPhone","iPhone 17","iPhone 17 256GB White","256GB","White","6.3\" OLED",2025,"new"],
  ["tpl-iph17-256-azulneblina","Apple","iPhone","iPhone 17","iPhone 17 256GB Mist Blue","256GB","Mist Blue","6.3\" OLED",2025,"new"],
  ["tpl-iph17-256-salvia","Apple","iPhone","iPhone 17","iPhone 17 256GB Sage","256GB","Sage","6.3\" OLED",2025,"new"],
  ["tpl-iph17-256-lavanda","Apple","iPhone","iPhone 17","iPhone 17 256GB Lavender","256GB","Lavender","6.3\" OLED",2025,"new"],
  ["tpl-iph17-512-negro","Apple","iPhone","iPhone 17","iPhone 17 512GB Black","512GB","Black","6.3\" OLED",2025,"new"],
  ["tpl-iph17-512-blanco","Apple","iPhone","iPhone 17","iPhone 17 512GB White","512GB","White","6.3\" OLED",2025,"new"],
  ["tpl-iph17-512-azulneblina","Apple","iPhone","iPhone 17","iPhone 17 512GB Mist Blue","512GB","Mist Blue","6.3\" OLED",2025,"new"],
  ["tpl-iph17-512-salvia","Apple","iPhone","iPhone 17","iPhone 17 512GB Sage","512GB","Sage","6.3\" OLED",2025,"new"],
  ["tpl-iph17-512-lavanda","Apple","iPhone","iPhone 17","iPhone 17 512GB Lavender","512GB","Lavender","6.3\" OLED",2025,"new"],
  // ── iPhone 17 Air ──────────────────────────────────────────────
  ["tpl-iph17air-256-negro","Apple","iPhone","iPhone 17 Air","iPhone 17 Air 256GB Space Black","256GB","Space Black","6.5\" OLED",2025,"new"],
  ["tpl-iph17air-256-blanco","Apple","iPhone","iPhone 17 Air","iPhone 17 Air 256GB Cloud White","256GB","Cloud White","6.5\" OLED",2025,"new"],
  ["tpl-iph17air-256-oro","Apple","iPhone","iPhone 17 Air","iPhone 17 Air 256GB Light Gold","256GB","Light Gold","6.5\" OLED",2025,"new"],
  ["tpl-iph17air-256-azulcielo","Apple","iPhone","iPhone 17 Air","iPhone 17 Air 256GB Sky Blue","256GB","Sky Blue","6.5\" OLED",2025,"new"],
  ["tpl-iph17air-512-negro","Apple","iPhone","iPhone 17 Air","iPhone 17 Air 512GB Space Black","512GB","Space Black","6.5\" OLED",2025,"new"],
  ["tpl-iph17air-512-blanco","Apple","iPhone","iPhone 17 Air","iPhone 17 Air 512GB Cloud White","512GB","Cloud White","6.5\" OLED",2025,"new"],
  ["tpl-iph17air-1tb-negro","Apple","iPhone","iPhone 17 Air","iPhone 17 Air 1TB Space Black","1TB","Space Black","6.5\" OLED",2025,"new"],
  // ── iPhone 17 Pro ──────────────────────────────────────────────
  ["tpl-iph17pro-256-plata","Apple","iPhone","iPhone 17 Pro","iPhone 17 Pro 256GB Silver","256GB","Silver","6.3\" OLED",2025,"new"],
  ["tpl-iph17pro-256-naranja","Apple","iPhone","iPhone 17 Pro","iPhone 17 Pro 256GB Cosmic Orange","256GB","Cosmic Orange","6.3\" OLED",2025,"new"],
  ["tpl-iph17pro-256-azul","Apple","iPhone","iPhone 17 Pro","iPhone 17 Pro 256GB Deep Blue","256GB","Deep Blue","6.3\" OLED",2025,"new"],
  ["tpl-iph17pro-512-plata","Apple","iPhone","iPhone 17 Pro","iPhone 17 Pro 512GB Silver","512GB","Silver","6.3\" OLED",2025,"new"],
  ["tpl-iph17pro-512-naranja","Apple","iPhone","iPhone 17 Pro","iPhone 17 Pro 512GB Cosmic Orange","512GB","Cosmic Orange","6.3\" OLED",2025,"new"],
  ["tpl-iph17pro-512-azul","Apple","iPhone","iPhone 17 Pro","iPhone 17 Pro 512GB Deep Blue","512GB","Deep Blue","6.3\" OLED",2025,"new"],
  ["tpl-iph17pro-1tb-plata","Apple","iPhone","iPhone 17 Pro","iPhone 17 Pro 1TB Silver","1TB","Silver","6.3\" OLED",2025,"new"],
  // ── iPhone 17 Pro Max ──────────────────────────────────────────
  ["tpl-iph17promax-256-plata","Apple","iPhone","iPhone 17 Pro Max","iPhone 17 Pro Max 256GB Silver","256GB","Silver","6.9\" OLED",2025,"new"],
  ["tpl-iph17promax-256-naranja","Apple","iPhone","iPhone 17 Pro Max","iPhone 17 Pro Max 256GB Cosmic Orange","256GB","Cosmic Orange","6.9\" OLED",2025,"new"],
  ["tpl-iph17promax-256-azul","Apple","iPhone","iPhone 17 Pro Max","iPhone 17 Pro Max 256GB Deep Blue","256GB","Deep Blue","6.9\" OLED",2025,"new"],
  ["tpl-iph17promax-512-plata","Apple","iPhone","iPhone 17 Pro Max","iPhone 17 Pro Max 512GB Silver","512GB","Silver","6.9\" OLED",2025,"new"],
  ["tpl-iph17promax-1tb-plata","Apple","iPhone","iPhone 17 Pro Max","iPhone 17 Pro Max 1TB Silver","1TB","Silver","6.9\" OLED",2025,"new"],
  ["tpl-iph17promax-2tb-plata","Apple","iPhone","iPhone 17 Pro Max","iPhone 17 Pro Max 2TB Silver","2TB","Silver","6.9\" OLED",2025,"new"],
  // ── iPhone 17e ─────────────────────────────────────────────────
  ["tpl-iph17e-256-negro","Apple","iPhone","iPhone 17e","iPhone 17e 256GB Black","256GB","Black","6.3\" OLED",2025,"new"],
  ["tpl-iph17e-256-blanco","Apple","iPhone","iPhone 17e","iPhone 17e 256GB White","256GB","White","6.3\" OLED",2025,"new"],
  ["tpl-iph17e-256-rosa","Apple","iPhone","iPhone 17e","iPhone 17e 256GB Pale Pink","256GB","Pale Pink","6.3\" OLED",2025,"new"],
  ["tpl-iph17e-512-negro","Apple","iPhone","iPhone 17e","iPhone 17e 512GB Black","512GB","Black","6.3\" OLED",2025,"new"],
  // ── iPhone 16 ──────────────────────────────────────────────────
  ["tpl-iph16-128-negro","Apple","iPhone","iPhone 16","iPhone 16 128GB Black","128GB","Black","6.1\" OLED",2024,"new"],
  ["tpl-iph16-128-blanco","Apple","iPhone","iPhone 16","iPhone 16 128GB White","128GB","White","6.1\" OLED",2024,"new"],
  ["tpl-iph16-128-rosa","Apple","iPhone","iPhone 16","iPhone 16 128GB Pink","128GB","Pink","6.1\" OLED",2024,"new"],
  ["tpl-iph16-128-azul","Apple","iPhone","iPhone 16","iPhone 16 128GB Teal","128GB","Teal","6.1\" OLED",2024,"new"],
  ["tpl-iph16-128-ultramarino","Apple","iPhone","iPhone 16","iPhone 16 128GB Ultramarine","128GB","Ultramarine","6.1\" OLED",2024,"new"],
  // ── iPhone 16 Plus ─────────────────────────────────────────────
  ["tpl-iph16plus-128-negro","Apple","iPhone","iPhone 16 Plus","iPhone 16 Plus 128GB Black","128GB","Black","6.7\" OLED",2024,"new"],
  ["tpl-iph16plus-128-blanco","Apple","iPhone","iPhone 16 Plus","iPhone 16 Plus 128GB White","128GB","White","6.7\" OLED",2024,"new"],
  ["tpl-iph16plus-256-negro","Apple","iPhone","iPhone 16 Plus","iPhone 16 Plus 256GB Black","256GB","Black","6.7\" OLED",2024,"new"],
  ["tpl-iph16plus-256-rosa","Apple","iPhone","iPhone 16 Plus","iPhone 16 Plus 256GB Pink","256GB","Pink","6.7\" OLED",2024,"new"],
  // ── iPhone 16 Pro ──────────────────────────────────────────────
  ["tpl-iph16pro-256-tnegro","Apple","iPhone","iPhone 16 Pro","iPhone 16 Pro 256GB Black Titanium","256GB","Black Titanium","6.3\" OLED",2024,"new"],
  ["tpl-iph16pro-256-tnatural","Apple","iPhone","iPhone 16 Pro","iPhone 16 Pro 256GB Natural Titanium","256GB","Natural Titanium","6.3\" OLED",2024,"new"],
  ["tpl-iph16pro-256-tblanco","Apple","iPhone","iPhone 16 Pro","iPhone 16 Pro 256GB White Titanium","256GB","White Titanium","6.3\" OLED",2024,"new"],
  ["tpl-iph16pro-256-tdesierto","Apple","iPhone","iPhone 16 Pro","iPhone 16 Pro 256GB Desert Titanium","256GB","Desert Titanium","6.3\" OLED",2024,"new"],
  ["tpl-iph16pro-512-tnegro","Apple","iPhone","iPhone 16 Pro","iPhone 16 Pro 512GB Black Titanium","512GB","Black Titanium","6.3\" OLED",2024,"new"],
  ["tpl-iph16pro-512-tnatural","Apple","iPhone","iPhone 16 Pro","iPhone 16 Pro 512GB Natural Titanium","512GB","Natural Titanium","6.3\" OLED",2024,"new"],
  ["tpl-iph16pro-1tb-tnegro","Apple","iPhone","iPhone 16 Pro","iPhone 16 Pro 1TB Black Titanium","1TB","Black Titanium","6.3\" OLED",2024,"new"],
  // ── iPhone 16 Pro Max ──────────────────────────────────────────
  ["tpl-iph16promax-256-tnegro","Apple","iPhone","iPhone 16 Pro Max","iPhone 16 Pro Max 256GB Black Titanium","256GB","Black Titanium","6.9\" OLED",2024,"new"],
  ["tpl-iph16promax-256-tnatural","Apple","iPhone","iPhone 16 Pro Max","iPhone 16 Pro Max 256GB Natural Titanium","256GB","Natural Titanium","6.9\" OLED",2024,"new"],
  ["tpl-iph16promax-512-tnegro","Apple","iPhone","iPhone 16 Pro Max","iPhone 16 Pro Max 512GB Black Titanium","512GB","Black Titanium","6.9\" OLED",2024,"new"],
  ["tpl-iph16promax-1tb-tnatural","Apple","iPhone","iPhone 16 Pro Max","iPhone 16 Pro Max 1TB Natural Titanium","1TB","Natural Titanium","6.9\" OLED",2024,"new"],
  ["tpl-iph16promax-2tb-tblanco","Apple","iPhone","iPhone 16 Pro Max","iPhone 16 Pro Max 2TB White Titanium","2TB","White Titanium","6.9\" OLED",2024,"new"],
  // ── iPhone 15 ──────────────────────────────────────────────────
  ["tpl-iph15-128-negro","Apple","iPhone","iPhone 15","iPhone 15 128GB Black","128GB","Black","6.1\" OLED",2023,"new"],
  ["tpl-iph15-128-blanco","Apple","iPhone","iPhone 15","iPhone 15 128GB White","128GB","White","6.1\" OLED",2023,"new"],
  ["tpl-iph15-256-negro","Apple","iPhone","iPhone 15","iPhone 15 256GB Black","256GB","Black","6.1\" OLED",2023,"new"],
  ["tpl-iph15plus-128-negro","Apple","iPhone","iPhone 15 Plus","iPhone 15 Plus 128GB Black","128GB","Black","6.7\" OLED",2023,"new"],
  ["tpl-iph15pro-128-tnatural","Apple","iPhone","iPhone 15 Pro","iPhone 15 Pro 128GB Natural Titanium","128GB","Natural Titanium","6.1\" OLED",2023,"new"],
  ["tpl-iph15pro-256-tnegro","Apple","iPhone","iPhone 15 Pro","iPhone 15 Pro 256GB Black Titanium","256GB","Black Titanium","6.1\" OLED",2023,"new"],
  ["tpl-iph15promax-256-tnatural","Apple","iPhone","iPhone 15 Pro Max","iPhone 15 Pro Max 256GB Natural Titanium","256GB","Natural Titanium","6.7\" OLED",2023,"new"],
  ["tpl-iph15promax-512-tnegro","Apple","iPhone","iPhone 15 Pro Max","iPhone 15 Pro Max 512GB Black Titanium","512GB","Black Titanium","6.7\" OLED",2023,"new"],
  // ── iPhone 14 ──────────────────────────────────────────────────
  ["tpl-iph14-128-negro","Apple","iPhone","iPhone 14","iPhone 14 128GB Midnight","128GB","Midnight","6.1\" OLED",2022,"new"],
  ["tpl-iph14-128-blanco","Apple","iPhone","iPhone 14","iPhone 14 128GB Starlight","128GB","Starlight","6.1\" OLED",2022,"new"],
  ["tpl-iph14-128-azul","Apple","iPhone","iPhone 14","iPhone 14 128GB Blue","128GB","Blue","6.1\" OLED",2022,"new"],
  ["tpl-iph14pro-128-negro","Apple","iPhone","iPhone 14 Pro","iPhone 14 Pro 128GB Space Black","128GB","Space Black","6.1\" OLED",2022,"new"],
  ["tpl-iph14pro-256-plata","Apple","iPhone","iPhone 14 Pro","iPhone 14 Pro 256GB Silver","256GB","Silver","6.1\" OLED",2022,"new"],
  ["tpl-iph14promax-128-negro","Apple","iPhone","iPhone 14 Pro Max","iPhone 14 Pro Max 128GB Space Black","128GB","Space Black","6.7\" OLED",2022,"new"],
  // ── iPhone 13 ──────────────────────────────────────────────────
  ["tpl-iph13-128-medianoche","Apple","iPhone","iPhone 13","iPhone 13 128GB Midnight","128GB","Midnight","6.1\" OLED",2021,"new"],
  ["tpl-iph13-128-blanco","Apple","iPhone","iPhone 13","iPhone 13 128GB Starlight","128GB","Starlight","6.1\" OLED",2021,"new"],
  ["tpl-iph13-128-rosa","Apple","iPhone","iPhone 13","iPhone 13 128GB Pink","128GB","Pink","6.1\" OLED",2021,"new"],
  ["tpl-iph13-128-azul","Apple","iPhone","iPhone 13","iPhone 13 128GB Blue","128GB","Blue","6.1\" OLED",2021,"new"],
  ["tpl-iph13-128-verde","Apple","iPhone","iPhone 13","iPhone 13 128GB Green","128GB","Green","6.1\" OLED",2021,"new"],
  ["tpl-iph13-128-red","Apple","iPhone","iPhone 13","iPhone 13 128GB (PRODUCT)RED","128GB","(PRODUCT)RED","6.1\" OLED",2021,"new"],
  ["tpl-iph13-256-medianoche","Apple","iPhone","iPhone 13","iPhone 13 256GB Midnight","256GB","Midnight","6.1\" OLED",2021,"new"],
  ["tpl-iph13-256-blanco","Apple","iPhone","iPhone 13","iPhone 13 256GB Starlight","256GB","Starlight","6.1\" OLED",2021,"new"],
  ["tpl-iph13-512-medianoche","Apple","iPhone","iPhone 13","iPhone 13 512GB Midnight","512GB","Midnight","6.1\" OLED",2021,"new"],
  // ── iPhone 13 Pro ──────────────────────────────────────────────
  ["tpl-iph13pro-128-oro","Apple","iPhone","iPhone 13 Pro","iPhone 13 Pro 128GB Gold","128GB","Gold","6.1\" OLED",2021,"new"],
  ["tpl-iph13pro-256-grafito","Apple","iPhone","iPhone 13 Pro","iPhone 13 Pro 256GB Graphite","256GB","Graphite","6.1\" OLED",2021,"new"],
  ["tpl-iph13pro-128-plata","Apple","iPhone","iPhone 13 Pro","iPhone 13 Pro 128GB Silver","128GB","Silver","6.1\" OLED",2021,"new"],
  ["tpl-iph13pro-128-verde","Apple","iPhone","iPhone 13 Pro","iPhone 13 Pro 128GB Alpine Green","128GB","Alpine Green","6.1\" OLED",2021,"new"],
  ["tpl-iph13pro-256-oro","Apple","iPhone","iPhone 13 Pro","iPhone 13 Pro 256GB Gold","256GB","Gold","6.1\" OLED",2021,"new"],
  ["tpl-iph13pro-512-grafito","Apple","iPhone","iPhone 13 Pro","iPhone 13 Pro 512GB Graphite","512GB","Graphite","6.1\" OLED",2021,"new"],
  ["tpl-iph13pro-1tb-plata","Apple","iPhone","iPhone 13 Pro","iPhone 13 Pro 1TB Silver","1TB","Silver","6.1\" OLED",2021,"new"],
  // ── iPhone 13 Pro Max ──────────────────────────────────────────
  ["tpl-iph13promax-256-plata","Apple","iPhone","iPhone 13 Pro Max","iPhone 13 Pro Max 256GB Silver","256GB","Silver","6.7\" OLED",2021,"new"],
  ["tpl-iph13promax-128-grafito","Apple","iPhone","iPhone 13 Pro Max","iPhone 13 Pro Max 128GB Graphite","128GB","Graphite","6.7\" OLED",2021,"new"],
  ["tpl-iph13promax-128-plata","Apple","iPhone","iPhone 13 Pro Max","iPhone 13 Pro Max 128GB Silver","128GB","Silver","6.7\" OLED",2021,"new"],
  ["tpl-iph13promax-128-oro","Apple","iPhone","iPhone 13 Pro Max","iPhone 13 Pro Max 128GB Gold","128GB","Gold","6.7\" OLED",2021,"new"],
  ["tpl-iph13promax-128-verde","Apple","iPhone","iPhone 13 Pro Max","iPhone 13 Pro Max 128GB Alpine Green","128GB","Alpine Green","6.7\" OLED",2021,"new"],
  ["tpl-iph13promax-256-grafito","Apple","iPhone","iPhone 13 Pro Max","iPhone 13 Pro Max 256GB Graphite","256GB","Graphite","6.7\" OLED",2021,"new"],
  ["tpl-iph13promax-512-plata","Apple","iPhone","iPhone 13 Pro Max","iPhone 13 Pro Max 512GB Silver","512GB","Silver","6.7\" OLED",2021,"new"],
  ["tpl-iph13promax-1tb-oro","Apple","iPhone","iPhone 13 Pro Max","iPhone 13 Pro Max 1TB Gold","1TB","Gold","6.7\" OLED",2021,"new"],
  // ── iPhone 13 mini ─────────────────────────────────────────────
  ["tpl-iph13mini-128-medianoche","Apple","iPhone","iPhone 13 mini","iPhone 13 mini 128GB Midnight","128GB","Midnight","5.4\" OLED",2021,"new"],
  ["tpl-iph13mini-128-blanco","Apple","iPhone","iPhone 13 mini","iPhone 13 mini 128GB Starlight","128GB","Starlight","5.4\" OLED",2021,"new"],
  ["tpl-iph13mini-128-rosa","Apple","iPhone","iPhone 13 mini","iPhone 13 mini 128GB Pink","128GB","Pink","5.4\" OLED",2021,"new"],
  ["tpl-iph13mini-128-azul","Apple","iPhone","iPhone 13 mini","iPhone 13 mini 128GB Blue","128GB","Blue","5.4\" OLED",2021,"new"],
  ["tpl-iph13mini-128-verde","Apple","iPhone","iPhone 13 mini","iPhone 13 mini 128GB Green","128GB","Green","5.4\" OLED",2021,"new"],
  ["tpl-iph13mini-128-red","Apple","iPhone","iPhone 13 mini","iPhone 13 mini 128GB (PRODUCT)RED","128GB","(PRODUCT)RED","5.4\" OLED",2021,"new"],
  ["tpl-iph13mini-256-medianoche","Apple","iPhone","iPhone 13 mini","iPhone 13 mini 256GB Midnight","256GB","Midnight","5.4\" OLED",2021,"new"],
  ["tpl-iph13mini-512-medianoche","Apple","iPhone","iPhone 13 mini","iPhone 13 mini 512GB Midnight","512GB","Midnight","5.4\" OLED",2021,"new"],
  // ── iPhone 12 ──────────────────────────────────────────────────
  ["tpl-iph12-64-negro","Apple","iPhone","iPhone 12","iPhone 12 64GB Black","64GB","Black","6.1\" OLED",2020,"new"],
  ["tpl-iph12-64-blanco","Apple","iPhone","iPhone 12","iPhone 12 64GB White","64GB","White","6.1\" OLED",2020,"new"],
  ["tpl-iph12-64-azul","Apple","iPhone","iPhone 12","iPhone 12 64GB Blue","64GB","Blue","6.1\" OLED",2020,"new"],
  ["tpl-iph12-64-verde","Apple","iPhone","iPhone 12","iPhone 12 64GB Green","64GB","Green","6.1\" OLED",2020,"new"],
  ["tpl-iph12-64-red","Apple","iPhone","iPhone 12","iPhone 12 64GB (PRODUCT)RED","64GB","(PRODUCT)RED","6.1\" OLED",2020,"new"],
  ["tpl-iph12-128-negro","Apple","iPhone","iPhone 12","iPhone 12 128GB Black","128GB","Black","6.1\" OLED",2020,"new"],
  ["tpl-iph12-128-blanco","Apple","iPhone","iPhone 12","iPhone 12 128GB White","128GB","White","6.1\" OLED",2020,"new"],
  ["tpl-iph12-128-azul","Apple","iPhone","iPhone 12","iPhone 12 128GB Blue","128GB","Blue","6.1\" OLED",2020,"new"],
  ["tpl-iph12-128-verde","Apple","iPhone","iPhone 12","iPhone 12 128GB Green","128GB","Green","6.1\" OLED",2020,"new"],
  ["tpl-iph12-128-red","Apple","iPhone","iPhone 12","iPhone 12 128GB (PRODUCT)RED","128GB","(PRODUCT)RED","6.1\" OLED",2020,"new"],
  ["tpl-iph12-256-negro","Apple","iPhone","iPhone 12","iPhone 12 256GB Black","256GB","Black","6.1\" OLED",2020,"new"],
  // ── iPhone 12 mini ─────────────────────────────────────────────
  ["tpl-iph12mini-64-negro","Apple","iPhone","iPhone 12 mini","iPhone 12 mini 64GB Black","64GB","Black","5.4\" OLED",2020,"new"],
  ["tpl-iph12mini-64-blanco","Apple","iPhone","iPhone 12 mini","iPhone 12 mini 64GB White","64GB","White","5.4\" OLED",2020,"new"],
  ["tpl-iph12mini-64-azul","Apple","iPhone","iPhone 12 mini","iPhone 12 mini 64GB Blue","64GB","Blue","5.4\" OLED",2020,"new"],
  ["tpl-iph12mini-64-verde","Apple","iPhone","iPhone 12 mini","iPhone 12 mini 64GB Green","64GB","Green","5.4\" OLED",2020,"new"],
  ["tpl-iph12mini-64-red","Apple","iPhone","iPhone 12 mini","iPhone 12 mini 64GB (PRODUCT)RED","64GB","(PRODUCT)RED","5.4\" OLED",2020,"new"],
  ["tpl-iph12mini-128-negro","Apple","iPhone","iPhone 12 mini","iPhone 12 mini 128GB Black","128GB","Black","5.4\" OLED",2020,"new"],
  ["tpl-iph12mini-256-blanco","Apple","iPhone","iPhone 12 mini","iPhone 12 mini 256GB White","256GB","White","5.4\" OLED",2020,"new"],
  // ── iPhone 12 Pro ──────────────────────────────────────────────
  ["tpl-iph12pro-128-plata","Apple","iPhone","iPhone 12 Pro","iPhone 12 Pro 128GB Silver","128GB","Silver","6.1\" OLED",2020,"new"],
  ["tpl-iph12pro-128-grafito","Apple","iPhone","iPhone 12 Pro","iPhone 12 Pro 128GB Graphite","128GB","Graphite","6.1\" OLED",2020,"new"],
  ["tpl-iph12pro-128-oro","Apple","iPhone","iPhone 12 Pro","iPhone 12 Pro 128GB Gold","128GB","Gold","6.1\" OLED",2020,"new"],
  ["tpl-iph12pro-128-azulpacifico","Apple","iPhone","iPhone 12 Pro","iPhone 12 Pro 128GB Pacific Blue","128GB","Pacific Blue","6.1\" OLED",2020,"new"],
  ["tpl-iph12pro-256-plata","Apple","iPhone","iPhone 12 Pro","iPhone 12 Pro 256GB Silver","256GB","Silver","6.1\" OLED",2020,"new"],
  ["tpl-iph12pro-256-grafito","Apple","iPhone","iPhone 12 Pro","iPhone 12 Pro 256GB Graphite","256GB","Graphite","6.1\" OLED",2020,"new"],
  ["tpl-iph12pro-512-azulpacifico","Apple","iPhone","iPhone 12 Pro","iPhone 12 Pro 512GB Pacific Blue","512GB","Pacific Blue","6.1\" OLED",2020,"new"],
  // ── iPhone 12 Pro Max ──────────────────────────────────────────
  ["tpl-iph12promax-128-plata","Apple","iPhone","iPhone 12 Pro Max","iPhone 12 Pro Max 128GB Silver","128GB","Silver","6.7\" OLED",2020,"new"],
  ["tpl-iph12promax-128-grafito","Apple","iPhone","iPhone 12 Pro Max","iPhone 12 Pro Max 128GB Graphite","128GB","Graphite","6.7\" OLED",2020,"new"],
  ["tpl-iph12promax-128-oro","Apple","iPhone","iPhone 12 Pro Max","iPhone 12 Pro Max 128GB Gold","128GB","Gold","6.7\" OLED",2020,"new"],
  ["tpl-iph12promax-128-azulpacifico","Apple","iPhone","iPhone 12 Pro Max","iPhone 12 Pro Max 128GB Pacific Blue","128GB","Pacific Blue","6.7\" OLED",2020,"new"],
  ["tpl-iph12promax-256-plata","Apple","iPhone","iPhone 12 Pro Max","iPhone 12 Pro Max 256GB Silver","256GB","Silver","6.7\" OLED",2020,"new"],
  ["tpl-iph12promax-512-grafito","Apple","iPhone","iPhone 12 Pro Max","iPhone 12 Pro Max 512GB Graphite","512GB","Graphite","6.7\" OLED",2020,"new"],
  // ── iPhone 11 ──────────────────────────────────────────────────
  ["tpl-iph11-64-negro","Apple","iPhone","iPhone 11","iPhone 11 64GB Black","64GB","Black","6.1\" LCD",2019,"new"],
  ["tpl-iph11-64-blanco","Apple","iPhone","iPhone 11","iPhone 11 64GB White","64GB","White","6.1\" LCD",2019,"new"],
  ["tpl-iph11-64-verde","Apple","iPhone","iPhone 11","iPhone 11 64GB Green","64GB","Green","6.1\" LCD",2019,"new"],
  ["tpl-iph11-64-amarillo","Apple","iPhone","iPhone 11","iPhone 11 64GB Yellow","64GB","Yellow","6.1\" LCD",2019,"new"],
  ["tpl-iph11-64-morado","Apple","iPhone","iPhone 11","iPhone 11 64GB Purple","64GB","Purple","6.1\" LCD",2019,"new"],
  ["tpl-iph11-64-red","Apple","iPhone","iPhone 11","iPhone 11 64GB (PRODUCT)RED","64GB","(PRODUCT)RED","6.1\" LCD",2019,"new"],
  ["tpl-iph11-128-negro","Apple","iPhone","iPhone 11","iPhone 11 128GB Black","128GB","Black","6.1\" LCD",2019,"new"],
  ["tpl-iph11-128-blanco","Apple","iPhone","iPhone 11","iPhone 11 128GB White","128GB","White","6.1\" LCD",2019,"new"],
  ["tpl-iph11-256-negro","Apple","iPhone","iPhone 11","iPhone 11 256GB Black","256GB","Black","6.1\" LCD",2019,"new"],
  // ── iPhone 11 Pro ──────────────────────────────────────────────
  ["tpl-iph11pro-64-gris","Apple","iPhone","iPhone 11 Pro","iPhone 11 Pro 64GB Space Gray","64GB","Space Gray","5.8\" OLED",2019,"new"],
  ["tpl-iph11pro-64-plata","Apple","iPhone","iPhone 11 Pro","iPhone 11 Pro 64GB Silver","64GB","Silver","5.8\" OLED",2019,"new"],
  ["tpl-iph11pro-64-oro","Apple","iPhone","iPhone 11 Pro","iPhone 11 Pro 64GB Gold","64GB","Gold","5.8\" OLED",2019,"new"],
  ["tpl-iph11pro-64-verde","Apple","iPhone","iPhone 11 Pro","iPhone 11 Pro 64GB Midnight Green","64GB","Midnight Green","5.8\" OLED",2019,"new"],
  ["tpl-iph11pro-256-gris","Apple","iPhone","iPhone 11 Pro","iPhone 11 Pro 256GB Space Gray","256GB","Space Gray","5.8\" OLED",2019,"new"],
  ["tpl-iph11pro-512-plata","Apple","iPhone","iPhone 11 Pro","iPhone 11 Pro 512GB Silver","512GB","Silver","5.8\" OLED",2019,"new"],
  // ── iPhone 11 Pro Max ──────────────────────────────────────────
  ["tpl-iph11promax-64-gris","Apple","iPhone","iPhone 11 Pro Max","iPhone 11 Pro Max 64GB Space Gray","64GB","Space Gray","6.5\" OLED",2019,"new"],
  ["tpl-iph11promax-64-plata","Apple","iPhone","iPhone 11 Pro Max","iPhone 11 Pro Max 64GB Silver","64GB","Silver","6.5\" OLED",2019,"new"],
  ["tpl-iph11promax-64-oro","Apple","iPhone","iPhone 11 Pro Max","iPhone 11 Pro Max 64GB Gold","64GB","Gold","6.5\" OLED",2019,"new"],
  ["tpl-iph11promax-256-gris","Apple","iPhone","iPhone 11 Pro Max","iPhone 11 Pro Max 256GB Space Gray","256GB","Space Gray","6.5\" OLED",2019,"new"],
  ["tpl-iph11promax-512-verde","Apple","iPhone","iPhone 11 Pro Max","iPhone 11 Pro Max 512GB Midnight Green","512GB","Midnight Green","6.5\" OLED",2019,"new"],
  // ── iPhone SE 3ra gen ──────────────────────────────────────────
  ["tpl-iphse3-64-negro","Apple","iPhone","iPhone SE 3ra gen","iPhone SE (3rd gen) 64GB Midnight","64GB","Midnight","4.7\" Retina HD",2022,"new"],
  ["tpl-iphse3-64-blanco","Apple","iPhone","iPhone SE 3ra gen","iPhone SE (3rd gen) 64GB Starlight","64GB","Starlight","4.7\" Retina HD",2022,"new"],
  ["tpl-iphse3-64-red","Apple","iPhone","iPhone SE 3ra gen","iPhone SE (3rd gen) 64GB (PRODUCT)RED","64GB","(PRODUCT)RED","4.7\" Retina HD",2022,"new"],
  ["tpl-iphse3-128-negro","Apple","iPhone","iPhone SE 3ra gen","iPhone SE (3rd gen) 128GB Midnight","128GB","Midnight","4.7\" Retina HD",2022,"new"],
  ["tpl-iphse3-256-blanco","Apple","iPhone","iPhone SE 3ra gen","iPhone SE (3rd gen) 256GB Starlight","256GB","Starlight","4.7\" Retina HD",2022,"new"],
  // ── iPhone SE 2da gen ──────────────────────────────────────────
  ["tpl-iphse2-64-negro","Apple","iPhone","iPhone SE 2da gen","iPhone SE (2nd gen) 64GB Black","64GB","Black","4.7\" Retina HD",2020,"new"],
  ["tpl-iphse2-64-blanco","Apple","iPhone","iPhone SE 2da gen","iPhone SE (2nd gen) 64GB White","64GB","White","4.7\" Retina HD",2020,"new"],
  ["tpl-iphse2-64-red","Apple","iPhone","iPhone SE 2da gen","iPhone SE (2nd gen) 64GB (PRODUCT)RED","64GB","(PRODUCT)RED","4.7\" Retina HD",2020,"new"],
  ["tpl-iphse2-128-negro","Apple","iPhone","iPhone SE 2da gen","iPhone SE (2nd gen) 128GB Black","128GB","Black","4.7\" Retina HD",2020,"new"],
  ["tpl-iphse2-256-blanco","Apple","iPhone","iPhone SE 2da gen","iPhone SE (2nd gen) 256GB White","256GB","White","4.7\" Retina HD",2020,"new"],
  // ── iPhone XS / XS Max ─────────────────────────────────────────
  ["tpl-iphxs-64-gris","Apple","iPhone","iPhone XS","iPhone XS 64GB Space Gray","64GB","Space Gray","5.8\" OLED",2018,"new"],
  ["tpl-iphxs-64-plata","Apple","iPhone","iPhone XS","iPhone XS 64GB Silver","64GB","Silver","5.8\" OLED",2018,"new"],
  ["tpl-iphxs-64-oro","Apple","iPhone","iPhone XS","iPhone XS 64GB Gold","64GB","Gold","5.8\" OLED",2018,"new"],
  ["tpl-iphxs-256-gris","Apple","iPhone","iPhone XS","iPhone XS 256GB Space Gray","256GB","Space Gray","5.8\" OLED",2018,"new"],
  ["tpl-iphxs-512-plata","Apple","iPhone","iPhone XS","iPhone XS 512GB Silver","512GB","Silver","5.8\" OLED",2018,"new"],
  ["tpl-iphxsmax-64-gris","Apple","iPhone","iPhone XS Max","iPhone XS Max 64GB Space Gray","64GB","Space Gray","6.5\" OLED",2018,"new"],
  ["tpl-iphxsmax-64-oro","Apple","iPhone","iPhone XS Max","iPhone XS Max 64GB Gold","64GB","Gold","6.5\" OLED",2018,"new"],
  ["tpl-iphxsmax-256-plata","Apple","iPhone","iPhone XS Max","iPhone XS Max 256GB Silver","256GB","Silver","6.5\" OLED",2018,"new"],
  ["tpl-iphxsmax-512-gris","Apple","iPhone","iPhone XS Max","iPhone XS Max 512GB Space Gray","512GB","Space Gray","6.5\" OLED",2018,"new"],
  // ── iPhone XR ──────────────────────────────────────────────────
  ["tpl-iphxr-64-negro","Apple","iPhone","iPhone XR","iPhone XR 64GB Black","64GB","Black","6.1\" LCD",2018,"new"],
  ["tpl-iphxr-64-blanco","Apple","iPhone","iPhone XR","iPhone XR 64GB White","64GB","White","6.1\" LCD",2018,"new"],
  ["tpl-iphxr-64-azul","Apple","iPhone","iPhone XR","iPhone XR 64GB Blue","64GB","Blue","6.1\" LCD",2018,"new"],
  ["tpl-iphxr-64-coral","Apple","iPhone","iPhone XR","iPhone XR 64GB Coral","64GB","Coral","6.1\" LCD",2018,"new"],
  ["tpl-iphxr-64-amarillo","Apple","iPhone","iPhone XR","iPhone XR 64GB Yellow","64GB","Yellow","6.1\" LCD",2018,"new"],
  ["tpl-iphxr-64-red","Apple","iPhone","iPhone XR","iPhone XR 64GB (PRODUCT)RED","64GB","(PRODUCT)RED","6.1\" LCD",2018,"new"],
  ["tpl-iphxr-128-negro","Apple","iPhone","iPhone XR","iPhone XR 128GB Black","128GB","Black","6.1\" LCD",2018,"new"],
  ["tpl-iphxr-256-blanco","Apple","iPhone","iPhone XR","iPhone XR 256GB White","256GB","White","6.1\" LCD",2018,"new"],
  // ── iPhone X ───────────────────────────────────────────────────
  ["tpl-iphx-64-gris","Apple","iPhone","iPhone X","iPhone X 64GB Space Gray","64GB","Space Gray","5.8\" OLED",2017,"new"],
  ["tpl-iphx-64-plata","Apple","iPhone","iPhone X","iPhone X 64GB Silver","64GB","Silver","5.8\" OLED",2017,"new"],
  ["tpl-iphx-256-gris","Apple","iPhone","iPhone X","iPhone X 256GB Space Gray","256GB","Space Gray","5.8\" OLED",2017,"new"],
  ["tpl-iphx-256-plata","Apple","iPhone","iPhone X","iPhone X 256GB Silver","256GB","Silver","5.8\" OLED",2017,"new"],
  // ── iPhone 8 / 8 Plus ──────────────────────────────────────────
  ["tpl-iph8-64-negro","Apple","iPhone","iPhone 8","iPhone 8 64GB Space Gray","64GB","Space Gray","4.7\" Retina HD",2017,"new"],
  ["tpl-iph8-64-plata","Apple","iPhone","iPhone 8","iPhone 8 64GB Silver","64GB","Silver","4.7\" Retina HD",2017,"new"],
  ["tpl-iph8-64-oro","Apple","iPhone","iPhone 8","iPhone 8 64GB Gold","64GB","Gold","4.7\" Retina HD",2017,"new"],
  ["tpl-iph8-64-red","Apple","iPhone","iPhone 8","iPhone 8 64GB (PRODUCT)RED","64GB","(PRODUCT)RED","4.7\" Retina HD",2017,"new"],
  ["tpl-iph8-256-negro","Apple","iPhone","iPhone 8","iPhone 8 256GB Space Gray","256GB","Space Gray","4.7\" Retina HD",2017,"new"],
  ["tpl-iph8plus-64-negro","Apple","iPhone","iPhone 8 Plus","iPhone 8 Plus 64GB Space Gray","64GB","Space Gray","5.5\" Retina HD",2017,"new"],
  ["tpl-iph8plus-64-plata","Apple","iPhone","iPhone 8 Plus","iPhone 8 Plus 64GB Silver","64GB","Silver","5.5\" Retina HD",2017,"new"],
  ["tpl-iph8plus-64-oro","Apple","iPhone","iPhone 8 Plus","iPhone 8 Plus 64GB Gold","64GB","Gold","5.5\" Retina HD",2017,"new"],
  ["tpl-iph8plus-256-negro","Apple","iPhone","iPhone 8 Plus","iPhone 8 Plus 256GB Space Gray","256GB","Space Gray","5.5\" Retina HD",2017,"new"],
  // ── iPhone 7 / 7 Plus ──────────────────────────────────────────
  ["tpl-iph7-32-negro","Apple","iPhone","iPhone 7","iPhone 7 32GB Matte Black","32GB","Matte Black","4.7\" Retina HD",2016,"new"],
  ["tpl-iph7-32-plata","Apple","iPhone","iPhone 7","iPhone 7 32GB Silver","32GB","Silver","4.7\" Retina HD",2016,"new"],
  ["tpl-iph7-32-oro","Apple","iPhone","iPhone 7","iPhone 7 32GB Gold","32GB","Gold","4.7\" Retina HD",2016,"new"],
  ["tpl-iph7-32-ororosa","Apple","iPhone","iPhone 7","iPhone 7 32GB Rose Gold","32GB","Rose Gold","4.7\" Retina HD",2016,"new"],
  ["tpl-iph7-32-red","Apple","iPhone","iPhone 7","iPhone 7 32GB (PRODUCT)RED","32GB","(PRODUCT)RED","4.7\" Retina HD",2016,"new"],
  ["tpl-iph7-128-negro","Apple","iPhone","iPhone 7","iPhone 7 128GB Matte Black","128GB","Matte Black","4.7\" Retina HD",2016,"new"],
  ["tpl-iph7plus-32-negro","Apple","iPhone","iPhone 7 Plus","iPhone 7 Plus 32GB Matte Black","32GB","Matte Black","5.5\" Retina HD",2016,"new"],
  ["tpl-iph7plus-32-plata","Apple","iPhone","iPhone 7 Plus","iPhone 7 Plus 32GB Silver","32GB","Silver","5.5\" Retina HD",2016,"new"],
  ["tpl-iph7plus-128-negro","Apple","iPhone","iPhone 7 Plus","iPhone 7 Plus 128GB Matte Black","128GB","Matte Black","5.5\" Retina HD",2016,"new"],
  ["tpl-iph7plus-128-oro","Apple","iPhone","iPhone 7 Plus","iPhone 7 Plus 128GB Gold","128GB","Gold","5.5\" Retina HD",2016,"new"],
  // ── iPad Pro M4 ────────────────────────────────────────────────
  ["tpl-ipadpro11-256-plata","Apple","iPad","iPad Pro 11\"","iPad Pro 11\" M4 256GB Silver","256GB","Silver","11\" Liquid Retina XDR",2024,"new"],
  ["tpl-ipadpro11-256-negro","Apple","iPad","iPad Pro 11\"","iPad Pro 11\" M4 256GB Space Black","256GB","Space Black","11\" Liquid Retina XDR",2024,"new"],
  ["tpl-ipadpro11-512-plata","Apple","iPad","iPad Pro 11\"","iPad Pro 11\" M4 512GB Silver","512GB","Silver","11\" Liquid Retina XDR",2024,"new"],
  ["tpl-ipadpro13-256-plata","Apple","iPad","iPad Pro 13\"","iPad Pro 13\" M4 256GB Silver","256GB","Silver","13\" Liquid Retina XDR",2024,"new"],
  ["tpl-ipadpro13-256-negro","Apple","iPad","iPad Pro 13\"","iPad Pro 13\" M4 256GB Space Black","256GB","Space Black","13\" Liquid Retina XDR",2024,"new"],
  ["tpl-ipadpro13-1tb-plata","Apple","iPad","iPad Pro 13\"","iPad Pro 13\" M4 1TB Silver","1TB","Silver","13\" Liquid Retina XDR",2024,"new"],
  // ── iPad Air M3 ────────────────────────────────────────────────
  ["tpl-ipadair11-128-azul","Apple","iPad","iPad Air 11\"","iPad Air 11\" M3 128GB Blue","128GB","Blue","11\" Liquid Retina",2024,"new"],
  ["tpl-ipadair11-128-morado","Apple","iPad","iPad Air 11\"","iPad Air 11\" M3 128GB Purple","128GB","Purple","11\" Liquid Retina",2024,"new"],
  ["tpl-ipadair11-128-blanco","Apple","iPad","iPad Air 11\"","iPad Air 11\" M3 128GB Starlight","128GB","Starlight","11\" Liquid Retina",2024,"new"],
  ["tpl-ipadair11-256-azul","Apple","iPad","iPad Air 11\"","iPad Air 11\" M3 256GB Blue","256GB","Blue","11\" Liquid Retina",2024,"new"],
  ["tpl-ipadair13-128-azul","Apple","iPad","iPad Air 13\"","iPad Air 13\" M3 128GB Blue","128GB","Blue","13\" Liquid Retina",2024,"new"],
  ["tpl-ipadair13-128-morado","Apple","iPad","iPad Air 13\"","iPad Air 13\" M3 128GB Purple","128GB","Purple","13\" Liquid Retina",2024,"new"],
  // ── iPad base A16 ──────────────────────────────────────────────
  ["tpl-ipad-128-plata","Apple","iPad","iPad (A16)","iPad 128GB Silver","128GB","Silver","10.9\" Liquid Retina",2024,"new"],
  ["tpl-ipad-128-azul","Apple","iPad","iPad (A16)","iPad 128GB Blue","128GB","Blue","10.9\" Liquid Retina",2024,"new"],
  ["tpl-ipad-128-rosa","Apple","iPad","iPad (A16)","iPad 128GB Pink","128GB","Pink","10.9\" Liquid Retina",2024,"new"],
  ["tpl-ipad-128-amarillo","Apple","iPad","iPad (A16)","iPad 128GB Yellow","128GB","Yellow","10.9\" Liquid Retina",2024,"new"],
  ["tpl-ipad-256-plata","Apple","iPad","iPad (A16)","iPad 256GB Silver","256GB","Silver","10.9\" Liquid Retina",2024,"new"],
  // ── iPad mini A17 ──────────────────────────────────────────────
  ["tpl-ipadmini-128-azul","Apple","iPad","iPad mini (A17)","iPad mini 128GB Blue","128GB","Blue","8.3\" Liquid Retina",2024,"new"],
  ["tpl-ipadmini-128-morado","Apple","iPad","iPad mini (A17)","iPad mini 128GB Purple","128GB","Purple","8.3\" Liquid Retina",2024,"new"],
  ["tpl-ipadmini-128-blanco","Apple","iPad","iPad mini (A17)","iPad mini 128GB Starlight","128GB","Starlight","8.3\" Liquid Retina",2024,"new"],
  ["tpl-ipadmini-256-azul","Apple","iPad","iPad mini (A17)","iPad mini 256GB Blue","256GB","Blue","8.3\" Liquid Retina",2024,"new"],
  // ── Apple Watch Series 11 ──────────────────────────────────────
  ["tpl-watch11-41-negro","Apple","Apple Watch","Apple Watch Series 11","Apple Watch Series 11 41mm Midnight",null,"Midnight","41mm",2025,"new"],
  ["tpl-watch11-41-plata","Apple","Apple Watch","Apple Watch Series 11","Apple Watch Series 11 41mm Silver",null,"Silver","41mm",2025,"new"],
  ["tpl-watch11-45-negro","Apple","Apple Watch","Apple Watch Series 11","Apple Watch Series 11 45mm Midnight",null,"Midnight","45mm",2025,"new"],
  ["tpl-watch11-45-plata","Apple","Apple Watch","Apple Watch Series 11","Apple Watch Series 11 45mm Silver",null,"Silver","45mm",2025,"new"],
  // ── Apple Watch Ultra ──────────────────────────────────────────
  ["tpl-watchultra3-49-titanio","Apple","Apple Watch","Apple Watch Ultra 3","Apple Watch Ultra 3 49mm Natural Titanium",null,"Natural Titanium","49mm",2025,"new"],
  ["tpl-watchultra2-49-titanio","Apple","Apple Watch","Apple Watch Ultra 2","Apple Watch Ultra 2 49mm Natural Titanium",null,"Natural Titanium","49mm",2024,"new"],
  ["tpl-watchultra2-49-negro","Apple","Apple Watch","Apple Watch Ultra 2","Apple Watch Ultra 2 49mm Black Titanium",null,"Black Titanium","49mm",2024,"new"],
  // ── Apple Watch SE ─────────────────────────────────────────────
  ["tpl-watchse-40-negro","Apple","Apple Watch","Apple Watch SE","Apple Watch SE 40mm Midnight",null,"Midnight","40mm",2024,"new"],
  ["tpl-watchse-44-plata","Apple","Apple Watch","Apple Watch SE","Apple Watch SE 44mm Silver",null,"Silver","44mm",2024,"new"],
];

export async function seedBuiltinTemplates(): Promise<void> {
  // Check if templates already exist with English names
  const englishRows = await dbSelect<{ count: number }>(
    `SELECT COUNT(*) as count FROM product_templates
     WHERE name LIKE '%Midnight%' OR name LIKE '%Titanium%' OR name LIKE '%Starlight%'`,
    [],
  );
  if ((englishRows[0]?.count ?? 0) > 50) return;

  // Delete old Spanish-named templates and re-insert with English names
  await dbExecute("DELETE FROM product_templates WHERE is_builtin = 1", []);

  for (const [id, brand, category, subcategory, name, storage, color, screen_size, year, condition] of TEMPLATES) {
    await dbExecute(
      `INSERT OR IGNORE INTO product_templates
         (id, brand, category, subcategory, name, storage, color, screen_size, year, condition, is_builtin, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
      [id, brand, category, subcategory, name, storage, color, screen_size, year, condition],
    );
  }
  console.log(`[templates] seeded ${TEMPLATES.length} built-in templates (English)`);
}

export const productTemplatesDb = { search, getByCategory, seedBuiltinTemplates };
