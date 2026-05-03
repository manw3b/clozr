import { dbSelect, dbExecute } from "./index";

// ─── Types ────────────────────────────────────────────────────────

export interface ProductCategory {
  id: string;
  name: string;
  emoji: string | null;
  sort_order: number;
}

export interface ProductFamily {
  id: string;
  category_id: string;
  name: string;
  sort_order: number;
}

export interface ProductModel {
  id: string;
  family_id: string;
  name: string;
  image_path: string | null;
  sort_order: number;
}

export interface ProductVariant {
  id: string;
  model_id: string;
  color: string;
  color_hex: string | null;
  storage: string;
  sku: string | null;
  image_path: string | null;
  is_available: number;
}

export interface ColorOption {
  color: string;
  color_hex: string | null;
}

export interface StockItem {
  id: string;
  workspace_id: string;
  variant_id: string;
  catalog_item_id: string | null;
  imei: string;
  status: string;
  notes: string | null;
  created_at: string;
  sold_at: string | null;
  sale_id: string | null;
}

export interface StockItemWithDetails extends StockItem {
  color: string;
  storage: string;
  color_hex: string | null;
  model_name: string;
  image_path: string | null;
  family_name: string;
  category_name: string;
}

export interface StockSummary {
  total: number;
  available: number;
  sold: number;
}

// ─── Seed ─────────────────────────────────────────────────────────

