-- ============================================================================
-- AgriStock — Add signature fields + transfer support
-- Run in Supabase SQL Editor
-- ============================================================================

-- 1. Add signature/personnel fields to stock_movements
alter table stock_movements
  add column if not exists delivered_by_employee_id uuid references employees(id),
  add column if not exists received_by_employee_id uuid references employees(id),
  add column if not exists transport_notes text;

-- 2. Update existing movements: migrate "Recibe: Name" from notes to the new field
-- (Best effort — matches employee by name from notes prefix)
update stock_movements sm
set received_by_employee_id = e.id
from employees e
where sm.notes like 'Recibe: %'
  and e.full_name = trim(split_part(replace(sm.notes, 'Recibe: ', ''), '.', 1))
  and e.organization_id = sm.organization_id
  and sm.received_by_employee_id is null;

-- 3. Create indexes
create index if not exists idx_movements_delivered_by on stock_movements(delivered_by_employee_id) where delivered_by_employee_id is not null;
create index if not exists idx_movements_received_by on stock_movements(received_by_employee_id) where received_by_employee_id is not null;
