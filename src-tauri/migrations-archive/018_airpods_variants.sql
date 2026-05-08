-- Fix: product_variants.storage was incorrectly NOT NULL — AirPods have no storage field.
-- Recreate the table with storage nullable, then insert the missing AirPods variants.

CREATE TABLE product_variants_new (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  color TEXT NOT NULL,
  color_hex TEXT,
  storage TEXT,
  sku TEXT,
  image_path TEXT,
  is_available INTEGER DEFAULT 1,
  FOREIGN KEY (model_id) REFERENCES product_models(id)
);

INSERT INTO product_variants_new SELECT * FROM product_variants;
DROP TABLE product_variants;
ALTER TABLE product_variants_new RENAME TO product_variants;

INSERT OR IGNORE INTO product_variants (id, model_id, color, color_hex, storage, sku, image_path, is_available) VALUES
('var-appro3-wh', 'mod-appro3', 'White',    '#FAFAFA', NULL, NULL, NULL, 1),
('var-apmax2-mi', 'mod-apmax2', 'Midnight', '#1C1C1E', NULL, NULL, NULL, 1),
('var-apmax2-bl', 'mod-apmax2', 'Blue',     '#4A7BA8', NULL, NULL, NULL, 1),
('var-apmax2-or', 'mod-apmax2', 'Orange',   '#D4621A', NULL, NULL, NULL, 1),
('var-apmax2-pu', 'mod-apmax2', 'Purple',   '#9B7FB6', NULL, NULL, NULL, 1),
('var-apmax2-st', 'mod-apmax2', 'Starlight','#F5F0E8', NULL, NULL, NULL, 1),
('var-ap4-wh',    'mod-ap4',   'White',    '#FAFAFA', NULL, NULL, NULL, 1),
('var-ap2-wh',    'mod-ap2',   'White',    '#FAFAFA', NULL, NULL, NULL, 1);
