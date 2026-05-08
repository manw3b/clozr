ALTER TABLE catalog_items ADD COLUMN condition TEXT DEFAULT 'new';
ALTER TABLE catalog_items ADD COLUMN condition_details_json TEXT;