export async function seedAppleCatalog(): Promise<void> {
  const existing = await dbSelect<{ count: number }>(
    "SELECT COUNT(*) as count FROM product_categories",
    [],
  );
  if ((existing[0]?.count ?? 0) > 0) return;

  // Categories
  await dbExecute(
    `INSERT OR IGNORE INTO product_categories (id, name, emoji, sort_order) VALUES
    ('cat-iphone','iPhone','📱',0),
    ('cat-ipad','iPad','📲',1),
    ('cat-watch','Apple Watch','⌚',2),
    ('cat-airpods','AirPods','🎧',3),
    ('cat-mac','Mac','💻',4)`,
    [],
  );

  // Families — iPhone
  await dbExecute(
    `INSERT OR IGNORE INTO product_families (id, category_id, name, sort_order) VALUES
    ('fam-17','cat-iphone','iPhone 17',0),
    ('fam-16','cat-iphone','iPhone 16',1),
    ('fam-15','cat-iphone','iPhone 15',2),
    ('fam-14','cat-iphone','iPhone 14',3),
    ('fam-13','cat-iphone','iPhone 13',4),
    ('fam-12','cat-iphone','iPhone 12',5),
    ('fam-11','cat-iphone','iPhone 11',6),
    ('fam-x','cat-iphone','iPhone X Series',7),
    ('fam-se','cat-iphone','iPhone SE',8),
    ('fam-8','cat-iphone','iPhone 8',9),
    ('fam-7','cat-iphone','iPhone 7',10)`,
    [],
  );

  // Families — iPad
  await dbExecute(
    `INSERT OR IGNORE INTO product_families (id, category_id, name, sort_order) VALUES
    ('fam-ipadpro','cat-ipad','iPad Pro',0),
    ('fam-ipadair','cat-ipad','iPad Air',1),
    ('fam-ipadmini','cat-ipad','iPad mini',2),
    ('fam-ipad','cat-ipad','iPad',3)`,
    [],
  );

  // Families — Apple Watch
  await dbExecute(
    `INSERT OR IGNORE INTO product_families (id, category_id, name, sort_order) VALUES
    ('fam-wseries','cat-watch','Apple Watch Series',0),
    ('fam-wultra','cat-watch','Apple Watch Ultra',1),
    ('fam-wse','cat-watch','Apple Watch SE',2)`,
    [],
  );

  // Models — iPhone 17 series
  await dbExecute(
    `INSERT OR IGNORE INTO product_models (id, family_id, name, image_path, sort_order) VALUES
    ('mod-17promax','fam-17','iPhone 17 Pro Max','/src/assets/products/iphones/iPhone_17_Pro_Max_Silver.jpg',0),
    ('mod-17pro','fam-17','iPhone 17 Pro','/src/assets/products/iphones/iPhone_17_Pro_Deep_Blue.jpg',1),
    ('mod-17air','fam-17','iPhone 17 Air','/src/assets/products/iphones/iPhone_Air_Space_Black.jpg',2),
    ('mod-17','fam-17','iPhone 17','/src/assets/products/iphones/iPhone_17_Black.jpg',3),
    ('mod-17e','fam-17','iPhone 17e','/src/assets/products/iphones/iPhone_17e_Black.jpg',4)`,
    [],
  );

  // Models — iPhone 16 series
  await dbExecute(
    `INSERT OR IGNORE INTO product_models (id, family_id, name, image_path, sort_order) VALUES
    ('mod-16promax','fam-16','iPhone 16 Pro Max','/src/assets/products/iphones/iPhone_16_Pro_Max_Black_Titanium.jpg',0),
    ('mod-16pro','fam-16','iPhone 16 Pro','/src/assets/products/iphones/iPhone_16_Pro_Black_Titanium.jpg',1),
    ('mod-16plus','fam-16','iPhone 16 Plus','/src/assets/products/iphones/iPhone_16_Plus_Black.jpg',2),
    ('mod-16','fam-16','iPhone 16','/src/assets/products/iphones/iPhone_16_Black.jpg',3),
    ('mod-16e','fam-16','iPhone 16e','/src/assets/products/iphones/iPhone_16e_Black.jpg',4)`,
    [],
  );

  // Models — iPhone 15 series
  await dbExecute(
    `INSERT OR IGNORE INTO product_models (id, family_id, name, image_path, sort_order) VALUES
    ('mod-15promax','fam-15','iPhone 15 Pro Max','/src/assets/products/iphones/iPhone_15_Pro_Max_Black_Titanium.jpg',0),
    ('mod-15pro','fam-15','iPhone 15 Pro','/src/assets/products/iphones/iPhone_15_Pro_Black_Titanium.jpg',1),
    ('mod-15plus','fam-15','iPhone 15 Plus','/src/assets/products/iphones/iPhone_15_Plus_Black.jpg',2),
    ('mod-15','fam-15','iPhone 15','/src/assets/products/iphones/iPhone_15_Black.jpg',3)`,
    [],
  );

  // Models — iPhone 14/13/12/11 series
  await dbExecute(
    `INSERT OR IGNORE INTO product_models (id, family_id, name, image_path, sort_order) VALUES
    ('mod-14promax','fam-14','iPhone 14 Pro Max','/src/assets/products/iphones/iPhone_14_Pro_Max_Space_Black.jpg',0),
    ('mod-14pro','fam-14','iPhone 14 Pro','/src/assets/products/iphones/iPhone_14_Pro_Space_Black.jpg',1),
    ('mod-14plus','fam-14','iPhone 14 Plus','/src/assets/products/iphones/iPhone_14_Plus_Midnight.jpg',2),
    ('mod-14','fam-14','iPhone 14','/src/assets/products/iphones/iPhone_14_Midnight.jpg',3),
    ('mod-13promax','fam-13','iPhone 13 Pro Max','/src/assets/products/iphones/iPhone_13_Pro_Max_Graphite.jpg',0),
    ('mod-13pro','fam-13','iPhone 13 Pro','/src/assets/products/iphones/iPhone_13_Pro_Graphite.jpg',1),
    ('mod-13','fam-13','iPhone 13','/src/assets/products/iphones/iPhone_13_Midnight.jpg',2),
    ('mod-13mini','fam-13','iPhone 13 mini','/src/assets/products/iphones/iPhone_13_Mini_Midnight.jpg',3),
    ('mod-12promax','fam-12','iPhone 12 Pro Max','/src/assets/products/iphones/iPhone_12_Pro_Max_Graphite.jpg',0),
    ('mod-12pro','fam-12','iPhone 12 Pro','/src/assets/products/iphones/iPhone_12_Pro_Graphite.jpg',1),
    ('mod-12','fam-12','iPhone 12','/src/assets/products/iphones/iPhone_12_Black.jpg',2),
    ('mod-12mini','fam-12','iPhone 12 mini','/src/assets/products/iphones/iPhone_12_Mini_Black.jpg',3),
    ('mod-11promax','fam-11','iPhone 11 Pro Max','/src/assets/products/iphones/iPhone_11_Pro_Max_Spacegrey.jpg',0),
    ('mod-11pro','fam-11','iPhone 11 Pro','/src/assets/products/iphones/iPhone_11_Pro_Spacegrey.jpg',1),
    ('mod-11','fam-11','iPhone 11','/src/assets/products/iphones/iPhone_11_Black.jpg',2)`,
    [],
  );

  // Models — iPhone X/SE/8/7
  await dbExecute(
    `INSERT OR IGNORE INTO product_models (id, family_id, name, image_path, sort_order) VALUES
    ('mod-xsmax','fam-x','iPhone XS Max','/src/assets/products/iphones/iPhone_XS_Max_Spacegray.jpg',0),
    ('mod-xs','fam-x','iPhone XS','/src/assets/products/iphones/iPhone_XS_Spacegray.jpg',1),
    ('mod-xr','fam-x','iPhone XR','/src/assets/products/iphones/iPhone_XR_Black.jpg',2),
    ('mod-x','fam-x','iPhone X','/src/assets/products/iphones/iPhone_X_Spacegray.jpg',3),
    ('mod-se3','fam-se','iPhone SE (3rd Gen)','/src/assets/products/iphones/iPhone_SE_3rd_Gen_Midnight.jpg',0),
    ('mod-se2','fam-se','iPhone SE (2nd Gen)','/src/assets/products/iphones/iPhone_SE_2nd_Gen_Black.jpg',1),
    ('mod-8plus','fam-8','iPhone 8 Plus','/src/assets/products/iphones/iPhone_8_Plus_Spacegray.jpg',0),
    ('mod-8','fam-8','iPhone 8','/src/assets/products/iphones/iPhone_8_Spacegray.jpg',1),
    ('mod-7plus','fam-7','iPhone 7 Plus','/src/assets/products/iphones/iPhone_7_Plus_Black.jpg',0),
    ('mod-7','fam-7','iPhone 7','/src/assets/products/iphones/iPhone_7_Black.jpg',1)`,
    [],
  );

  // Models — iPad
  await dbExecute(
    `INSERT OR IGNORE INTO product_models (id, family_id, name, image_path, sort_order) VALUES
    ('mod-ipadpro13m4','fam-ipadpro','iPad Pro 13" M4','/src/assets/products/ipads/iPad_Pro_13_M4_Silver.jpg',0),
    ('mod-ipadpro11m4','fam-ipadpro','iPad Pro 11" M4','/src/assets/products/ipads/iPad_Pro_11_M4_Silver.jpg',1),
    ('mod-ipadairm3-13','fam-ipadair','iPad Air 13" M3','/src/assets/products/ipads/iPad_Air_13_M4_Blue.jpg',0),
    ('mod-ipadairm3-11','fam-ipadair','iPad Air 11" M3','/src/assets/products/ipads/iPad_Air_11_M4_Blue.jpg',1),
    ('mod-ipadmini7','fam-ipadmini','iPad mini (A17 Pro)','/src/assets/products/ipads/iPad_Mini_A17pro_Blue.jpg',0),
    ('mod-ipad11','fam-ipad','iPad (A16)','/src/assets/products/ipads/iPad_11th_A16_Blue.jpg',0)`,
    [],
  );

  // Variants — iPhone 17 Pro Max / Pro
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-17pm-st-256','mod-17promax','Silver','#E8E3DC','256GB',NULL,NULL,1),
    ('var-17pm-st-512','mod-17promax','Silver','#E8E3DC','512GB',NULL,NULL,1),
    ('var-17pm-st-1tb','mod-17promax','Silver','#E8E3DC','1TB',NULL,NULL,1),
    ('var-17pm-co-256','mod-17promax','Cosmic Orange','#D4621A','256GB',NULL,NULL,1),
    ('var-17pm-co-512','mod-17promax','Cosmic Orange','#D4621A','512GB',NULL,NULL,1),
    ('var-17pm-db-256','mod-17promax','Deep Blue','#1B3A6B','256GB',NULL,NULL,1),
    ('var-17pm-db-512','mod-17promax','Deep Blue','#1B3A6B','512GB',NULL,NULL,1),
    ('var-17pm-db-1tb','mod-17promax','Deep Blue','#1B3A6B','1TB',NULL,NULL,1),
    ('var-17pm-db-2tb','mod-17promax','Deep Blue','#1B3A6B','2TB',NULL,NULL,1),
    ('var-17p-st-256','mod-17pro','Silver','#E8E3DC','256GB',NULL,NULL,1),
    ('var-17p-st-512','mod-17pro','Silver','#E8E3DC','512GB',NULL,NULL,1),
    ('var-17p-st-1tb','mod-17pro','Silver','#E8E3DC','1TB',NULL,NULL,1),
    ('var-17p-co-256','mod-17pro','Cosmic Orange','#D4621A','256GB',NULL,NULL,1),
    ('var-17p-co-512','mod-17pro','Cosmic Orange','#D4621A','512GB',NULL,NULL,1),
    ('var-17p-db-256','mod-17pro','Deep Blue','#1B3A6B','256GB',NULL,NULL,1),
    ('var-17p-db-512','mod-17pro','Deep Blue','#1B3A6B','512GB',NULL,NULL,1)`,
    [],
  );

  // Variants — iPhone 17 Air / 17 / 17e
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-17air-sb-256','mod-17air','Space Black','#1C1C1E','256GB',NULL,NULL,1),
    ('var-17air-sb-512','mod-17air','Space Black','#1C1C1E','512GB',NULL,NULL,1),
    ('var-17air-sb-1tb','mod-17air','Space Black','#1C1C1E','1TB',NULL,NULL,1),
    ('var-17air-cw-256','mod-17air','Cloud White','#F5F5F0','256GB',NULL,NULL,1),
    ('var-17air-cw-512','mod-17air','Cloud White','#F5F5F0','512GB',NULL,NULL,1),
    ('var-17air-lg-256','mod-17air','Light Gold','#E8D5A3','256GB',NULL,NULL,1),
    ('var-17air-sky-256','mod-17air','Sky Blue','#8BBCD4','256GB',NULL,NULL,1),
    ('var-17air-sky-512','mod-17air','Sky Blue','#8BBCD4','512GB',NULL,NULL,1),
    ('var-17-blk-256','mod-17','Black','#1C1C1E','256GB',NULL,NULL,1),
    ('var-17-blk-512','mod-17','Black','#1C1C1E','512GB',NULL,NULL,1),
    ('var-17-wht-256','mod-17','White','#F5F5F0','256GB',NULL,NULL,1),
    ('var-17-wht-512','mod-17','White','#F5F5F0','512GB',NULL,NULL,1),
    ('var-17-mb-256','mod-17','Mist Blue','#A8C4D4','256GB',NULL,NULL,1),
    ('var-17-sg-256','mod-17','Sage','#8FAF8C','256GB',NULL,NULL,1),
    ('var-17-lv-256','mod-17','Lavender','#C4B8D4','256GB',NULL,NULL,1),
    ('var-17e-blk-128','mod-17e','Black','#1C1C1E','128GB',NULL,NULL,1),
    ('var-17e-wht-128','mod-17e','White','#F5F5F0','128GB',NULL,NULL,1),
    ('var-17e-pnk-128','mod-17e','Pink','#F2A7B0','128GB',NULL,NULL,1)`,
    [],
  );

  // Variants — iPhone 16 Pro Max / Pro
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-16pm-bt-256','mod-16promax','Black Titanium','#2C2C2C','256GB',NULL,NULL,1),
    ('var-16pm-bt-512','mod-16promax','Black Titanium','#2C2C2C','512GB',NULL,NULL,1),
    ('var-16pm-bt-1tb','mod-16promax','Black Titanium','#2C2C2C','1TB',NULL,NULL,1),
    ('var-16pm-bt-2tb','mod-16promax','Black Titanium','#2C2C2C','2TB',NULL,NULL,1),
    ('var-16pm-nt-256','mod-16promax','Natural Titanium','#C5B9A8','256GB',NULL,NULL,1),
    ('var-16pm-nt-512','mod-16promax','Natural Titanium','#C5B9A8','512GB',NULL,NULL,1),
    ('var-16pm-nt-1tb','mod-16promax','Natural Titanium','#C5B9A8','1TB',NULL,NULL,1),
    ('var-16pm-wt-256','mod-16promax','White Titanium','#E8E3DC','256GB',NULL,NULL,1),
    ('var-16pm-wt-512','mod-16promax','White Titanium','#E8E3DC','512GB',NULL,NULL,1),
    ('var-16pm-dt-256','mod-16promax','Desert Titanium','#D4B896','256GB',NULL,NULL,1),
    ('var-16pm-dt-512','mod-16promax','Desert Titanium','#D4B896','512GB',NULL,NULL,1),
    ('var-16p-bt-256','mod-16pro','Black Titanium','#2C2C2C','256GB',NULL,NULL,1),
    ('var-16p-bt-512','mod-16pro','Black Titanium','#2C2C2C','512GB',NULL,NULL,1),
    ('var-16p-bt-1tb','mod-16pro','Black Titanium','#2C2C2C','1TB',NULL,NULL,1),
    ('var-16p-nt-256','mod-16pro','Natural Titanium','#C5B9A8','256GB',NULL,NULL,1),
    ('var-16p-nt-512','mod-16pro','Natural Titanium','#C5B9A8','512GB',NULL,NULL,1),
    ('var-16p-wt-256','mod-16pro','White Titanium','#E8E3DC','256GB',NULL,NULL,1),
    ('var-16p-wt-512','mod-16pro','White Titanium','#E8E3DC','512GB',NULL,NULL,1),
    ('var-16p-dt-256','mod-16pro','Desert Titanium','#D4B896','256GB',NULL,NULL,1)`,
    [],
  );

  // Variants — iPhone 16 / 16 Plus / 16e
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-16-blk-128','mod-16','Black','#1C1C1E','128GB',NULL,NULL,1),
    ('var-16-wht-128','mod-16','White','#F5F5F0','128GB',NULL,NULL,1),
    ('var-16-pnk-128','mod-16','Pink','#F2A7B0','128GB',NULL,NULL,1),
    ('var-16-tel-128','mod-16','Teal','#5B9EA0','128GB',NULL,NULL,1),
    ('var-16-ult-128','mod-16','Ultramarine','#3B5BA5','128GB',NULL,NULL,1),
    ('var-16p-blk-128','mod-16plus','Black','#1C1C1E','128GB',NULL,NULL,1),
    ('var-16p-wht-128','mod-16plus','White','#F5F5F0','128GB',NULL,NULL,1),
    ('var-16p-pnk-256','mod-16plus','Pink','#F2A7B0','256GB',NULL,NULL,1),
    ('var-16p-tel-256','mod-16plus','Teal','#5B9EA0','256GB',NULL,NULL,1),
    ('var-16p-ult-256','mod-16plus','Ultramarine','#3B5BA5','256GB',NULL,NULL,1),
    ('var-16e-blk-128','mod-16e','Black','#1C1C1E','128GB',NULL,NULL,1),
    ('var-16e-wht-128','mod-16e','White','#F5F5F0','128GB',NULL,NULL,1)`,
    [],
  );

  // Variants — iPhone 15 Pro Max / Pro / 15 / Plus
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-15pm-nt-256','mod-15promax','Natural Titanium','#C5B9A8','256GB',NULL,NULL,1),
    ('var-15pm-nt-512','mod-15promax','Natural Titanium','#C5B9A8','512GB',NULL,NULL,1),
    ('var-15pm-nt-1tb','mod-15promax','Natural Titanium','#C5B9A8','1TB',NULL,NULL,1),
    ('var-15pm-bt-256','mod-15promax','Black Titanium','#2C2C2C','256GB',NULL,NULL,1),
    ('var-15pm-bt-512','mod-15promax','Black Titanium','#2C2C2C','512GB',NULL,NULL,1),
    ('var-15pm-wt-256','mod-15promax','White Titanium','#E8E3DC','256GB',NULL,NULL,1),
    ('var-15p-nt-128','mod-15pro','Natural Titanium','#C5B9A8','128GB',NULL,NULL,1),
    ('var-15p-bt-128','mod-15pro','Black Titanium','#2C2C2C','128GB',NULL,NULL,1),
    ('var-15p-bt-256','mod-15pro','Black Titanium','#2C2C2C','256GB',NULL,NULL,1),
    ('var-15p-wt-256','mod-15pro','White Titanium','#E8E3DC','256GB',NULL,NULL,1),
    ('var-15-blk-128','mod-15','Black','#1C1C1E','128GB',NULL,NULL,1),
    ('var-15-wht-128','mod-15','White','#F5F5F0','128GB',NULL,NULL,1),
    ('var-15-pnk-128','mod-15','Pink','#F2A7B0','128GB',NULL,NULL,1),
    ('var-15-grn-128','mod-15','Green','#4A7B5C','128GB',NULL,NULL,1),
    ('var-15-yel-128','mod-15','Yellow','#F5E642','128GB',NULL,NULL,1),
    ('var-15-blk-256','mod-15','Black','#1C1C1E','256GB',NULL,NULL,1),
    ('var-15p-blk-128','mod-15plus','Black','#1C1C1E','128GB',NULL,NULL,1),
    ('var-15p-wht-256','mod-15plus','White','#F5F5F0','256GB',NULL,NULL,1)`,
    [],
  );

  // Variants — iPhone 14 Pro Max / Pro / 14 / Plus
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-14pm-sb-128','mod-14promax','Space Black','#1C1C1E','128GB',NULL,NULL,1),
    ('var-14pm-sb-256','mod-14promax','Space Black','#1C1C1E','256GB',NULL,NULL,1),
    ('var-14pm-si-128','mod-14promax','Silver','#E8E3DC','128GB',NULL,NULL,1),
    ('var-14pm-go-256','mod-14promax','Gold','#B8975A','256GB',NULL,NULL,1),
    ('var-14pm-dp-256','mod-14promax','Deep Purple','#4B3F72','256GB',NULL,NULL,1),
    ('var-14p-sb-128','mod-14pro','Space Black','#1C1C1E','128GB',NULL,NULL,1),
    ('var-14p-si-128','mod-14pro','Silver','#E8E3DC','128GB',NULL,NULL,1),
    ('var-14p-go-256','mod-14pro','Gold','#B8975A','256GB',NULL,NULL,1),
    ('var-14p-dp-128','mod-14pro','Deep Purple','#4B3F72','128GB',NULL,NULL,1),
    ('var-14-mid-128','mod-14','Midnight','#1C1C1E','128GB',NULL,NULL,1),
    ('var-14-mid-256','mod-14','Midnight','#1C1C1E','256GB',NULL,NULL,1),
    ('var-14-sl-128','mod-14','Starlight','#F5F0E8','128GB',NULL,NULL,1),
    ('var-14-bl-128','mod-14','Blue','#4A7BA8','128GB',NULL,NULL,1),
    ('var-14-pu-128','mod-14','Purple','#9B7FB6','128GB',NULL,NULL,1),
    ('var-14-rd-128','mod-14','(PRODUCT)RED','#CC0000','128GB',NULL,NULL,1),
    ('var-14-yl-128','mod-14','Yellow','#F5E642','128GB',NULL,NULL,1),
    ('var-14pl-mid-128','mod-14plus','Midnight','#1C1C1E','128GB',NULL,NULL,1),
    ('var-14pl-sl-256','mod-14plus','Starlight','#F5F0E8','256GB',NULL,NULL,1)`,
    [],
  );

  // Variants — iPhone 13 Pro Max / Pro / 13 / mini
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-13pm-gr-128','mod-13promax','Graphite','#54524F','128GB',NULL,NULL,1),
    ('var-13pm-gr-256','mod-13promax','Graphite','#54524F','256GB',NULL,NULL,1),
    ('var-13pm-si-128','mod-13promax','Silver','#E8E3DC','128GB',NULL,NULL,1),
    ('var-13pm-go-256','mod-13promax','Gold','#B8975A','256GB',NULL,NULL,1),
    ('var-13pm-ag-256','mod-13promax','Alpine Green','#576856','256GB',NULL,NULL,1),
    ('var-13pm-sb-512','mod-13promax','Sierra Blue','#A0B8CC','512GB',NULL,NULL,1),
    ('var-13p-gr-128','mod-13pro','Graphite','#54524F','128GB',NULL,NULL,1),
    ('var-13p-si-128','mod-13pro','Silver','#E8E3DC','128GB',NULL,NULL,1),
    ('var-13p-go-256','mod-13pro','Gold','#B8975A','256GB',NULL,NULL,1),
    ('var-13p-ag-128','mod-13pro','Alpine Green','#576856','128GB',NULL,NULL,1),
    ('var-13p-sb-256','mod-13pro','Sierra Blue','#A0B8CC','256GB',NULL,NULL,1),
    ('var-13-mid-128','mod-13','Midnight','#1C1C1E','128GB',NULL,NULL,1),
    ('var-13-sl-128','mod-13','Starlight','#F5F0E8','128GB',NULL,NULL,1),
    ('var-13-pnk-128','mod-13','Pink','#F2A7B0','128GB',NULL,NULL,1),
    ('var-13-bl-128','mod-13','Blue','#4A7BA8','128GB',NULL,NULL,1),
    ('var-13-gr-128','mod-13','Green','#4A7B5C','128GB',NULL,NULL,1),
    ('var-13-rd-128','mod-13','(PRODUCT)RED','#CC0000','128GB',NULL,NULL,1),
    ('var-13-mid-256','mod-13','Midnight','#1C1C1E','256GB',NULL,NULL,1),
    ('var-13m-mid-128','mod-13mini','Midnight','#1C1C1E','128GB',NULL,NULL,1),
    ('var-13m-sl-128','mod-13mini','Starlight','#F5F0E8','128GB',NULL,NULL,1),
    ('var-13m-pnk-128','mod-13mini','Pink','#F2A7B0','128GB',NULL,NULL,1),
    ('var-13m-bl-128','mod-13mini','Blue','#4A7BA8','128GB',NULL,NULL,1),
    ('var-13m-rd-128','mod-13mini','(PRODUCT)RED','#CC0000','128GB',NULL,NULL,1)`,
    [],
  );

  // Variants — iPhone 12 series
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-12pm-gr-128','mod-12promax','Graphite','#54524F','128GB',NULL,NULL,1),
    ('var-12pm-si-128','mod-12promax','Silver','#E8E3DC','128GB',NULL,NULL,1),
    ('var-12pm-go-256','mod-12promax','Gold','#B8975A','256GB',NULL,NULL,1),
    ('var-12pm-pb-256','mod-12promax','Pacific Blue','#2E6B9E','256GB',NULL,NULL,1),
    ('var-12p-gr-128','mod-12pro','Graphite','#54524F','128GB',NULL,NULL,1),
    ('var-12p-si-128','mod-12pro','Silver','#E8E3DC','128GB',NULL,NULL,1),
    ('var-12p-go-128','mod-12pro','Gold','#B8975A','128GB',NULL,NULL,1),
    ('var-12p-pb-128','mod-12pro','Pacific Blue','#2E6B9E','128GB',NULL,NULL,1),
    ('var-12-blk-64','mod-12','Black','#1C1C1E','64GB',NULL,NULL,1),
    ('var-12-wht-64','mod-12','White','#F5F5F0','64GB',NULL,NULL,1),
    ('var-12-bl-64','mod-12','Blue','#4A7BA8','64GB',NULL,NULL,1),
    ('var-12-gr-128','mod-12','Green','#4A7B5C','128GB',NULL,NULL,1),
    ('var-12-rd-64','mod-12','(PRODUCT)RED','#CC0000','64GB',NULL,NULL,1),
    ('var-12m-blk-64','mod-12mini','Black','#1C1C1E','64GB',NULL,NULL,1),
    ('var-12m-wht-64','mod-12mini','White','#F5F5F0','64GB',NULL,NULL,1),
    ('var-12m-bl-64','mod-12mini','Blue','#4A7BA8','64GB',NULL,NULL,1),
    ('var-12m-rd-64','mod-12mini','(PRODUCT)RED','#CC0000','64GB',NULL,NULL,1)`,
    [],
  );

  // Variants — iPhone 11 series
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-11pm-sg-64','mod-11promax','Space Gray','#57534E','64GB',NULL,NULL,1),
    ('var-11pm-si-64','mod-11promax','Silver','#E8E3DC','64GB',NULL,NULL,1),
    ('var-11pm-go-64','mod-11promax','Gold','#B8975A','64GB',NULL,NULL,1),
    ('var-11pm-mg-256','mod-11promax','Midnight Green','#3D5A4C','256GB',NULL,NULL,1),
    ('var-11p-sg-64','mod-11pro','Space Gray','#57534E','64GB',NULL,NULL,1),
    ('var-11p-si-64','mod-11pro','Silver','#E8E3DC','64GB',NULL,NULL,1),
    ('var-11p-go-64','mod-11pro','Gold','#B8975A','64GB',NULL,NULL,1),
    ('var-11p-mg-64','mod-11pro','Midnight Green','#3D5A4C','64GB',NULL,NULL,1),
    ('var-11-blk-64','mod-11','Black','#1C1C1E','64GB',NULL,NULL,1),
    ('var-11-wht-64','mod-11','White','#F5F5F0','64GB',NULL,NULL,1),
    ('var-11-gr-64','mod-11','Green','#4A7B5C','64GB',NULL,NULL,1),
    ('var-11-yl-64','mod-11','Yellow','#F5E642','64GB',NULL,NULL,1),
    ('var-11-pu-64','mod-11','Purple','#9B7FB6','64GB',NULL,NULL,1),
    ('var-11-rd-64','mod-11','(PRODUCT)RED','#CC0000','64GB',NULL,NULL,1),
    ('var-11-blk-128','mod-11','Black','#1C1C1E','128GB',NULL,NULL,1)`,
    [],
  );

  // Variants — iPhone X series
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-xsm-sg-64','mod-xsmax','Space Gray','#57534E','64GB',NULL,NULL,1),
    ('var-xsm-si-64','mod-xsmax','Silver','#E8E3DC','64GB',NULL,NULL,1),
    ('var-xsm-go-64','mod-xsmax','Gold','#B8975A','64GB',NULL,NULL,1),
    ('var-xsm-sg-256','mod-xsmax','Space Gray','#57534E','256GB',NULL,NULL,1),
    ('var-xs-sg-64','mod-xs','Space Gray','#57534E','64GB',NULL,NULL,1),
    ('var-xs-si-64','mod-xs','Silver','#E8E3DC','64GB',NULL,NULL,1),
    ('var-xs-go-64','mod-xs','Gold','#B8975A','64GB',NULL,NULL,1),
    ('var-xs-sg-256','mod-xs','Space Gray','#57534E','256GB',NULL,NULL,1),
    ('var-xs-si-512','mod-xs','Silver','#E8E3DC','512GB',NULL,NULL,1),
    ('var-xr-blk-64','mod-xr','Black','#1C1C1E','64GB',NULL,NULL,1),
    ('var-xr-wht-64','mod-xr','White','#F5F5F0','64GB',NULL,NULL,1),
    ('var-xr-bl-64','mod-xr','Blue','#4A7BA8','64GB',NULL,NULL,1),
    ('var-xr-co-64','mod-xr','Coral','#E8725A','64GB',NULL,NULL,1),
    ('var-xr-yl-64','mod-xr','Yellow','#F5E642','64GB',NULL,NULL,1),
    ('var-xr-rd-64','mod-xr','(PRODUCT)RED','#CC0000','64GB',NULL,NULL,1),
    ('var-xr-blk-128','mod-xr','Black','#1C1C1E','128GB',NULL,NULL,1),
    ('var-x-sg-64','mod-x','Space Gray','#57534E','64GB',NULL,NULL,1),
    ('var-x-si-64','mod-x','Silver','#E8E3DC','64GB',NULL,NULL,1),
    ('var-x-sg-256','mod-x','Space Gray','#57534E','256GB',NULL,NULL,1)`,
    [],
  );

  // Variants — iPhone SE / 8 / 7
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-se3-blk-64','mod-se3','Black','#1C1C1E','64GB',NULL,NULL,1),
    ('var-se3-wht-64','mod-se3','White','#F5F5F0','64GB',NULL,NULL,1),
    ('var-se3-rd-64','mod-se3','(PRODUCT)RED','#CC0000','64GB',NULL,NULL,1),
    ('var-se3-blk-128','mod-se3','Black','#1C1C1E','128GB',NULL,NULL,1),
    ('var-se3-wht-256','mod-se3','White','#F5F5F0','256GB',NULL,NULL,1),
    ('var-se2-blk-64','mod-se2','Black','#1C1C1E','64GB',NULL,NULL,1),
    ('var-se2-wht-64','mod-se2','White','#F5F5F0','64GB',NULL,NULL,1),
    ('var-se2-rd-64','mod-se2','(PRODUCT)RED','#CC0000','64GB',NULL,NULL,1),
    ('var-se2-blk-128','mod-se2','Black','#1C1C1E','128GB',NULL,NULL,1),
    ('var-8p-blk-64','mod-8plus','Black','#1C1C1E','64GB',NULL,NULL,1),
    ('var-8p-si-64','mod-8plus','Silver','#E8E3DC','64GB',NULL,NULL,1),
    ('var-8p-go-64','mod-8plus','Gold','#B8975A','64GB',NULL,NULL,1),
    ('var-8p-rd-64','mod-8plus','(PRODUCT)RED','#CC0000','64GB',NULL,NULL,1),
    ('var-8-blk-64','mod-8','Black','#1C1C1E','64GB',NULL,NULL,1),
    ('var-8-si-64','mod-8','Silver','#E8E3DC','64GB',NULL,NULL,1),
    ('var-8-go-64','mod-8','Gold','#B8975A','64GB',NULL,NULL,1),
    ('var-8-rd-64','mod-8','(PRODUCT)RED','#CC0000','64GB',NULL,NULL,1),
    ('var-7p-mb-32','mod-7plus','Matte Black','#2C2C2C','32GB',NULL,NULL,1),
    ('var-7p-si-32','mod-7plus','Silver','#E8E3DC','32GB',NULL,NULL,1),
    ('var-7p-go-128','mod-7plus','Gold','#B8975A','128GB',NULL,NULL,1),
    ('var-7p-rg-32','mod-7plus','Rose Gold','#E8B4A0','32GB',NULL,NULL,1),
    ('var-7-mb-32','mod-7','Matte Black','#2C2C2C','32GB',NULL,NULL,1),
    ('var-7-si-32','mod-7','Silver','#E8E3DC','32GB',NULL,NULL,1),
    ('var-7-go-32','mod-7','Gold','#B8975A','32GB',NULL,NULL,1),
    ('var-7-rg-32','mod-7','Rose Gold','#E8B4A0','32GB',NULL,NULL,1),
    ('var-7-rd-32','mod-7','(PRODUCT)RED','#CC0000','32GB',NULL,NULL,1)`,
    [],
  );

  // Variants — iPad
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-pp13-si-256','mod-ipadpro13m4','Silver','#E8E3DC','256GB',NULL,NULL,1),
    ('var-pp13-si-512','mod-ipadpro13m4','Silver','#E8E3DC','512GB',NULL,NULL,1),
    ('var-pp13-si-1tb','mod-ipadpro13m4','Silver','#E8E3DC','1TB',NULL,NULL,1),
    ('var-pp13-sb-256','mod-ipadpro13m4','Space Black','#1C1C1E','256GB',NULL,NULL,1),
    ('var-pp13-sb-512','mod-ipadpro13m4','Space Black','#1C1C1E','512GB',NULL,NULL,1),
    ('var-pp11-si-256','mod-ipadpro11m4','Silver','#E8E3DC','256GB',NULL,NULL,1),
    ('var-pp11-si-512','mod-ipadpro11m4','Silver','#E8E3DC','512GB',NULL,NULL,1),
    ('var-pp11-sb-256','mod-ipadpro11m4','Space Black','#1C1C1E','256GB',NULL,NULL,1),
    ('var-pp11-sb-512','mod-ipadpro11m4','Space Black','#1C1C1E','512GB',NULL,NULL,1),
    ('var-pa13-bl-128','mod-ipadairm3-13','Blue','#4A7BA8','128GB',NULL,NULL,1),
    ('var-pa13-pu-128','mod-ipadairm3-13','Purple','#9B7FB6','128GB',NULL,NULL,1),
    ('var-pa13-sl-128','mod-ipadairm3-13','Starlight','#F5F0E8','128GB',NULL,NULL,1),
    ('var-pa13-sg-128','mod-ipadairm3-13','Space Gray','#57534E','128GB',NULL,NULL,1),
    ('var-pa11-bl-128','mod-ipadairm3-11','Blue','#4A7BA8','128GB',NULL,NULL,1),
    ('var-pa11-pu-128','mod-ipadairm3-11','Purple','#9B7FB6','128GB',NULL,NULL,1),
    ('var-pa11-sl-128','mod-ipadairm3-11','Starlight','#F5F0E8','128GB',NULL,NULL,1),
    ('var-pa11-sg-128','mod-ipadairm3-11','Space Gray','#57534E','128GB',NULL,NULL,1),
    ('var-pa11-bl-256','mod-ipadairm3-11','Blue','#4A7BA8','256GB',NULL,NULL,1),
    ('var-pm-bl-128','mod-ipadmini7','Blue','#4A7BA8','128GB',NULL,NULL,1),
    ('var-pm-pu-128','mod-ipadmini7','Purple','#9B7FB6','128GB',NULL,NULL,1),
    ('var-pm-sl-128','mod-ipadmini7','Starlight','#F5F0E8','128GB',NULL,NULL,1),
    ('var-pm-sg-128','mod-ipadmini7','Space Gray','#57534E','128GB',NULL,NULL,1),
    ('var-pm-bl-256','mod-ipadmini7','Blue','#4A7BA8','256GB',NULL,NULL,1),
    ('var-pi-si-128','mod-ipad11','Silver','#E8E3DC','128GB',NULL,NULL,1),
    ('var-pi-bl-128','mod-ipad11','Blue','#4A7BA8','128GB',NULL,NULL,1),
    ('var-pi-pnk-128','mod-ipad11','Pink','#F2A7B0','128GB',NULL,NULL,1),
    ('var-pi-yl-128','mod-ipad11','Yellow','#F5E642','128GB',NULL,NULL,1),
    ('var-pi-si-256','mod-ipad11','Silver','#E8E3DC','256GB',NULL,NULL,1)`,
    [],
  );
}

