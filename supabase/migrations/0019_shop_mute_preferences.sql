-- =========================================================
-- Per-guest shop mute preferences ("Отписаться от обновлений этой кофейни")
-- =========================================================
-- A guest's own opt-out of one shop's "Обновления на баре" announcements
-- (components/coffee/BarUpdatesPanel.tsx) — presence of a row means muted,
-- absence means subscribed (the default, per spec: "по умолчанию
-- включено"). No boolean column needed: mute = insert, unmute = delete.
--
-- Real auth.users uuid only, same tier as the loyalty module
-- (0012_loyalty_module.sql) rather than checkins/recipes' anonymous-device
-- tier — an anonymous device id isn't a valid uuid and has no auth.uid()
-- session to scope RLS against, so an anonymous guest's mute preference
-- stays purely local (see lib/data/shopMutePreferencesStore.ts) and only
-- syncs here once they're signed in.
--
-- Owner-only RLS, no staff-read policy at all: a shop has no business
-- knowing which specific guests muted it, unlike every other staff-facing
-- table in this app.
--
-- As always: cannot apply this myself from this environment (see 0005's
-- header for why). Apply via the Supabase SQL Editor, or
-- `supabase login && supabase link --project-ref vodmmtzclvqemcujwmdf &&
-- supabase db push`.

create table if not exists public.shop_mute_preferences (
  guest_id uuid not null references auth.users(id) on delete cascade,
  shop_id text not null,
  created_at timestamptz not null default now(),
  primary key (guest_id, shop_id)
);

create index if not exists idx_shop_mute_preferences_guest on public.shop_mute_preferences(guest_id);

alter table public.shop_mute_preferences enable row level security;

drop policy if exists "guest manages own mute preferences" on public.shop_mute_preferences;
create policy "guest manages own mute preferences" on public.shop_mute_preferences
  for all
  using (auth.uid() = guest_id)
  with check (auth.uid() = guest_id);

grant select, insert, delete on public.shop_mute_preferences to authenticated;
