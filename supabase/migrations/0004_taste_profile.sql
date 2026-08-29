-- =========================================================
-- Вкусовой Паспорт (Enthusiast Journal) + B2B guest-taste widget
-- =========================================================
-- Rewritten against the ACTUAL live schema, discovered by querying
-- information_schema directly — it does not match 0001_init_schema.sql
-- (public.users/roasters/coffees/lots/coffee_shops/reviews were never
-- applied to the live database; only 0003's partner_requests was). The
-- live public schema is just: coffee_lots (flat, text id), partner_requests,
-- and two tables that were already created ahead of this migration —
-- user_taste_profiles and review_replies — whose shape matches this
-- feature almost exactly. This migration adds the missing piece
-- (public.reviews, the parent of review_replies.review_id) and wires the
-- recompute trigger, instead of introducing a second, parallel schema.
--
-- There is no roasters/coffee_shops table at all: shop/roaster identity
-- lives only in the frontend's static data (lib/data/coffeeShops.ts,
-- lib/data/roasters.ts) as opaque string ids, so those references here are
-- plain text columns, not real foreign keys — same reasoning as
-- coffee_lots.id itself being text, not uuid.

-- =========================================================
-- REVIEWS — one row per guided tasting (never overwritten — a re-taste of
-- the same lot is a new row, same history-preserving intent as the
-- original 0001 draft of this table).
-- =========================================================
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lot_id text not null references public.coffee_lots(id) on delete cascade,
  coffee_shop_id text,
  brewing_method text,
  rating numeric(2,1) not null check (rating >= 1 and rating <= 5),
  -- guest's own blind-cupping read, 0-5 per axis — same axes as
  -- user_taste_profiles.taste_profile so per-review and aggregate compare
  -- directly.
  acidity numeric(2,1) not null default 0 check (acidity between 0 and 5),
  sweetness numeric(2,1) not null default 0 check (sweetness between 0 and 5),
  body numeric(2,1) not null default 0 check (body between 0 and 5),
  bitterness numeric(2,1) not null default 0 check (bitterness between 0 and 5),
  body_texture text,
  sensory_tags jsonb not null default '[]'::jsonb,
  sub_descriptors jsonb not null default '{}'::jsonb,
  defects jsonb not null default '[]'::jsonb,
  liked text,
  disliked text,
  note text,
  barista_id text,
  barista_rating numeric(2,1) not null default 0,
  barista_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_reviews_user on public.reviews(user_id);
create index if not exists idx_reviews_lot on public.reviews(lot_id);
create index if not exists idx_reviews_shop on public.reviews(coffee_shop_id);

-- =========================================================
-- Fix up the pre-existing review_replies so it actually points at reviews:
-- responder_id was typed uuid but shop/roaster ids are opaque strings (see
-- above), and review_id had no FK yet. Table is empty, so both are safe.
-- =========================================================
alter table public.review_replies
  alter column responder_id type text using responder_id::text;

do $$
begin
  alter table public.review_replies
    add constraint review_replies_review_id_fkey
    foreign key (review_id) references public.reviews(id) on delete cascade;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.review_replies
    add constraint review_replies_responder_role_check
    check (responder_role in ('coffee_shop', 'roaster'));
exception when duplicate_object then null;
end $$;

create index if not exists idx_review_replies_review on public.review_replies(review_id);