/**
 * Refresca el catálogo de iPhone: borra todos los modelos+variantes y los
 * re-inserta desde la fuente de verdad de abajo. Idempotente — corre en cada
 * boot. Mantiene los `model_id` estables, así workspace_featured_models y
 * cualquier referencia se preserva.
 */
type IphoneSeed = {
  id: string;
  familyId: string;
  name: string;
  sortOrder: number;
  fileBase: string; // "iPhone_17_Pro_Max" → arma /src/assets/products/iphones/iPhone_17_Pro_Max_<Color>.jpg
  defaultColor: string; // file color suffix para image_path del modelo
  storages: string[];
  colors: Array<{ code: string; name: string; hex: string; file: string }>;
};

const IPHONE_SEED: IphoneSeed[] = [
  // ─── iPhone 17 family ───────────────────────────────────────────────
  {
    id: "mod-17promax", familyId: "fam-17", name: "iPhone 17 Pro Max", sortOrder: 0,
    fileBase: "iPhone_17_Pro_Max", defaultColor: "Cosmic_Orange",
    storages: ["256GB", "512GB", "1TB", "2TB"],
    colors: [
      { code: "co", name: "Cosmic Orange", hex: "#D4621A", file: "Cosmic_Orange" },
      { code: "db", name: "Deep Blue", hex: "#1B3A6B", file: "Deep_Blue" },
      { code: "si", name: "Silver", hex: "#E8E3DC", file: "Silver" },
    ],
  },
  {
    id: "mod-17pro", familyId: "fam-17", name: "iPhone 17 Pro", sortOrder: 1,
    fileBase: "iPhone_17_Pro", defaultColor: "Cosmic_Orange",
    storages: ["256GB", "512GB", "1TB"],
    colors: [
      { code: "co", name: "Cosmic Orange", hex: "#D4621A", file: "Cosmic_Orange" },
      { code: "db", name: "Deep Blue", hex: "#1B3A6B", file: "Deep_Blue" },
      { code: "si", name: "Silver", hex: "#E8E3DC", file: "Silver" },
    ],
  },
  {
    id: "mod-air", familyId: "fam-17", name: "iPhone Air", sortOrder: 2,
    fileBase: "iPhone_Air", defaultColor: "Sky_Blue",
    storages: ["256GB", "512GB", "1TB"],
    colors: [
      { code: "sb", name: "Space Black", hex: "#1C1C1E", file: "Space_Black" },
      { code: "cw", name: "Cloud White", hex: "#F5F5F0", file: "Cloud_White" },
      { code: "lg", name: "Light Gold", hex: "#E8D5A3", file: "Light_Gold" },
      { code: "sky", name: "Sky Blue", hex: "#8BBCD4", file: "Sky_Blue" },
    ],
  },
  {
    id: "mod-17", familyId: "fam-17", name: "iPhone 17", sortOrder: 3,
    fileBase: "iPhone_17", defaultColor: "Mist_Blue",
    storages: ["256GB", "512GB"],
    colors: [
      { code: "blk", name: "Black", hex: "#1C1C1E", file: "Black" },
      { code: "wht", name: "White", hex: "#F5F5F0", file: "White" },
      { code: "mb", name: "Mist Blue", hex: "#A8C4D4", file: "Mist_Blue" },
      { code: "sg", name: "Sage", hex: "#8FAF8C", file: "Sage" },
      { code: "lv", name: "Lavender", hex: "#C4B8D4", file: "Lavender" },
    ],
  },
  {
    id: "mod-17e", familyId: "fam-17", name: "iPhone 17e", sortOrder: 4,
    fileBase: "iPhone_17e", defaultColor: "Black",
    storages: ["128GB", "256GB"],
    colors: [
      { code: "blk", name: "Black", hex: "#1C1C1E", file: "Black" },
      { code: "wht", name: "White", hex: "#F5F5F0", file: "White" },
      { code: "pnk", name: "Pink", hex: "#F2A7B0", file: "Pink" },
    ],
  },

  // ─── iPhone 16 family ───────────────────────────────────────────────
  {
    id: "mod-16promax", familyId: "fam-16", name: "iPhone 16 Pro Max", sortOrder: 0,
    fileBase: "iPhone_16_Pro_Max", defaultColor: "Black_Titanium",
    storages: ["256GB", "512GB", "1TB"],
    colors: [
      { code: "bt", name: "Black Titanium", hex: "#2C2C2C", file: "Black_Titanium" },
      { code: "nt", name: "Natural Titanium", hex: "#C5B9A8", file: "Natural_Titanium" },
      { code: "wt", name: "White Titanium", hex: "#E8E3DC", file: "White_Titanium" },
      { code: "dt", name: "Desert Titanium", hex: "#D4B896", file: "Desert_Titanium" },
    ],
  },
  {
    id: "mod-16pro", familyId: "fam-16", name: "iPhone 16 Pro", sortOrder: 1,
    fileBase: "iPhone_16_Pro", defaultColor: "Black_Titanium",
    storages: ["128GB", "256GB", "512GB", "1TB"],
    colors: [
      { code: "bt", name: "Black Titanium", hex: "#2C2C2C", file: "Black_Titanium" },
      { code: "nt", name: "Natural Titanium", hex: "#C5B9A8", file: "Natural_Titanium" },
      { code: "wt", name: "White Titanium", hex: "#E8E3DC", file: "White_Titanium" },
      { code: "dt", name: "Desert Titanium", hex: "#D4B896", file: "Desert_Titanium" },
    ],
  },
  {
    id: "mod-16plus", familyId: "fam-16", name: "iPhone 16 Plus", sortOrder: 2,
    fileBase: "iPhone_16_Plus", defaultColor: "Ultramarine",
    storages: ["128GB", "256GB", "512GB"],
    colors: [
      { code: "blk", name: "Black", hex: "#1C1C1E", file: "Black" },
      { code: "wht", name: "White", hex: "#F5F5F0", file: "White" },
      { code: "pnk", name: "Pink", hex: "#F2A7B0", file: "Pink" },
      { code: "tel", name: "Teal", hex: "#5B9EA0", file: "Teal" },
      { code: "ult", name: "Ultramarine", hex: "#3B5BA5", file: "Ultramarine" },
    ],
  },
  {
    id: "mod-16", familyId: "fam-16", name: "iPhone 16", sortOrder: 3,
    fileBase: "iPhone_16", defaultColor: "Ultramarine",
    storages: ["128GB", "256GB", "512GB"],
    colors: [
      { code: "blk", name: "Black", hex: "#1C1C1E", file: "Black" },
      { code: "wht", name: "White", hex: "#F5F5F0", file: "White" },
      { code: "pnk", name: "Pink", hex: "#F2A7B0", file: "Pink" },
      { code: "tel", name: "Teal", hex: "#5B9EA0", file: "Teal" },
      { code: "ult", name: "Ultramarine", hex: "#3B5BA5", file: "Ultramarine" },
    ],
  },
  {
    id: "mod-16e", familyId: "fam-16", name: "iPhone 16e", sortOrder: 4,
    fileBase: "iPhone_16e", defaultColor: "Black",
    storages: ["128GB", "256GB"],
    colors: [
      { code: "blk", name: "Black", hex: "#1C1C1E", file: "Black" },
      { code: "wht", name: "White", hex: "#F5F5F0", file: "White" },
    ],
  },

  // ─── iPhone 15 family ───────────────────────────────────────────────
  {
    id: "mod-15promax", familyId: "fam-15", name: "iPhone 15 Pro Max", sortOrder: 0,
    fileBase: "iPhone_15_Pro_Max", defaultColor: "Natural_Titanium",
    storages: ["256GB", "512GB", "1TB"],
    colors: [
      { code: "nt", name: "Natural Titanium", hex: "#C5B9A8", file: "Natural_Titanium" },
      { code: "bt", name: "Black Titanium", hex: "#2C2C2C", file: "Black_Titanium" },
      { code: "blut", name: "Blue Titanium", hex: "#4D5C73", file: "Blue_Titanium" },
      { code: "wt", name: "White Titanium", hex: "#E8E3DC", file: "White_Titanium" },
    ],
  },
  {
    id: "mod-15pro", familyId: "fam-15", name: "iPhone 15 Pro", sortOrder: 1,
    fileBase: "iPhone_15_Pro", defaultColor: "Natural_Titanium",
    storages: ["128GB", "256GB", "512GB", "1TB"],
    colors: [
      { code: "nt", name: "Natural Titanium", hex: "#C5B9A8", file: "Natural_Titanium" },
      { code: "bt", name: "Black Titanium", hex: "#2C2C2C", file: "Black_Titanium" },
      { code: "blut", name: "Blue Titanium", hex: "#4D5C73", file: "Blue_Titanium" },
      { code: "wt", name: "White Titanium", hex: "#E8E3DC", file: "White_Titanium" },
    ],
  },
  {
    id: "mod-15plus", familyId: "fam-15", name: "iPhone 15 Plus", sortOrder: 2,
    fileBase: "iPhone_15_Plus", defaultColor: "Pink",
    storages: ["128GB", "256GB", "512GB"],
    colors: [
      { code: "blk", name: "Black", hex: "#1C1C1E", file: "Black" },
      { code: "bl", name: "Blue", hex: "#A8C4DC", file: "Blue" },
      { code: "grn", name: "Green", hex: "#A8C8B0", file: "Green" },
      { code: "pnk", name: "Pink", hex: "#F2C8D0", file: "Pink" },
      { code: "yl", name: "Yellow", hex: "#F5E8A8", file: "Yellow" },
    ],
  },
  {
    id: "mod-15", familyId: "fam-15", name: "iPhone 15", sortOrder: 3,
    fileBase: "iPhone_15", defaultColor: "Pink",
    storages: ["128GB", "256GB", "512GB"],
    colors: [
      { code: "blk", name: "Black", hex: "#1C1C1E", file: "Black" },
      { code: "bl", name: "Blue", hex: "#A8C4DC", file: "Blue" },
      { code: "grn", name: "Green", hex: "#A8C8B0", file: "Green" },
      { code: "pnk", name: "Pink", hex: "#F2C8D0", file: "Pink" },
      { code: "yl", name: "Yellow", hex: "#F5E8A8", file: "Yellow" },
    ],
  },

  // ─── iPhone 14 family ───────────────────────────────────────────────
  {
    id: "mod-14promax", familyId: "fam-14", name: "iPhone 14 Pro Max", sortOrder: 0,
    fileBase: "iPhone_14_Pro_Max", defaultColor: "Deep_Purple",
    storages: ["128GB", "256GB", "512GB", "1TB"],
    colors: [
      { code: "dp", name: "Deep Purple", hex: "#4B3F72", file: "Deep_Purple" },
      { code: "go", name: "Gold", hex: "#B8975A", file: "Gold" },
      { code: "si", name: "Silver", hex: "#E8E3DC", file: "Silver" },
      { code: "sb", name: "Space Black", hex: "#1C1C1E", file: "Space_Black" },
    ],
  },
  {
    id: "mod-14pro", familyId: "fam-14", name: "iPhone 14 Pro", sortOrder: 1,
    fileBase: "iPhone_14_Pro", defaultColor: "Deep_Purple",
    storages: ["128GB", "256GB", "512GB", "1TB"],
    colors: [
      { code: "dp", name: "Deep Purple", hex: "#4B3F72", file: "Deep_Purple" },
      { code: "go", name: "Gold", hex: "#B8975A", file: "Gold" },
      { code: "si", name: "Silver", hex: "#E8E3DC", file: "Silver" },
      { code: "sb", name: "Space Black", hex: "#1C1C1E", file: "Space_Black" },
    ],
  },
  {
    id: "mod-14plus", familyId: "fam-14", name: "iPhone 14 Plus", sortOrder: 2,
    fileBase: "iPhone_14_Plus", defaultColor: "Purple",
    storages: ["128GB", "256GB", "512GB"],
    colors: [
      { code: "blu", name: "Blue", hex: "#A8C4DC", file: "Blue" },
      { code: "mid", name: "Midnight", hex: "#1C1C1E", file: "Midnight" },
      { code: "pur", name: "Purple", hex: "#C4B8D4", file: "Purple" },
      { code: "rd", name: "(PRODUCT)RED", hex: "#CC0000", file: "Red" },
      { code: "sl", name: "Starlight", hex: "#F5F0E8", file: "Starlight" },
      { code: "yl", name: "Yellow", hex: "#F5E8A8", file: "Yellow" },
    ],
  },
  {
    id: "mod-14", familyId: "fam-14", name: "iPhone 14", sortOrder: 3,
    fileBase: "iPhone_14", defaultColor: "Purple",
    storages: ["128GB", "256GB", "512GB"],
    colors: [
      { code: "blu", name: "Blue", hex: "#A8C4DC", file: "Blue" },
      { code: "mid", name: "Midnight", hex: "#1C1C1E", file: "Midnight" },
      { code: "pur", name: "Purple", hex: "#C4B8D4", file: "Purple" },
      { code: "rd", name: "(PRODUCT)RED", hex: "#CC0000", file: "Red" },
      { code: "sl", name: "Starlight", hex: "#F5F0E8", file: "Starlight" },
      { code: "yl", name: "Yellow", hex: "#F5E8A8", file: "Yellow" },
    ],
  },

  // ─── iPhone 13 family ───────────────────────────────────────────────
  {
    id: "mod-13promax", familyId: "fam-13", name: "iPhone 13 Pro Max", sortOrder: 0,
    fileBase: "iPhone_13_Pro_Max", defaultColor: "Sierra_Blue",
    storages: ["128GB", "256GB", "512GB", "1TB"],
    colors: [
      { code: "ag", name: "Alpine Green", hex: "#576856", file: "Alpine_Green" },
      { code: "go", name: "Gold", hex: "#B8975A", file: "Gold" },
      { code: "gr", name: "Graphite", hex: "#54524F", file: "Graphite" },
      { code: "sib", name: "Sierra Blue", hex: "#A0B8CC", file: "Sierra_Blue" },
      { code: "si", name: "Silver", hex: "#E8E3DC", file: "Silver" },
    ],
  },
  {
    id: "mod-13pro", familyId: "fam-13", name: "iPhone 13 Pro", sortOrder: 1,
    fileBase: "iPhone_13_Pro", defaultColor: "Sierra_Blue",
    storages: ["128GB", "256GB", "512GB", "1TB"],
    colors: [
      { code: "ag", name: "Alpine Green", hex: "#576856", file: "Alpine_Green" },
      { code: "go", name: "Gold", hex: "#B8975A", file: "Gold" },
      { code: "gr", name: "Graphite", hex: "#54524F", file: "Graphite" },
      { code: "sib", name: "Sierra Blue", hex: "#A0B8CC", file: "Sierra_Blue" },
      { code: "si", name: "Silver", hex: "#E8E3DC", file: "Silver" },
    ],
  },
  {
    id: "mod-13", familyId: "fam-13", name: "iPhone 13", sortOrder: 2,
    fileBase: "iPhone_13", defaultColor: "Pink",
    storages: ["128GB", "256GB", "512GB"],
    colors: [
      { code: "blu", name: "Blue", hex: "#A8C4DC", file: "Blue" },
      { code: "grn", name: "Green", hex: "#5C8FAF", file: "Green" },
      { code: "mid", name: "Midnight", hex: "#1C1C1E", file: "Midnight" },
      { code: "pnk", name: "Pink", hex: "#F2C8D0", file: "Pink" },
      { code: "rd", name: "(PRODUCT)RED", hex: "#CC0000", file: "Product_Red" },
      { code: "sl", name: "Starlight", hex: "#F5F0E8", file: "Starlight" },
    ],
  },
  {
    id: "mod-13mini", familyId: "fam-13", name: "iPhone 13 mini", sortOrder: 3,
    fileBase: "iPhone_13_Mini", defaultColor: "Pink",
    storages: ["128GB", "256GB", "512GB"],
    colors: [
      { code: "blu", name: "Blue", hex: "#A8C4DC", file: "Blue" },
      { code: "grn", name: "Green", hex: "#5C8FAF", file: "Green" },
      { code: "mid", name: "Midnight", hex: "#1C1C1E", file: "Midnight" },
      { code: "pnk", name: "Pink", hex: "#F2C8D0", file: "Pink" },
      { code: "rd", name: "(PRODUCT)RED", hex: "#CC0000", file: "Product_Red" },
      { code: "sl", name: "Starlight", hex: "#F5F0E8", file: "Starlight" },
    ],
  },

  // ─── iPhone 12 family ───────────────────────────────────────────────
  {
    id: "mod-12promax", familyId: "fam-12", name: "iPhone 12 Pro Max", sortOrder: 0,
    fileBase: "iPhone_12_Pro_Max", defaultColor: "Pacific_Blue",
    storages: ["128GB", "256GB", "512GB"],
    colors: [
      { code: "go", name: "Gold", hex: "#B8975A", file: "Gold" },
      { code: "gr", name: "Graphite", hex: "#54524F", file: "Graphite" },
      { code: "pb", name: "Pacific Blue", hex: "#2E6B9E", file: "Pacific_Blue" },
      { code: "si", name: "Silver", hex: "#E8E3DC", file: "Silver" },
    ],
  },
  {
    id: "mod-12pro", familyId: "fam-12", name: "iPhone 12 Pro", sortOrder: 1,
    fileBase: "iPhone_12_Pro", defaultColor: "Pacific_Blue",
    storages: ["128GB", "256GB", "512GB"],
    colors: [
      { code: "go", name: "Gold", hex: "#B8975A", file: "Gold" },
      { code: "gr", name: "Graphite", hex: "#54524F", file: "Graphite" },
      { code: "pb", name: "Pacific Blue", hex: "#2E6B9E", file: "Pacific_Blue" },
      { code: "si", name: "Silver", hex: "#E8E3DC", file: "Silver" },
    ],
  },
  {
    id: "mod-12", familyId: "fam-12", name: "iPhone 12", sortOrder: 2,
    fileBase: "iPhone_12", defaultColor: "Purple",
    storages: ["64GB", "128GB", "256GB"],
    colors: [
      { code: "blk", name: "Black", hex: "#1C1C1E", file: "Black" },
      { code: "blu", name: "Blue", hex: "#3D5078", file: "Blue" },
      { code: "grn", name: "Green", hex: "#A0C8B0", file: "Green" },
      { code: "pur", name: "Purple", hex: "#C4B0D8", file: "Purple" },
      { code: "rd", name: "(PRODUCT)RED", hex: "#CC0000", file: "Red" },
      { code: "wht", name: "White", hex: "#F5F5F0", file: "White" },
    ],
  },
  {
    id: "mod-12mini", familyId: "fam-12", name: "iPhone 12 mini", sortOrder: 3,
    fileBase: "iPhone_12_Mini", defaultColor: "Purple",
    storages: ["64GB", "128GB", "256GB"],
    colors: [
      { code: "blk", name: "Black", hex: "#1C1C1E", file: "Black" },
      { code: "blu", name: "Blue", hex: "#3D5078", file: "Blue" },
      { code: "grn", name: "Green", hex: "#A0C8B0", file: "Green" },
      { code: "pur", name: "Purple", hex: "#C4B0D8", file: "Purple" },
      { code: "rd", name: "(PRODUCT)RED", hex: "#CC0000", file: "Red" },
      { code: "wht", name: "White", hex: "#F5F5F0", file: "White" },
    ],
  },

  // ─── iPhone 11 family ───────────────────────────────────────────────
  {
    id: "mod-11promax", familyId: "fam-11", name: "iPhone 11 Pro Max", sortOrder: 0,
    fileBase: "iPhone_11_Pro_Max", defaultColor: "Midnightgreen",
    storages: ["64GB", "256GB", "512GB"],
    colors: [
      { code: "go", name: "Gold", hex: "#B8975A", file: "Gold" },
      { code: "mg", name: "Midnight Green", hex: "#3D5A4C", file: "Midnightgreen" },
      { code: "si", name: "Silver", hex: "#E8E3DC", file: "Silver" },
      { code: "sg", name: "Space Grey", hex: "#57534E", file: "Spacegrey" },
    ],
  },
  {
    id: "mod-11pro", familyId: "fam-11", name: "iPhone 11 Pro", sortOrder: 1,
    fileBase: "iPhone_11_Pro", defaultColor: "Midnightgreen",
    storages: ["64GB", "256GB", "512GB"],
    colors: [
      { code: "go", name: "Gold", hex: "#B8975A", file: "Gold" },
      { code: "mg", name: "Midnight Green", hex: "#3D5A4C", file: "Midnightgreen" },
      { code: "si", name: "Silver", hex: "#E8E3DC", file: "Silver" },
      { code: "sg", name: "Space Grey", hex: "#57534E", file: "Spacegrey" },
    ],
  },
  {
    id: "mod-11", familyId: "fam-11", name: "iPhone 11", sortOrder: 2,
    fileBase: "iPhone_11", defaultColor: "Purple",
    storages: ["64GB", "128GB", "256GB"],
    colors: [
      { code: "blk", name: "Black", hex: "#1C1C1E", file: "Black" },
      { code: "grn", name: "Green", hex: "#B0D4B0", file: "Green" },
      { code: "pur", name: "Purple", hex: "#D4B8D8", file: "Purple" },
      { code: "rd", name: "(PRODUCT)RED", hex: "#CC0000", file: "Red" },
      { code: "wht", name: "White", hex: "#F5F5F0", file: "White" },
      { code: "yl", name: "Yellow", hex: "#F5E08A", file: "Yellow" },
    ],
  },

  // ─── iPhone X Series ────────────────────────────────────────────────
  {
    id: "mod-xsmax", familyId: "fam-x", name: "iPhone XS Max", sortOrder: 0,
    fileBase: "iPhone_XS_Max", defaultColor: "Spacegray",
    storages: ["64GB", "256GB", "512GB"],
    colors: [
      { code: "go", name: "Gold", hex: "#B8975A", file: "Gold" },
      { code: "si", name: "Silver", hex: "#E8E3DC", file: "Silver" },
      { code: "sg", name: "Space Gray", hex: "#57534E", file: "Spacegray" },
    ],
  },
  {
    id: "mod-xs", familyId: "fam-x", name: "iPhone XS", sortOrder: 1,
    fileBase: "iPhone_XS", defaultColor: "Spacegray",
    storages: ["64GB", "256GB", "512GB"],
    colors: [
      { code: "go", name: "Gold", hex: "#B8975A", file: "Gold" },
      { code: "si", name: "Silver", hex: "#E8E3DC", file: "Silver" },
      { code: "sg", name: "Space Gray", hex: "#57534E", file: "Spacegray" },
    ],
  },
  {
    id: "mod-xr", familyId: "fam-x", name: "iPhone XR", sortOrder: 2,
    fileBase: "iPhone_XR", defaultColor: "Coral",
    storages: ["64GB", "128GB", "256GB"],
    colors: [
      { code: "blk", name: "Black", hex: "#1C1C1E", file: "Black" },
      { code: "blu", name: "Blue", hex: "#5C84B5", file: "Blue" },
      { code: "co", name: "Coral", hex: "#E89682", file: "Coral" },
      { code: "rd", name: "(PRODUCT)RED", hex: "#CC0000", file: "Red" },
      { code: "wht", name: "White", hex: "#F5F5F0", file: "White" },
      { code: "yl", name: "Yellow", hex: "#F5E08A", file: "Yellow" },
    ],
  },
  {
    id: "mod-x", familyId: "fam-x", name: "iPhone X", sortOrder: 3,
    fileBase: "iPhone_X", defaultColor: "Spacegray",
    storages: ["64GB", "256GB"],
    colors: [
      { code: "si", name: "Silver", hex: "#E8E3DC", file: "Silver" },
      { code: "sg", name: "Space Gray", hex: "#57534E", file: "Spacegray" },
    ],
  },

  // ─── iPhone SE ──────────────────────────────────────────────────────
  {
    id: "mod-se3", familyId: "fam-se", name: "iPhone SE (3rd Gen)", sortOrder: 0,
    fileBase: "iPhone_SE_3rd_Gen", defaultColor: "Starlight",
    storages: ["64GB", "128GB", "256GB"],
    colors: [
      { code: "mid", name: "Midnight", hex: "#1C1C1E", file: "Midnight" },
      { code: "rd", name: "(PRODUCT)RED", hex: "#CC0000", file: "Red" },
      { code: "sl", name: "Starlight", hex: "#F5F0E8", file: "Starlight" },
    ],
  },
  {
    id: "mod-se2", familyId: "fam-se", name: "iPhone SE (2nd Gen)", sortOrder: 1,
    fileBase: "iPhone_SE_2nd_Gen", defaultColor: "White",
    storages: ["64GB", "128GB", "256GB"],
    colors: [
      { code: "blk", name: "Black", hex: "#1C1C1E", file: "Black" },
      { code: "rd", name: "(PRODUCT)RED", hex: "#CC0000", file: "Red" },
      { code: "wht", name: "White", hex: "#F5F5F0", file: "White" },
    ],
  },

  // ─── iPhone 8 ───────────────────────────────────────────────────────
  {
    id: "mod-8plus", familyId: "fam-8", name: "iPhone 8 Plus", sortOrder: 0,
    fileBase: "iPhone_8_Plus", defaultColor: "Gold",
    storages: ["64GB", "128GB", "256GB"],
    colors: [
      { code: "go", name: "Gold", hex: "#E8C895", file: "Gold" },
      { code: "si", name: "Silver", hex: "#E8E3DC", file: "Silver" },
      { code: "sg", name: "Space Gray", hex: "#57534E", file: "Spacegray" },
    ],
  },
  {
    id: "mod-8", familyId: "fam-8", name: "iPhone 8", sortOrder: 1,
    fileBase: "iPhone_8", defaultColor: "Gold",
    storages: ["64GB", "128GB", "256GB"],
    colors: [
      { code: "go", name: "Gold", hex: "#E8C895", file: "Gold" },
      { code: "si", name: "Silver", hex: "#E8E3DC", file: "Silver" },
      { code: "sg", name: "Space Gray", hex: "#57534E", file: "Spacegray" },
    ],
  },

  // ─── iPhone 7 ───────────────────────────────────────────────────────
  {
    id: "mod-7plus", familyId: "fam-7", name: "iPhone 7 Plus", sortOrder: 0,
    fileBase: "iPhone_7_Plus", defaultColor: "Rosegold",
    storages: ["32GB", "128GB", "256GB"],
    colors: [
      { code: "blk", name: "Black", hex: "#1C1C1E", file: "Black" },
      { code: "go", name: "Gold", hex: "#E8C895", file: "Gold" },
      { code: "rg", name: "Rose Gold", hex: "#E8B5A8", file: "Rosegold" },
      { code: "si", name: "Silver", hex: "#E8E3DC", file: "Silver" },
    ],
  },
  {
    id: "mod-7", familyId: "fam-7", name: "iPhone 7", sortOrder: 1,
    fileBase: "iPhone_7", defaultColor: "Rosegold",
    storages: ["32GB", "128GB", "256GB"],
    colors: [
      { code: "blk", name: "Black", hex: "#1C1C1E", file: "Black" },
      { code: "go", name: "Gold", hex: "#E8C895", file: "Gold" },
      { code: "rg", name: "Rose Gold", hex: "#E8B5A8", file: "Rosegold" },
      { code: "si", name: "Silver", hex: "#E8E3DC", file: "Silver" },
    ],
  },
];

