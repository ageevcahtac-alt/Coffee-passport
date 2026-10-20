-- =========================================================
-- Cron RPCs: execute for service_role only
-- =========================================================
-- 0014_events_module.sql and 0018_cafe_menu_scheduled_removal.sql granted
-- EXECUTE on their security definer cron functions to anon and
-- authenticated. The cron secret (lib/events/cronAuth.ts) only guards the
-- /api/cron/* routes, so anyone with the public anon key could call these
-- directly through PostgREST (/supabase/rest/v1/rpc/...) and archive events,
-- expire menu entries or insert pending_review events, bypassing the secret.
--
-- The only callers are the three /api/cron/* routes, which already use
-- createAdminSupabaseClient (lib/supabase/adminClient.ts, service_role key).
-- Guarded by supabase/cronRpcGrants.test.ts.

revoke execute on function public.events_archive_expired() from public, anon, authenticated;
revoke execute on function public.events_ingest_candidate(text, text, text, date, date, text, text) from public, anon, authenticated;
revoke execute on function public.cafe_menu_expire_discontinuing() from public, anon, authenticated;

grant execute on function public.events_archive_expired() to service_role;
grant execute on function public.events_ingest_candidate(text, text, text, date, date, text, text) to service_role;
grant execute on function public.cafe_menu_expire_discontinuing() to service_role;
