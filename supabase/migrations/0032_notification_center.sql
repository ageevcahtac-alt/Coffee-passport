-- =========================================================
-- Unified Notification / Event Center — persistence for the Enthusiast-side
-- NEW_CAFE_LOT notifications (see components/shared/NotificationCenter.tsx,
-- lib/notifications/*). Ecosystem events (public.events, 0014) already have
-- no per-user state and keep it that way — nothing here touches that table
-- except enabling realtime is NOT needed for it (the board already
-- revalidates on an interval via SWR, and it has no per-user unread concept
-- to keep live).
--
-- Two additive tables, both owner-only, both following the exact RLS shape
-- 0019 (shop_mute_preferences) already established for this project's
-- "real auth.users uuid, no service role, no anon write" trust tier:
--
--   notification_preferences — one row per user, the global on/off switch
--   for NEW_CAFE_LOT notifications ("Уведомлять о новых лотах в кофейнях").
--   Absence of a row means enabled (the default), same "presence/absence
--   IS the state" idiom as shop_mute_preferences.
--
--   lot_notification_reads — per-user read/dismiss state for one specific
--   announcement OCCURRENCE. An occurrence is identified by
--   (coffee_shop_id, lot_id, status_changed_at) rather than just
--   (coffee_shop_id, lot_id): lib/utils/shopAnnouncements.ts's own comment
--   already establishes that a lot re-marked 'new' later "resets the
--   clock" and should read as a fresh announcement — this table honors
--   that same rule for read/dismiss state, so an old dismissed/read
--   announcement doesn't suppress a genuinely new one for the same lot.
--   Deliberately does NOT duplicate the announcement content itself
--   (shop/lot/status) — cafe_menu_entries stays the single source of
--   truth for "what the announcement says"; this table only ever tracks
--   "has this user read/dismissed this exact occurrence."
--
-- As always: cannot apply this myself from this environment (no
-- SUPABASE_ACCESS_TOKEN/SUPABASE_SERVICE_ROLE_KEY, no direct Postgres
-- connection — see 0005's header). Apply via the Supabase SQL Editor, or
-- `supabase login && supabase link --project-ref vodmmtzclvqemcujwmdf &&
-- supabase db push`.

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notify_new_lots boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "user manages own notification preferences" on public.notification_preferences;
create policy "user manages own notification preferences" on public.notification_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.notification_preferences to authenticated;

create table if not exists public.lot_notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  coffee_shop_id text not null,
  lot_id text not null,
  status_changed_at timestamptz not null,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, coffee_shop_id, lot_id, status_changed_at)
);

create index if not exists idx_lot_notification_reads_user on public.lot_notification_reads(user_id);

alter table public.lot_notification_reads enable row level security;

drop policy if exists "user manages own notification reads" on public.lot_notification_reads;
create policy "user manages own notification reads" on public.lot_notification_reads
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.lot_notification_reads to authenticated;

-- =========================================================
-- Realtime for cafe_menu_entries — the NEW_CAFE_LOT source of truth. The
-- table's own RLS ("public reads cafe menu entries", 0017) already grants
-- unrestricted select to anon/authenticated, so broadcasting every row
-- change to every subscriber leaks nothing that wasn't already a public
-- read away — no separate realtime-specific policy needed. Idempotent:
-- re-running this migration (or applying it on a project where the table
-- was already added to the publication by hand) must not error.
-- =========================================================
do $$
begin
  alter publication supabase_realtime add table public.cafe_menu_entries;
exception
  when duplicate_object then null;
end $$;
