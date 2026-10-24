-- =========================================================
-- Checkins: profile viewed before tasting
-- =========================================================
-- A guest who opens the lot profile in the shop before cupping gets a
-- marked evaluation. Default false covers all existing rows and the
-- blind tasting path. Cabinets, views and RLS remain unchanged.
-- Guarded by supabase/checkinsProfileSeen.test.ts.

alter table public.checkins add column if not exists profile_seen_before_tasting boolean not null default false;

notify pgrst, 'reload schema';
