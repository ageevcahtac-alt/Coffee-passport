-- =========================================================
-- Fix incorrect PIR Coffee / PIR Expo 2026 dates
-- =========================================================
-- The seed data in 0014_events_module.sql listed both events as
-- 13-15/16 October 2026 — wrong. Real dates: PIR Expo (and PIR Coffee,
-- part of the same expo) runs 26-29 October 2026. Migrations are
-- forward-only (0014 already ran against the live DB), so this corrects
-- the already-inserted rows rather than editing that old migration's
-- INSERT in place; 0014's own seed values are also corrected for anyone
-- provisioning a fresh database from scratch.
--
-- As always: cannot apply this myself from this environment (see 0005's
-- header for why). Apply via the Supabase SQL Editor, or
-- `supabase login && supabase link --project-ref vodmmtzclvqemcujwmdf &&
-- supabase db push`.

update public.events
set start_date = '2026-10-26', end_date = '2026-10-29', updated_at = now()
where title = 'PIR Coffee' and start_date = '2026-10-13' and source = 'manual';

update public.events
set start_date = '2026-10-26', end_date = '2026-10-29', updated_at = now()
where title = 'PIR Expo' and start_date = '2026-10-13' and source = 'manual';