export async function refreshIphoneCatalog(): Promise<void> {
  // Borrar variantes y modelos iPhone existentes (mantenemos las familias)
  await dbExecute(
    `DELETE FROM product_variants WHERE model_id IN (
       SELECT id FROM product_models WHERE family_id IN (
         SELECT id FROM product_families WHERE category_id = 'cat-iphone'
       )
     )`,
    [],
  ).catch(() => {});
  await dbExecute(
    `DELETE FROM product_models WHERE family_id IN (
       SELECT id FROM product_families WHERE category_id = 'cat-iphone'
     )`,
    [],
  ).catch(() => {});

  // Re-insertar todos los modelos + variantes desde IPHONE_SEED
  for (const m of IPHONE_SEED) {
    const modelImage = `/src/assets/products/iphones/${m.fileBase}_${m.defaultColor}.jpg`;
    await dbExecute(
      `INSERT INTO product_models (id, family_id, name, image_path, sort_order) VALUES (?, ?, ?, ?, ?)`,
      [m.id, m.familyId, m.name, modelImage, m.sortOrder],
    );
    for (const c of m.colors) {
      const variantImage = `/src/assets/products/iphones/${m.fileBase}_${c.file}.jpg`;
      for (const s of m.storages) {
        const sCode = s.toLowerCase();
        const variantId = `var-${m.id.replace("mod-", "")}-${c.code}-${sCode}`;
        await dbExecute(
          `INSERT INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available)
           VALUES (?, ?, ?, ?, ?, NULL, ?, 1)`,
          [variantId, m.id, c.name, c.hex, s, variantImage],
        );
      }
    }
  }
}