-- =========================================================
-- user_taste_profiles already has the right shape (user_id, taste_profile
-- jsonb, favorite_regions text[], favorite_processes text[], updated_at) —
-- just make sure it's actually keyed to auth.users and upsertable.
-- =========================================================
do $$
begin
  alter table public.user_taste_profiles
    add constraint user_taste_profiles_user_id_key unique (user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.user_taste_profiles
    add constraint user_taste_profiles_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;
exception when duplicate_object then null;
end $$;

-- =========================================================
-- Recompute + trigger: keep user_taste_profiles in sync with reviews on
-- every insert/update/delete (server-side, so it can never drift regardless
-- of which client wrote the review).
-- =========================================================
create or replace function public.recompute_taste_profile(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_taste jsonb;
  v_regions text[];
  v_processes text[];
begin
  -- taste axes: only from highly-rated cups (>= 4), same rule the frontend
  -- mirror (lib/utils/tasteProfile.ts computeTasteProfile) uses.
  select jsonb_build_object(
    'acidity', round(coalesce(avg(acidity), 0)::numeric, 2),
    'sweetness', round(coalesce(avg(sweetness), 0)::numeric, 2),
    'body', round(coalesce(avg(body), 0)::numeric, 2),
    'bitterness', round(coalesce(avg(bitterness), 0)::numeric, 2)
  )
  into v_taste
  from public.reviews
  where user_id = p_user_id and rating >= 4;

  select coalesce(array_agg(region), '{}'::text[]) into v_regions
  from (
    select l.region as region
    from public.reviews r
    join public.coffee_lots l on l.id = r.lot_id
    where r.user_id = p_user_id and l.region is not null
    group by l.region
    order by count(*) desc, l.region asc
    limit 5
  ) t;

  select coalesce(array_agg(process), '{}'::text[]) into v_processes
  from (
    select l.process as process
    from public.reviews r
    join public.coffee_lots l on l.id = r.lot_id
    where r.user_id = p_user_id and l.process is not null
    group by l.process
    order by count(*) desc, l.process asc
    limit 5
  ) t;

  update public.user_taste_profiles
  set taste_profile = coalesce(v_taste, '{}'::jsonb),
      favorite_regions = v_regions,
      favorite_processes = v_processes,
      updated_at = now()
  where user_id = p_user_id;

  if not found then
    insert into public.user_taste_profiles (user_id, taste_profile, favorite_regions, favorite_processes, updated_at)
    values (p_user_id, coalesce(v_taste, '{}'::jsonb), v_regions, v_processes, now());
  end if;
end;
$$;

create or replace function public.trg_reviews_update_taste_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_taste_profile(old.user_id);
    return old;
  end if;

  perform public.recompute_taste_profile(new.user_id);
  if tg_op = 'UPDATE' and old.user_id <> new.user_id then
    perform public.recompute_taste_profile(old.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_reviews_change on public.reviews;
create trigger on_reviews_change
  after insert or update or delete on public.reviews
  for each row execute function public.trg_reviews_update_taste_profile();

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.reviews enable row level security;
alter table public.review_replies enable row level security;
alter table public.user_taste_profiles enable row level security;

create policy "user manages own reviews" on public.reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user manages own taste profile" on public.user_taste_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "guest reads replies to own reviews" on public.review_replies
  for select using (
    exists (select 1 from public.reviews r where r.id = review_id and r.user_id = auth.uid())
  );

-- NOTE — trust model (same honest tradeoff as partner_requests in 0003):
-- there is no coffee_shops/roasters table yet, so there is no membership
-- table to scope "only this shop's staff" against. Until that exists, any
-- authenticated user can read all reviews/taste profiles (needed for the
-- B2B guest-taste-profile widget and the review feed on /dashboard/cafe
-- and /dashboard/roaster) and post a reply. Acceptable for now — this data
-- is cupping notes and shop replies, not secrets — but tighten this once
-- coffee_shops/roasters + membership tables exist.
create policy "authenticated users read all reviews" on public.reviews
  for select using (auth.uid() is not null);

create policy "authenticated users read all taste profiles" on public.user_taste_profiles
  for select using (auth.uid() is not null);

create policy "authenticated users read all review replies" on public.review_replies
  for select using (auth.uid() is not null);

create policy "authenticated users create review replies" on public.review_replies
  for insert with check (auth.uid() is not null);

-- =========================================================
-- Table-level GRANTs — RLS policies alone don't give the PostgREST roles
-- (anon/authenticated) any privilege on a newly-created table; without an
-- explicit GRANT here, PostgREST's schema cache won't even list
-- public.reviews (review_replies/user_taste_profiles already have grants
-- from whenever they were first created, which is why they didn't need
-- this). RLS above is still the real gate — these grants just raise the
-- ceiling RLS then narrows.
-- =========================================================
grant select, insert, update, delete on public.reviews to anon, authenticated;
grant select, insert, update, delete on public.review_replies to anon, authenticated;
grant select, insert, update, delete on public.user_taste_profiles to anon, authenticated;
