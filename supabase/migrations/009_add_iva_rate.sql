-- Add IVA rate to movement lines
ALTER TABLE stock_movement_lines
  ADD COLUMN IF NOT EXISTS iva_rate DECIMAL(5,4) NOT NULL DEFAULT 0;
