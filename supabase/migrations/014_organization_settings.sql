-- ============================================================================
-- 014_organization_settings.sql — Sprint 0 §1.2
-- Move organizations.approval_threshold_mxn (single scalar) → settings jsonb
-- with escalonado approval tiers per operation type.
-- ============================================================================

-- ─── 1. Add settings column ────────────────────────────────────────────────
alter table public.organizations
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- ─── 2. Seed settings from existing approval_threshold_mxn ─────────────────
-- Default tier structure: <below threshold> → coordinator can approve,
-- <up to 10x threshold> → director, <unlimited> → director with note.
update public.organizations
set settings = jsonb_build_object(
  'approval_thresholds', jsonb_build_object(
    'purchase', jsonb_build_array(
      jsonb_build_object(
        'max_mxn', coalesce(approval_threshold_mxn, 5000),
        'role', 'coordinador_compras'
      ),
      jsonb_build_object(
        'max_mxn', coalesce(approval_threshold_mxn, 5000) * 10,
        'role', 'director_sg'
      ),
      jsonb_build_object(
        'max_mxn', null,
        'role', 'director_sg',
        'requires_note', true
      )
    ),
    'stock_exit', jsonb_build_array(
      jsonb_build_object('max_mxn', 5000, 'role', 'almacenista'),
      jsonb_build_object('max_mxn', null, 'role', 'director_sg')
    ),
    'work_order', jsonb_build_array(
      jsonb_build_object('max_mxn', 10000, 'role', 'coordinador_mantenimiento'),
      jsonb_build_object('max_mxn', null, 'role', 'director_sg')
    )
  ),
  'invoice_reconciliation_tolerance_pct', 2.0,
  'low_stock_alert_enabled', true,
  'low_fuel_alert_enabled', true
)
where settings = '{}'::jsonb;

-- ─── 3. Mark old column deprecated ─────────────────────────────────────────
comment on column public.organizations.approval_threshold_mxn is
  'DEPRECATED — use settings->approval_thresholds. Dropped at end of Sprint 1.';

-- ─── 4. Helper: which role is required to approve an amount ────────────────
-- Reads the tiers array for p_operation, walks tiers in order, returns the
-- first role whose max_mxn either covers p_amount_mxn or is null (unlimited).
create or replace function public.required_approval_role(
  p_org_id     uuid,
  p_operation  text,
  p_amount_mxn numeric
) returns user_role
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_thresholds jsonb;
  v_tier       jsonb;
  v_max        numeric;
begin
  select settings->'approval_thresholds'->p_operation into v_thresholds
    from public.organizations
    where id = p_org_id;

  if v_thresholds is null or jsonb_array_length(v_thresholds) = 0 then
    -- Safe default if org not configured: director_sg must approve.
    return 'director_sg'::user_role;
  end if;

  for v_tier in select * from jsonb_array_elements(v_thresholds) loop
    v_max := nullif(v_tier->>'max_mxn', '')::numeric;
    if v_max is null or p_amount_mxn <= v_max then
      return (v_tier->>'role')::user_role;
    end if;
  end loop;

  -- All tiers exhausted (shouldn't happen if last tier has null max): fallback.
  return 'director_sg'::user_role;
end;
$$;

revoke all on function public.required_approval_role(uuid, text, numeric) from public;
grant execute on function public.required_approval_role(uuid, text, numeric) to authenticated;
