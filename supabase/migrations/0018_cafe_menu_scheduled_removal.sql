-- =========================================================
-- Scheduled removal timestamp + auto-expiry for discontinuing lots
-- =========================================================
-- Adds scheduled_removal_at to cafe_menu_entries (0017) — set by the cafe
-- dashboard's status control (components/cafe/LotStatusControl.tsx) when a
-- lot is marked 'discontinuing', computed from a preset (1 week / 1 month)
-- or a specific date. Backs the real-time countdown
-- (components/coffee/CountdownTimer.tsx) on the guest-facing "Обновления
-- на баре" cards and the lot passport page.
--
-- The countdown component's onExpire callback optimistically flips
-- is_active off in whichever guest's browser happens to be looking at it
-- (see components/coffee/LotRemovalCountdown.tsx) — but that write is
-- blocked by 0017's own RLS for anyone who isn't shop staff, and there's
-- no guarantee a guest is even looking when the deadline passes. So the
-- actual authoritative removal is this migration's
-- cafe_menu_expire_discontinuing() function, called by a POST to
-- /api/cron/cafe-menu-expire — same pattern as
-- 0014_events_module.sql's events_archive_expired(), triggered by the same
-- daily GitHub Actions workflow (.github/workflows/events-cron.yml).
--
-- As always: cannot apply this myself from this environment (see 0005's
-- header for why). Apply via the Supabase SQL Editor, or
-- `supabase login && supabase link --project-ref vodmmtzclvqemcujwmdf &&
-- supabase db push`.

alter table public.cafe_menu_entries
  add column if not exists scheduled_removal_at timestamptz;

create or replace function public.cafe_menu_expire_discontinuing()
returns integer
language sql
security definer set search_path = public
as $$
  with expired as (
    update public.cafe_menu_entries
    set is_active = false, updated_at = now()
    where is_active = true
      and status = 'discontinuing'
      and scheduled_removal_at is not null
      and scheduled_removal_at <= now()
    returning 1
  )
  select count(*)::integer from expired;
$$;

grant execute on function public.cafe_menu_expire_discontinuing() to anon, authenticated;
