-- ============================================================================
-- 016_stock_movement_types_extend.sql — Sprint 0 §1.4
-- Extend movement_type CHECK with new types used by future modules.
-- Add polymorphic source_type/source_id columns to link movements back to
-- their originating document (PO, work order, fuel dispensing, etc.).
-- ============================================================================
-- Existing values (from 001_schema.sql:302-305):
--   entry_purchase, entry_return, entry_transfer, entry_adjustment,
--   entry_initial, exit_consumption, exit_transfer, exit_adjustment,
--   exit_waste, exit_sale
-- New values:
--   entry_reception        (from PO reception — Sprint 2)
--   exit_work_order        (parts consumed in maintenance OT — Sprint 3)
--   exit_fuel_dispensing   (fuel dispensed from tank — Sprint 4)
--   exit_external_service  (consumed by external service — Sprint 5)
-- ============================================================================

-- ─── 1. Drop existing CHECK (auto-named by PG) ─────────────────────────────
alter table public.stock_movements
  drop constraint if exists stock_movements_movement_type_check;

-- ─── 2. Recreate with extended set ─────────────────────────────────────────
alter table public.stock_movements
  add constraint stock_movements_movement_type_check
  check (movement_type in (
    -- Existing (preserved verbatim from 001_schema.sql)
    'entry_initial',
    'entry_purchase',
    'entry_return',
    'entry_transfer',
    'entry_adjustment',
    'exit_consumption',
    'exit_transfer',
    'exit_adjustment',
    'exit_waste',
    'exit_sale',
    -- New for upcoming sprints
    'entry_reception',         -- Sprint 2: from purchase_orders reception
    'exit_work_order',         -- Sprint 3: parts consumed in CMMS work orders
    'exit_fuel_dispensing',    -- Sprint 4: tank dispensing to equipment
    'exit_external_service'    -- Sprint 5: consumed by external service event
  ));

-- ─── 3. Polymorphic source columns ─────────────────────────────────────────
-- Allow any movement to point back at its originating business document.
-- source_type is text (not enum) on purpose: cheap to extend in future sprints
-- without DB migrations; validated at the RPC/application layer.
alter table public.stock_movements
  add column if not exists source_type text,
  add column if not exists source_id uuid;

-- ─── 4. Index for joining from source document → movement ─────────────────
create index if not exists idx_movements_source
  on public.stock_movements(source_type, source_id)
  where source_type is not null;

comment on column public.stock_movements.source_type is
  'Polymorphic origin document type: purchase_order | work_order | '
  'fuel_dispensing | service_event | null. Validated by RPCs that create '
  'movements; no FK because target table varies.';

comment on column public.stock_movements.source_id is
  'UUID of the originating document in source_type''s table.';
