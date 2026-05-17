-- ============================================================================
-- 024_simplify_roles_to_4.sql (part 1 of 2)
-- Just ADD the new enum values. Postgres requires this to commit before any
-- subsequent DML can reference the new labels.  Migration 025 does the data
-- migration, helper rewrites and policy changes.
-- ============================================================================

alter type user_role add value if not exists 'admin';
alter type user_role add value if not exists 'compras';
alter type user_role add value if not exists 'mantenimiento';
-- 'almacenista' already exists from migration 013.
