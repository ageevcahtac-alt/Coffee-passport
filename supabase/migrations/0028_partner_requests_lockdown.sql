-- =========================================================
-- Partner requests lockdown — production readiness hardening.
--
-- 0003_partner_requests.sql's own comment already flagged this as a
-- stopgap: "before handling anything more sensitive: add
-- SUPABASE_SERVICE_ROLE_KEY as a Render env var and move the admin
-- read/update calls to a server-only client that uses it instead of
-- these two policies." That env var is now configured
-- (lib/supabase/adminClient.ts), so the anon-key SELECT/UPDATE policies
-- this table has carried since 0003 are no longer needed and are
-- actively dangerous: partner_requests holds company/contact
-- name+email+phone for every partner lead, readable and writable by
-- anyone holding the public anon key (which ships in every client
-- bundle), regardless of the HTTP Basic Auth gate in front of the
-- /admin UI — that gate is invisible to Postgres RLS.
--
-- Public lead capture (insert-only, from 0003) is untouched: the
-- landing page's "Стать партнёром" form must keep working with no
-- session at all.
-- =========================================================

drop policy if exists "anon can read partner requests" on public.partner_requests;
drop policy if exists "anon can update partner requests" on public.partner_requests;