// ─── Queries ──────────────────────────────────────────────────────

export async function getCategories(): Promise<ProductCategory[]> {
  return dbSelect<ProductCategory>(
    "SELECT * FROM product_categories ORDER BY sort_order",
    [],
  );
}

export async function getFamilies(categoryId: string): Promise<ProductFamily[]> {
  return dbSelect<ProductFamily>(
    "SELECT * FROM product_families WHERE category_id = ? ORDER BY sort_order",
    [categoryId],
  );
}

export async function getModels(familyId: string): Promise<ProductModel[]> {
  return dbSelect<ProductModel>(
    "SELECT * FROM product_models WHERE family_id = ? ORDER BY sort_order",
    [familyId],
  );
}

export async function getVariants(modelId: string): Promise<ProductVariant[]> {
  return dbSelect<ProductVariant>(
    "SELECT * FROM product_variants WHERE model_id = ? AND is_available = 1",
    [modelId],
  );
}

export async function getColorsForModel(modelId: string): Promise<ColorOption[]> {
  return dbSelect<ColorOption>(
    "SELECT DISTINCT color, color_hex FROM product_variants WHERE model_id = ? AND is_available = 1",
    [modelId],
  );
}

export async function getStorageForColor(
  modelId: string,
  color: string,
): Promise<string[]> {
  const rows = await dbSelect<{ storage: string }>(
    `SELECT DISTINCT storage FROM product_variants
     WHERE model_id = ? AND color = ? AND is_available = 1
     ORDER BY
       CASE storage
         WHEN '32GB'  THEN 1 WHEN '64GB'  THEN 2 WHEN '128GB' THEN 3
         WHEN '256GB' THEN 4 WHEN '512GB' THEN 5 WHEN '1TB'   THEN 6
         WHEN '2TB'   THEN 7 ELSE 8
       END`,
    [modelId, color],
  );
  return rows.map((r) => r.storage);
}

