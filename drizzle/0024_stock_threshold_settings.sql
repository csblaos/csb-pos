-- Add stock threshold settings (global store defaults and per-product overrides)
ALTER TABLE stores ADD COLUMN out_stock_threshold INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stores ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 10;

ALTER TABLE products ADD COLUMN out_stock_threshold INTEGER;
ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER;
