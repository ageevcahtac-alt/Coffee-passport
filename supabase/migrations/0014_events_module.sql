-- =========================================================
-- Events ("Ближайшие мероприятия") — moves the board from the static
-- seed array in lib/data/coffeeEvents.ts to a real, DB-backed, auto-
-- refreshing pipeline: public API (active + not-yet-ended only), a daily
-- archive job, a daily aggregator that ingests candidates as
-- pending_review, and an admin moderation UI (/dashboard/admin/events).
--
-- Trust model note: this project has no SUPABASE_SERVICE_ROLE_KEY
-- configured (see lib/supabase/adminClient.ts's own comment — every
-- server route here uses the anon key). The two maintenance RPCs below
-- are therefore callable by the anon role; the REAL gate for the cron
-- routes that call them (app/api/cron/events-archive,
-- app/api/cron/events-aggregate) is an EVENTS_CRON_SECRET bearer-token
-- check in the route handler itself — same "RLS + app-level secret, no
-- service role" trust tier already used for /api/admin/** (see
-- middleware.ts's HTTP Basic gate). Documented tradeoff, not an
-- oversight: archiving expired events is idempotent and harmless if
-- called out of turn, and ingested candidates land as pending_review,
-- never public, until an admin approves them.
--
-- As always: I cannot apply this migration myself from this environment
-- (no SUPABASE_ACCESS_TOKEN/SUPABASE_SERVICE_ROLE_KEY, no direct Postgres
-- connection — see 0005's header). Apply via the Supabase SQL Editor, or
-- `supabase login && supabase link --project-ref <ref> && supabase db push`.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location text not null default '', -- город/площадка, one combined field
  description text not null default '',
  start_date date not null,
  end_date date not null,
  link text not null default '',
  status text not null default 'pending_review' check (status in ('active', 'archived', 'pending_review')),
  -- Where this row came from — 'manual' (admin-entered) or an EventSource
  -- id from lib/events/sources (e.g. an ics feed url/label), shown in the
  -- moderation queue so an admin knows what to trust.
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The task's own dedup key — an aggregator run that sees the same
  -- (title, start_date) pair twice must not create a second row.
  unique (title, start_date)
);

create index if not exists idx_events_status_start on public.events(status, start_date);

alter table public.events enable row level security;

-- Public board: only active AND not-yet-ended — mirrors /api/events'
-- own filter at the DB layer too (defense in depth, not the only gate).
create policy "public reads active upcoming events" on public.events
  for select
  using (status = 'active' and end_date >= current_date);

-- Admin moderation (/dashboard/admin/events) — full access to every row
-- regardless of status, for a signed-in role='admin' session.
create policy "admin manages all events" on public.events
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;

-- =========================================================
-- Maintenance RPCs — see the trust-model note above for why these are
-- security definer and grantable to anon rather than requiring a real
-- session.
-- =========================================================

-- Daily archive pass: anything whose run has ended drops out of the
-- public board but stays in the table for history/admin's "Архив" tab.
create or replace function public.events_archive_expired()
returns integer
language sql
security definer set search_path = public
as $$
  with archived as (
    update public.events
    set status = 'archived', updated_at = now()
    where status = 'active' and end_date < current_date
    returning 1
  )
  select count(*)::integer from archived;
$$;

grant execute on function public.events_archive_expired() to anon, authenticated;

-- One aggregator candidate at a time. Dedup is the table's own unique
-- (title, start_date) constraint — "on conflict do nothing" IS the
-- dedup the task asked for, not a pre-check query that could race.
-- Returns true only when a new row was actually inserted, so the calling
-- route can report a real "N new events found" count.
create or replace function public.events_ingest_candidate(
  p_title text,
  p_location text,
  p_description text,
  p_start_date date,
  p_end_date date,
  p_link text,
  p_source text
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_inserted boolean;
begin
  insert into public.events (title, location, description, start_date, end_date, link, status, source)
  values (p_title, p_location, p_description, p_start_date, p_end_date, p_link, 'pending_review', p_source)
  on conflict (title, start_date) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

grant execute on function public.events_ingest_candidate(text, text, text, date, date, text, text) to anon, authenticated;

-- =========================================================
-- Seed: migrate the previous static board (lib/data/coffeeEvents.ts) in
-- as already-trusted, already-active content, so the board isn't empty
-- on day one.
-- =========================================================
insert into public.events (title, location, description, start_date, end_date, link, status, source)
values
  (
    'PIR Coffee', 'Москва, Крокус Экспо',
    'Специализированная выставка кофейной индустрии в составе PIR Expo — обжарщики, оборудование, бариста-чемпионаты.',
    '2026-10-13', '2026-10-15', 'https://pirexpo.com', 'active', 'manual'
  ),
  (
    'PIR Expo', 'Москва, Крокус Экспо',
    'Международная выставка индустрии гостеприимства — HoReCa, кофе и рестораны под одной крышей.',
    '2026-10-13', '2026-10-16', 'https://pirexpo.com', 'active', 'manual'
  ),
  (
    'Coffee Fest', 'Санкт-Петербург, Севкабель Порт',
    'Городской кофейный фестиваль — локальные обжарщики, воркшопы для бариста и энтузиастов, каппинги.',
    '2026-11-21', '2026-11-22', '', 'active', 'manual'
  ),
  (
    'World of Coffee', 'Милан, Fiera Milano',
    'Флагманское европейское событие Специализированной ассоциации кофе (SCA) — чемпионаты бариста, обжарщики со всего мира.',
    '2027-02-19', '2027-02-21', 'https://worldofcoffee.org', 'active', 'manual'
  )
on conflict (title, start_date) do nothing;