/**
 * Devuelve árbol categorías+familias con la imagen del modelo "representativo"
 * de cada nivel: prioriza modelo destacado por workspace; si no hay, primer
 * modelo por sort_order.
 */
export interface CategoryWithRep {
  category: ProductCategory;
  repImage: string | null;
  repModelId: string | null;
  repModelName: string | null;
  /** Color featured del modelo (o null si destacado sin color, o no destacado) */
  repColor: string | null;
  families: Array<{
    family: ProductFamily;
    repImage: string | null;
    repModelId: string | null;
    repModelName: string | null;
    repColor: string | null;
  }>;
}

export async function getCategoryFamilyTree(workspaceId: string): Promise<CategoryWithRep[]> {
  const cats = await getCategories();
  const featuredRows = await dbSelect<{ model_id: string; color: string | null }>(
    "SELECT model_id, color FROM workspace_featured_models WHERE workspace_id = ?",
    [workspaceId],
  ).catch(() => [] as Array<{ model_id: string; color: string | null }>);
  const featuredMap = new Map<string, string | null>();
  for (const r of featuredRows) featuredMap.set(r.model_id, r.color ?? null);

  const result: CategoryWithRep[] = [];
  for (const cat of cats) {
    const families = await getFamilies(cat.id);
    const familyEntries: CategoryWithRep["families"] = [];
    let categoryRepImage: string | null = null;
    let categoryRepModelId: string | null = null;
    let categoryRepModelName: string | null = null;
    let categoryRepColor: string | null = null;
    let categoryFromFeatured = false;

    for (const fam of families) {
      const models = await getModels(fam.id);
      const featuredModel = models.find((m) => featuredMap.has(m.id));
      const rep = featuredModel ?? models[0] ?? null;
      const repColor = rep ? featuredMap.get(rep.id) ?? null : null;
      familyEntries.push({
        family: fam,
        repImage: rep?.image_path ?? null,
        repModelId: rep?.id ?? null,
        repModelName: rep?.name ?? null,
        repColor,
      });
      if (!categoryRepImage && rep) {
        categoryRepImage = rep.image_path ?? null;
        categoryRepModelId = rep.id;
        categoryRepModelName = rep.name;
        categoryRepColor = repColor;
      }
      if (featuredModel && !categoryFromFeatured) {
        categoryRepImage = featuredModel.image_path ?? null;
        categoryRepModelId = featuredModel.id;
        categoryRepModelName = featuredModel.name;
        categoryRepColor = featuredMap.get(featuredModel.id) ?? null;
        categoryFromFeatured = true;
      }
    }
    result.push({
      category: cat,
      repImage: categoryRepImage,
      repModelId: categoryRepModelId,
      repModelName: categoryRepModelName,
      repColor: categoryRepColor,
      families: familyEntries,
    });
  }
  return result;
}

export async function resolveVariant(
  modelId: string,
  color: string,
  storage: string | null,
): Promise<ProductVariant | null> {
  const rows = storage !== null
    ? await dbSelect<ProductVariant>(
        "SELECT * FROM product_variants WHERE model_id = ? AND color = ? AND storage = ? LIMIT 1",
        [modelId, color, storage],
      )
    : await dbSelect<ProductVariant>(
        "SELECT * FROM product_variants WHERE model_id = ? AND color = ? AND storage IS NULL LIMIT 1",
        [modelId, color],
      );
  return rows[0] ?? null;
}

export function validateIMEI(imei: string): boolean {
  return /^\d{15}$/.test(imei.replace(/\s/g, ""));
}

export async function checkIMEIDuplicate(
  workspaceId: string,
  imei: string,
): Promise<boolean> {
  const rows = await dbSelect<{ id: string }>(
    "SELECT id FROM stock_items WHERE workspace_id = ? AND imei = ? AND status = 'available'",
    [workspaceId, imei],
  );
  return rows.length > 0;
}

export async function createStockItem(
  workspaceId: string,
  variantId: string,
  imei: string,
  notes?: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await dbExecute(
    "INSERT INTO stock_items (id, workspace_id, variant_id, imei, status, notes) VALUES (?,?,?,?,?,?)",
    [id, workspaceId, variantId, imei, "available", notes ?? null],
  );
  return id;
}

export async function getStockItems(
  workspaceId: string,
  filters?: { status?: string; search?: string },
): Promise<StockItemWithDetails[]> {
  let sql = `
    SELECT si.*, pv.color, pv.storage, pv.color_hex,
      pm.name as model_name, pm.image_path,
      pf.name as family_name, pc.name as category_name
    FROM stock_items si
    JOIN product_variants pv ON pv.id = si.variant_id
    JOIN product_models pm ON pm.id = pv.model_id
    JOIN product_families pf ON pf.id = pm.family_id
    JOIN product_categories pc ON pc.id = pf.category_id
    WHERE si.workspace_id = ?`;
  const params: unknown[] = [workspaceId];

  if (filters?.status && filters.status !== "all") {
    sql += " AND si.status = ?";
    params.push(filters.status);
  }
  if (filters?.search) {
    sql += " AND (si.imei LIKE ? OR pm.name LIKE ?)";
    const like = `%${filters.search}%`;
    params.push(like, like);
  }
  sql += " ORDER BY si.created_at DESC";

  return dbSelect<StockItemWithDetails>(sql, params);
}

export async function getStockSummary(workspaceId: string): Promise<StockSummary> {
  const rows = await dbSelect<StockSummary>(
    `SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'available' THEN 1 END) as available,
      COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold
     FROM stock_items WHERE workspace_id = ?`,
    [workspaceId],
  );
  return rows[0] ?? { total: 0, available: 0, sold: 0 };
}

export async function markStockItemSold(id: string): Promise<void> {
  await dbExecute(
    "UPDATE stock_items SET status = 'sold', sold_at = datetime('now') WHERE id = ?",
    [id],
  );
}

export async function deleteStockItem(id: string): Promise<void> {
  await dbExecute("DELETE FROM stock_items WHERE id = ?", [id]);
}

export interface AvailableUnit {
  id: string;
  imei: string;
  created_at: string;
}

export interface PreSelectedUnit {
  stockItemId: string;
  imei: string;
  variantId: string;
  modelName: string;
  color: string;
  storage: string | null;
  colorHex: string | null;
  imagePath: string | null;
}

export async function getAvailableIMEIsForVariant(
  workspaceId: string,
  variantId: string,
): Promise<AvailableUnit[]> {
  return dbSelect<AvailableUnit>(
    `SELECT id, imei, created_at FROM stock_items
     WHERE workspace_id = ? AND variant_id = ? AND status = 'available'
     ORDER BY created_at ASC`,
    [workspaceId, variantId],
  );
}

export async function markStockItemSoldWithSale(
  imei: string,
  workspaceId: string,
  saleId: string,
  customerName: string | null,
): Promise<void> {
  await dbExecute(
    `UPDATE stock_items SET status = 'sold', sold_at = datetime('now'), sale_id = ?, sold_to = ?
     WHERE imei = ? AND workspace_id = ? AND status = 'available'`,
    [saleId, customerName, imei, workspaceId],
  );
}

export interface StockItemByImei extends StockItemWithDetails {
  sold_to: string | null;
}

export async function getStockItemByImei(
  workspaceId: string,
  imei: string,
): Promise<StockItemByImei | null> {
  const rows = await dbSelect<StockItemByImei>(
    `SELECT si.*, pv.color, pv.storage, pv.color_hex,
       pm.name as model_name, pm.image_path,
       pf.name as family_name, pc.name as category_name
     FROM stock_items si
     JOIN product_variants pv ON pv.id = si.variant_id
     JOIN product_models pm ON pm.id = pv.model_id
     JOIN product_families pf ON pf.id = pm.family_id
     JOIN product_categories pc ON pc.id = pf.category_id
     WHERE si.workspace_id = ? AND si.imei = ?
     LIMIT 1`,
    [workspaceId, imei],
  );
  return rows[0] ?? null;
}

export interface ModelWithContext {
  model: ProductModel;
  family: ProductFamily;
  category: ProductCategory;
}

export async function findModelForItem(nameHint: string): Promise<ModelWithContext | null> {
  const rows = await dbSelect<
    ProductModel & { fam_id: string; fam_name: string; fam_sort: number; cat_id: string; cat_name: string; cat_emoji: string | null; cat_sort: number }
  >(
    `SELECT pm.*, pf.id as fam_id, pf.name as fam_name, pf.sort_order as fam_sort,
       pc.id as cat_id, pc.name as cat_name, pc.emoji as cat_emoji, pc.sort_order as cat_sort
     FROM product_models pm
     JOIN product_families pf ON pf.id = pm.family_id
     JOIN product_categories pc ON pc.id = pf.category_id
     WHERE pm.name LIKE ?
     ORDER BY LENGTH(pm.name) ASC
     LIMIT 1`,
    [`%${nameHint}%`],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    model: { id: r.id, family_id: r.family_id, name: r.name, image_path: r.image_path, sort_order: r.sort_order },
    family: { id: r.fam_id, category_id: r.cat_id, name: r.fam_name, sort_order: r.fam_sort },
    category: { id: r.cat_id, name: r.cat_name, emoji: r.cat_emoji, sort_order: r.cat_sort },
  };
}

// ─── Watch + Mac seed ─────────────────────────────────────────────

