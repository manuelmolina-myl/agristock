-- ============================================================================
-- 030_simplify_demo_identities.sql
--
-- Migration 029's auth.identities row format isn't accepted by Supabase Auth.
-- Looking at the admin user that DOES work (created in migration 003), it has
-- no manually-inserted identity row — Supabase Auth resolves logins by the
-- `email` column on auth.users directly.  Drop our custom identity rows.
-- ============================================================================

delete from auth.identities
 where user_id in (
   select id from auth.users where email in ('compras@agristock.mx', 'mantenimiento@agristock.mx')
 );

-- Also make sure these accounts have the same column shape as admin@.
-- Some fields default to NULL in our manual insert but admin@ has explicit
-- empty strings. Normalize them.
update auth.users
   set confirmation_token = coalesce(confirmation_token, ''),
       recovery_token = coalesce(recovery_token, ''),
       email_change_token_new = coalesce(email_change_token_new, ''),
       email_change = coalesce(email_change, '')
 where email in ('compras@agristock.mx', 'mantenimiento@agristock.mx');