export async function seedWatchAndMac(): Promise<void> {
  // Check for AirPods Max 2 Midnight variant as indicator of full seed.
  // Using a variant (not a model) ensures we re-run if variants failed to insert.
  const check = await dbSelect<{ count: number }>(
    "SELECT COUNT(*) as count FROM product_variants WHERE id = 'var-apmax2-mi'",
    [],
  );
  if ((check[0]?.count ?? 0) > 0) return;

  // Watch families
  await dbExecute(
    `INSERT OR IGNORE INTO product_families (id, category_id, name, sort_order) VALUES
    ('fam-w11','cat-watch','Series 11',0),
    ('fam-w10','cat-watch','Series 10',1),
    ('fam-w9','cat-watch','Series 9',2),
    ('fam-w8','cat-watch','Series 8',3),
    ('fam-wu3','cat-watch','Ultra 3',10),
    ('fam-wu2','cat-watch','Ultra 2',11),
    ('fam-wu1','cat-watch','Ultra',12),
    ('fam-wse3','cat-watch','SE (3rd Gen)',20),
    ('fam-wse2','cat-watch','SE (2nd Gen)',21)`,
    [],
  );

  // Mac families
  await dbExecute(
    `INSERT OR IGNORE INTO product_families (id, category_id, name, sort_order) VALUES
    ('fam-mba','cat-mac','MacBook Air',0),
    ('fam-mbp','cat-mac','MacBook Pro',1),
    ('fam-imac','cat-mac','iMac',2),
    ('fam-macmini','cat-mac','Mac mini',3),
    ('fam-macstudio','cat-mac','Mac Studio',4),
    ('fam-mbkneo','cat-mac','MacBook Neo',5)`,
    [],
  );

  // Watch models
  await dbExecute(
    `INSERT OR IGNORE INTO product_models (id, family_id, name, image_path, sort_order) VALUES
    ('mod-w11-alum','fam-w11','Apple Watch Series 11 Aluminum','/src/assets/products/watch/series_11_aluminum_jet_black.jpg',0),
    ('mod-w11-ti',  'fam-w11','Apple Watch Series 11 Titanium', '/src/assets/products/watch/series_11_titanium_natural.jpg',1),
    ('mod-w10-alum','fam-w10','Apple Watch Series 10 Aluminum','/src/assets/products/watch/series_10_aluminum_jet_black.jpg',0),
    ('mod-w10-ti',  'fam-w10','Apple Watch Series 10 Titanium', '/src/assets/products/watch/series_10_titanium_natural.jpg',1),
    ('mod-w9',      'fam-w9', 'Apple Watch Series 9',           '/src/assets/products/watch/series_9_aluminum_midnight.jpg',0),
    ('mod-w8',      'fam-w8', 'Apple Watch Series 8',           '/src/assets/products/watch/series_8_aluminum_midnight.jpg',0),
    ('mod-wu3',     'fam-wu3','Apple Watch Ultra 3',            '/src/assets/products/watch/ultra_3_titanium_natural.jpg',0),
    ('mod-wu2',     'fam-wu2','Apple Watch Ultra 2',            '/src/assets/products/watch/ultra_2_titanium_natural.jpg',0),
    ('mod-wu1',     'fam-wu1','Apple Watch Ultra',              '/src/assets/products/watch/ultra_titanium_natural.jpg',0),
    ('mod-wse3',    'fam-wse3','Apple Watch SE (3rd Gen)',       '/src/assets/products/watch/se_3_aluminum_midnight.jpg',0),
    ('mod-wse2',    'fam-wse2','Apple Watch SE (2nd Gen)',       '/src/assets/products/watch/se_2_aluminum_midnight.jpg',0)`,
    [],
  );

  // Mac models
  await dbExecute(
    `INSERT OR IGNORE INTO product_models (id, family_id, name, image_path, sort_order) VALUES
    ('mod-mba13m5',  'fam-mba','MacBook Air 13" M5',     '/src/assets/products/mac/compare_macbook_air_m5_silver.jpg',0),
    ('mod-mba15m5',  'fam-mba','MacBook Air 15" M5',     '/src/assets/products/mac/compare_macbook_air_m5_15_silver.jpg',1),
    ('mod-mba13m4',  'fam-mba','MacBook Air 13" M4',     '/src/assets/products/mac/compare_macbook_air_mx_skyblue.jpg',2),
    ('mod-mba15m4',  'fam-mba','MacBook Air 15" M4',     '/src/assets/products/mac/compare_macbook_air_mx_15_silver.jpg',3),
    ('mod-mbp14m5',  'fam-mbp','MacBook Pro 14" M5',     '/src/assets/products/mac/compare_macbook_pro_m5_14_silver.jpg',0),
    ('mod-mbp16m5',  'fam-mbp','MacBook Pro 16" M5',     '/src/assets/products/mac/compare_macbook_pro_m5_16_silver.jpg',1),
    ('mod-mbp14m4',  'fam-mbp','MacBook Pro 14" M3/M4',  '/src/assets/products/mac/compare_macbook_pro_14_spaceblack.jpg',2),
    ('mod-mbp16m4',  'fam-mbp','MacBook Pro 16" M3/M4',  '/src/assets/products/mac/compare_macbook_pro_16_spaceblack.jpg',3),
    ('mod-imac24m4', 'fam-imac','iMac 24" M4',           '/src/assets/products/mac/compare_imac_24_m4_silver.jpg',0),
    ('mod-macminim4','fam-macmini','Mac mini M4',        '/src/assets/products/mac/compare_mac_mini_m4_silver.jpg',0),
    ('mod-macstudio','fam-macstudio','Mac Studio',       '/src/assets/products/mac/compare_mac_studio_silver.jpg',0),
    ('mod-mbkneo',   'fam-mbkneo','MacBook Neo A18 Pro', '/src/assets/products/mac/compare_macbook_neo_a18_silver.jpg',0)`,
    [],
  );

  // Watch variants — Series 11 + Series 10
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-w11a-jb-41','mod-w11-alum','Jet Black','#1C1C1E','41mm',NULL,NULL,1),
    ('var-w11a-jb-45','mod-w11-alum','Jet Black','#1C1C1E','45mm',NULL,NULL,1),
    ('var-w11a-rg-41','mod-w11-alum','Rose Gold','#E8B4A0','41mm',NULL,NULL,1),
    ('var-w11a-rg-45','mod-w11-alum','Rose Gold','#E8B4A0','45mm',NULL,NULL,1),
    ('var-w11a-sg-41','mod-w11-alum','Space Gray','#57534E','41mm',NULL,NULL,1),
    ('var-w11a-sg-45','mod-w11-alum','Space Gray','#57534E','45mm',NULL,NULL,1),
    ('var-w11a-si-41','mod-w11-alum','Silver','#E8E3DC','41mm',NULL,NULL,1),
    ('var-w11a-si-45','mod-w11-alum','Silver','#E8E3DC','45mm',NULL,NULL,1),
    ('var-w11t-nt-45','mod-w11-ti','Natural','#C5B9A8','45mm',NULL,NULL,1),
    ('var-w11t-sl-45','mod-w11-ti','Slate','#7A8C8F','45mm',NULL,NULL,1),
    ('var-w11t-go-45','mod-w11-ti','Gold','#B8975A','45mm',NULL,NULL,1),
    ('var-w10a-jb-42','mod-w10-alum','Jet Black','#1C1C1E','42mm',NULL,NULL,1),
    ('var-w10a-jb-46','mod-w10-alum','Jet Black','#1C1C1E','46mm',NULL,NULL,1),
    ('var-w10a-rg-42','mod-w10-alum','Rose Gold','#E8B4A0','42mm',NULL,NULL,1),
    ('var-w10a-rg-46','mod-w10-alum','Rose Gold','#E8B4A0','46mm',NULL,NULL,1),
    ('var-w10a-si-42','mod-w10-alum','Silver','#E8E3DC','42mm',NULL,NULL,1),
    ('var-w10a-si-46','mod-w10-alum','Silver','#E8E3DC','46mm',NULL,NULL,1),
    ('var-w10t-nt-46','mod-w10-ti','Natural','#C5B9A8','46mm',NULL,NULL,1),
    ('var-w10t-sl-46','mod-w10-ti','Slate','#7A8C8F','46mm',NULL,NULL,1),
    ('var-w10t-go-46','mod-w10-ti','Gold','#B8975A','46mm',NULL,NULL,1)`,
    [],
  );

  // Watch variants — Series 9, 8, Ultra 3, Ultra 2, Ultra 1
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-w9-mi-41','mod-w9','Midnight','#1C1C1E','41mm',NULL,NULL,1),
    ('var-w9-mi-45','mod-w9','Midnight','#1C1C1E','45mm',NULL,NULL,1),
    ('var-w8-mi-41','mod-w8','Midnight','#1C1C1E','41mm',NULL,NULL,1),
    ('var-w8-mi-45','mod-w8','Midnight','#1C1C1E','45mm',NULL,NULL,1),
    ('var-wu3-nt-49','mod-wu3','Natural Titanium','#C5B9A8','49mm',NULL,NULL,1),
    ('var-wu3-bt-49','mod-wu3','Black Titanium','#2C2C2C','49mm',NULL,NULL,1),
    ('var-wu2-nt-49','mod-wu2','Natural Titanium','#C5B9A8','49mm',NULL,NULL,1),
    ('var-wu2-bt-49','mod-wu2','Black Titanium','#2C2C2C','49mm',NULL,NULL,1),
    ('var-wu1-nt-49','mod-wu1','Natural Titanium','#C5B9A8','49mm',NULL,NULL,1)`,
    [],
  );

  // Watch variants — SE 3rd + SE 2nd Gen
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-wse3-mi-40','mod-wse3','Midnight','#1C1C1E','40mm',NULL,NULL,1),
    ('var-wse3-mi-44','mod-wse3','Midnight','#1C1C1E','44mm',NULL,NULL,1),
    ('var-wse3-st-40','mod-wse3','Starlight','#F5F0E8','40mm',NULL,NULL,1),
    ('var-wse3-st-44','mod-wse3','Starlight','#F5F0E8','44mm',NULL,NULL,1),
    ('var-wse2-mi-40','mod-wse2','Midnight','#1C1C1E','40mm',NULL,NULL,1),
    ('var-wse2-mi-44','mod-wse2','Midnight','#1C1C1E','44mm',NULL,NULL,1),
    ('var-wse2-si-40','mod-wse2','Silver','#E8E3DC','40mm',NULL,NULL,1),
    ('var-wse2-si-44','mod-wse2','Silver','#E8E3DC','44mm',NULL,NULL,1),
    ('var-wse2-st-40','mod-wse2','Starlight','#F5F0E8','40mm',NULL,NULL,1),
    ('var-wse2-st-44','mod-wse2','Starlight','#F5F0E8','44mm',NULL,NULL,1)`,
    [],
  );

  // Mac variants — MacBook Air 13" M5 + 15" M5
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-mba13m5-si-a','mod-mba13m5','Silver','#E8E3DC','16GB/256GB',NULL,NULL,1),
    ('var-mba13m5-si-b','mod-mba13m5','Silver','#E8E3DC','16GB/512GB',NULL,NULL,1),
    ('var-mba13m5-si-c','mod-mba13m5','Silver','#E8E3DC','24GB/512GB',NULL,NULL,1),
    ('var-mba13m5-si-d','mod-mba13m5','Silver','#E8E3DC','24GB/1TB',NULL,NULL,1),
    ('var-mba13m5-mi-a','mod-mba13m5','Midnight','#1C1C1E','16GB/256GB',NULL,NULL,1),
    ('var-mba13m5-mi-b','mod-mba13m5','Midnight','#1C1C1E','16GB/512GB',NULL,NULL,1),
    ('var-mba13m5-mi-c','mod-mba13m5','Midnight','#1C1C1E','24GB/512GB',NULL,NULL,1),
    ('var-mba13m5-mi-d','mod-mba13m5','Midnight','#1C1C1E','24GB/1TB',NULL,NULL,1),
    ('var-mba13m5-st-a','mod-mba13m5','Starlight','#F5F0E8','16GB/256GB',NULL,NULL,1),
    ('var-mba13m5-st-b','mod-mba13m5','Starlight','#F5F0E8','16GB/512GB',NULL,NULL,1),
    ('var-mba13m5-sk-a','mod-mba13m5','Sky Blue','#8BBCD4','16GB/256GB',NULL,NULL,1),
    ('var-mba13m5-sk-b','mod-mba13m5','Sky Blue','#8BBCD4','16GB/512GB',NULL,NULL,1),
    ('var-mba15m5-si-a','mod-mba15m5','Silver','#E8E3DC','16GB/256GB',NULL,NULL,1),
    ('var-mba15m5-si-b','mod-mba15m5','Silver','#E8E3DC','16GB/512GB',NULL,NULL,1),
    ('var-mba15m5-si-c','mod-mba15m5','Silver','#E8E3DC','24GB/512GB',NULL,NULL,1),
    ('var-mba15m5-si-d','mod-mba15m5','Silver','#E8E3DC','24GB/1TB',NULL,NULL,1),
    ('var-mba15m5-mi-a','mod-mba15m5','Midnight','#1C1C1E','16GB/256GB',NULL,NULL,1),
    ('var-mba15m5-mi-b','mod-mba15m5','Midnight','#1C1C1E','16GB/512GB',NULL,NULL,1),
    ('var-mba15m5-mi-c','mod-mba15m5','Midnight','#1C1C1E','24GB/512GB',NULL,NULL,1),
    ('var-mba15m5-mi-d','mod-mba15m5','Midnight','#1C1C1E','24GB/1TB',NULL,NULL,1),
    ('var-mba15m5-st-a','mod-mba15m5','Starlight','#F5F0E8','16GB/256GB',NULL,NULL,1),
    ('var-mba15m5-st-b','mod-mba15m5','Starlight','#F5F0E8','16GB/512GB',NULL,NULL,1),
    ('var-mba15m5-sk-a','mod-mba15m5','Sky Blue','#8BBCD4','16GB/256GB',NULL,NULL,1),
    ('var-mba15m5-sk-b','mod-mba15m5','Sky Blue','#8BBCD4','16GB/512GB',NULL,NULL,1)`,
    [],
  );

  // Mac variants — MacBook Air 13" M4 + 15" M4
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-mba13m4-sk-a','mod-mba13m4','Sky Blue','#8BBCD4','16GB/256GB',NULL,NULL,1),
    ('var-mba13m4-sk-b','mod-mba13m4','Sky Blue','#8BBCD4','16GB/512GB',NULL,NULL,1),
    ('var-mba13m4-sk-c','mod-mba13m4','Sky Blue','#8BBCD4','24GB/512GB',NULL,NULL,1),
    ('var-mba13m4-mi-a','mod-mba13m4','Midnight','#1C1C1E','16GB/256GB',NULL,NULL,1),
    ('var-mba13m4-mi-b','mod-mba13m4','Midnight','#1C1C1E','16GB/512GB',NULL,NULL,1),
    ('var-mba13m4-si-a','mod-mba13m4','Silver','#E8E3DC','16GB/256GB',NULL,NULL,1),
    ('var-mba13m4-si-b','mod-mba13m4','Silver','#E8E3DC','16GB/512GB',NULL,NULL,1),
    ('var-mba13m4-st-a','mod-mba13m4','Starlight','#F5F0E8','16GB/256GB',NULL,NULL,1),
    ('var-mba13m4-sg-a','mod-mba13m4','Space Gray','#57534E','16GB/256GB',NULL,NULL,1),
    ('var-mba13m4-sg-b','mod-mba13m4','Space Gray','#57534E','16GB/512GB',NULL,NULL,1),
    ('var-mba15m4-sk-a','mod-mba15m4','Sky Blue','#8BBCD4','16GB/256GB',NULL,NULL,1),
    ('var-mba15m4-sk-b','mod-mba15m4','Sky Blue','#8BBCD4','16GB/512GB',NULL,NULL,1),
    ('var-mba15m4-mi-a','mod-mba15m4','Midnight','#1C1C1E','16GB/256GB',NULL,NULL,1),
    ('var-mba15m4-mi-b','mod-mba15m4','Midnight','#1C1C1E','16GB/512GB',NULL,NULL,1),
    ('var-mba15m4-si-a','mod-mba15m4','Silver','#E8E3DC','16GB/256GB',NULL,NULL,1),
    ('var-mba15m4-si-b','mod-mba15m4','Silver','#E8E3DC','16GB/512GB',NULL,NULL,1),
    ('var-mba15m4-st-a','mod-mba15m4','Starlight','#F5F0E8','16GB/256GB',NULL,NULL,1),
    ('var-mba15m4-sg-a','mod-mba15m4','Space Gray','#57534E','16GB/256GB',NULL,NULL,1),
    ('var-mba15m4-sg-b','mod-mba15m4','Space Gray','#57534E','16GB/512GB',NULL,NULL,1)`,
    [],
  );

  // Mac variants — MacBook Pro 14/16 M5 + M3/M4
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-mbp14m5-si-a','mod-mbp14m5','Silver','#E8E3DC','24GB/512GB',NULL,NULL,1),
    ('var-mbp14m5-si-b','mod-mbp14m5','Silver','#E8E3DC','24GB/1TB',NULL,NULL,1),
    ('var-mbp14m5-si-c','mod-mbp14m5','Silver','#E8E3DC','36GB/1TB',NULL,NULL,1),
    ('var-mbp14m5-sb-a','mod-mbp14m5','Space Black','#1C1C2E','24GB/512GB',NULL,NULL,1),
    ('var-mbp14m5-sb-b','mod-mbp14m5','Space Black','#1C1C2E','24GB/1TB',NULL,NULL,1),
    ('var-mbp14m5-sb-c','mod-mbp14m5','Space Black','#1C1C2E','36GB/1TB',NULL,NULL,1),
    ('var-mbp16m5-si-a','mod-mbp16m5','Silver','#E8E3DC','24GB/512GB',NULL,NULL,1),
    ('var-mbp16m5-si-b','mod-mbp16m5','Silver','#E8E3DC','48GB/1TB',NULL,NULL,1),
    ('var-mbp16m5-si-c','mod-mbp16m5','Silver','#E8E3DC','48GB/2TB',NULL,NULL,1),
    ('var-mbp16m5-sb-a','mod-mbp16m5','Space Black','#1C1C2E','24GB/512GB',NULL,NULL,1),
    ('var-mbp16m5-sb-b','mod-mbp16m5','Space Black','#1C1C2E','48GB/1TB',NULL,NULL,1),
    ('var-mbp16m5-sb-c','mod-mbp16m5','Space Black','#1C1C2E','48GB/2TB',NULL,NULL,1),
    ('var-mbp14m4-sb-a','mod-mbp14m4','Space Black','#1C1C2E','18GB/512GB',NULL,NULL,1),
    ('var-mbp14m4-sb-b','mod-mbp14m4','Space Black','#1C1C2E','36GB/512GB',NULL,NULL,1),
    ('var-mbp14m4-sb-c','mod-mbp14m4','Space Black','#1C1C2E','36GB/1TB',NULL,NULL,1),
    ('var-mbp14m4-si-a','mod-mbp14m4','Silver','#E8E3DC','18GB/512GB',NULL,NULL,1),
    ('var-mbp14m4-si-b','mod-mbp14m4','Silver','#E8E3DC','36GB/1TB',NULL,NULL,1),
    ('var-mbp14m4-sg-a','mod-mbp14m4','Space Gray','#57534E','18GB/512GB',NULL,NULL,1),
    ('var-mbp16m4-sb-a','mod-mbp16m4','Space Black','#1C1C2E','24GB/512GB',NULL,NULL,1),
    ('var-mbp16m4-sb-b','mod-mbp16m4','Space Black','#1C1C2E','36GB/1TB',NULL,NULL,1),
    ('var-mbp16m4-sb-c','mod-mbp16m4','Space Black','#1C1C2E','48GB/1TB',NULL,NULL,1),
    ('var-mbp16m4-si-a','mod-mbp16m4','Silver','#E8E3DC','24GB/512GB',NULL,NULL,1),
    ('var-mbp16m4-si-b','mod-mbp16m4','Silver','#E8E3DC','36GB/1TB',NULL,NULL,1)`,
    [],
  );

  // Mac variants — iMac 24 M4 + Mac mini M4 + Mac Studio + MacBook Neo
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-imac24m4-pu-a','mod-imac24m4','Purple','#9B7FB6','16GB/256GB',NULL,NULL,1),
    ('var-imac24m4-pu-b','mod-imac24m4','Purple','#9B7FB6','24GB/512GB',NULL,NULL,1),
    ('var-imac24m4-gr-a','mod-imac24m4','Green','#4A7B5C','16GB/256GB',NULL,NULL,1),
    ('var-imac24m4-gr-b','mod-imac24m4','Green','#4A7B5C','24GB/512GB',NULL,NULL,1),
    ('var-imac24m4-ye-a','mod-imac24m4','Yellow','#F5E642','16GB/256GB',NULL,NULL,1),
    ('var-imac24m4-si-a','mod-imac24m4','Silver','#E8E3DC','16GB/256GB',NULL,NULL,1),
    ('var-imac24m4-si-b','mod-imac24m4','Silver','#E8E3DC','24GB/512GB',NULL,NULL,1),
    ('var-imac24m4-pk-a','mod-imac24m4','Pink','#F2A7B0','16GB/256GB',NULL,NULL,1),
    ('var-imac24m4-bl-a','mod-imac24m4','Blue','#4A7BA8','16GB/256GB',NULL,NULL,1),
    ('var-imac24m4-bl-b','mod-imac24m4','Blue','#4A7BA8','24GB/512GB',NULL,NULL,1),
    ('var-imac24m4-or-a','mod-imac24m4','Orange','#D4621A','16GB/256GB',NULL,NULL,1),
    ('var-imac24m4-or-b','mod-imac24m4','Orange','#D4621A','24GB/512GB',NULL,NULL,1),
    ('var-macminim4-si-a','mod-macminim4','Silver','#E8E3DC','16GB/256GB',NULL,NULL,1),
    ('var-macminim4-si-b','mod-macminim4','Silver','#E8E3DC','24GB/256GB',NULL,NULL,1),
    ('var-macminim4-si-c','mod-macminim4','Silver','#E8E3DC','16GB/512GB',NULL,NULL,1),
    ('var-macstudio-si-a','mod-macstudio','Silver','#E8E3DC','36GB/512GB',NULL,NULL,1),
    ('var-macstudio-si-b','mod-macstudio','Silver','#E8E3DC','64GB/1TB',NULL,NULL,1),
    ('var-mbkneo-si-a','mod-mbkneo','Silver','#E8E3DC','16GB/256GB',NULL,NULL,1),
    ('var-mbkneo-si-b','mod-mbkneo','Silver','#E8E3DC','32GB/512GB',NULL,NULL,1),
    ('var-mbkneo-bh-a','mod-mbkneo','Blush','#E8C4B8','16GB/256GB',NULL,NULL,1),
    ('var-mbkneo-bh-b','mod-mbkneo','Blush','#E8C4B8','32GB/512GB',NULL,NULL,1),
    ('var-mbkneo-ci-a','mod-mbkneo','Citrus','#D4A830','16GB/256GB',NULL,NULL,1),
    ('var-mbkneo-in-a','mod-mbkneo','Indigo','#3B4B9E','16GB/256GB',NULL,NULL,1),
    ('var-mbkneo-in-b','mod-mbkneo','Indigo','#3B4B9E','32GB/512GB',NULL,NULL,1)`,
    [],
  );

  // AirPods families
  await dbExecute(
    `INSERT OR IGNORE INTO product_families (id, category_id, name, sort_order) VALUES
    ('fam-appro','cat-airpods','AirPods Pro',0),
    ('fam-apmax','cat-airpods','AirPods Max',1),
    ('fam-ap',   'cat-airpods','AirPods',2)`,
    [],
  );

  // AirPods models
  await dbExecute(
    `INSERT OR IGNORE INTO product_models (id, family_id, name, image_path, sort_order) VALUES
    ('mod-appro3','fam-appro','AirPods Pro 3',       '/src/assets/products/airpods/AirPods_Pro_3_White.png',0),
    ('mod-appro2','fam-appro','AirPods Pro 2',       '/src/assets/products/airpods/AirPods_Pro_2_White.png',1),
    ('mod-apmax2','fam-apmax','AirPods Max 2',       '/src/assets/products/airpods/AirPods_Max_2_Midnight.png',0),
    ('mod-ap4',   'fam-ap',   'AirPods 4',           '/src/assets/products/airpods/AirPods_4_White.png',0),
    ('mod-ap3',   'fam-ap',   'AirPods (3rd Gen)',   '/src/assets/products/airpods/AirPods_3rd_Gen_White_MagSafe_Case.png',1),
    ('mod-ap2',   'fam-ap',   'AirPods (2nd Gen)',   '/src/assets/products/airpods/AirPods_2nd_Gen_White.png',2)`,
    [],
  );

  // AirPods variants
  await dbExecute(
    `INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
    ('var-appro3-wh',    'mod-appro3','White','#FAFAFA',NULL,NULL,NULL,1),
    ('var-appro2-wh-uc', 'mod-appro2','White','#FAFAFA','USB-C',NULL,NULL,1),
    ('var-appro2-wh-li', 'mod-appro2','White','#FAFAFA','Lightning',NULL,NULL,1),
    ('var-apmax2-mi',    'mod-apmax2','Midnight','#1C1C1E',NULL,NULL,NULL,1),
    ('var-apmax2-bl',    'mod-apmax2','Blue','#4A7BA8',NULL,NULL,NULL,1),
    ('var-apmax2-or',    'mod-apmax2','Orange','#D4621A',NULL,NULL,NULL,1),
    ('var-apmax2-pu',    'mod-apmax2','Purple','#9B7FB6',NULL,NULL,NULL,1),
    ('var-apmax2-st',    'mod-apmax2','Starlight','#F5F0E8',NULL,NULL,NULL,1),
    ('var-ap4-wh',       'mod-ap4',  'White','#FAFAFA',NULL,NULL,NULL,1),
    ('var-ap3-ms',       'mod-ap3',  'White','#FAFAFA','MagSafe',NULL,NULL,1),
    ('var-ap3-li',       'mod-ap3',  'White','#FAFAFA','Lightning',NULL,NULL,1),
    ('var-ap2-wh',       'mod-ap2',  'White','#FAFAFA',NULL,NULL,NULL,1)`,
    [],
  );
}
