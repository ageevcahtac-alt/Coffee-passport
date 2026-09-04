-- =========================================================
-- Barista profiles — personal layer on top of the barista identity
-- =========================================================
-- lib/data/baristas.ts (Barista.id/name/coffeeShopId) and public.recipes
-- with author_type='barista' (see 0006_barista_recipes.sql) already cover
-- "who made this cup" and "their recipe for a lot". This migration adds
-- the missing personal-preference layer — favorite origin/brew method and
-- an optional avatar — read on the tasting Success Screen ("Напиток
-- приготовил(а) [Имя] · Любимый кофе бариста: [origin] в [method]") and on
-- the guest's saved drink card. Deliberately NOT a new "BaristaRecipe"
-- table: public.recipes(author_type='barista') already models an
-- author's brewing recipe for a lot (ratio/temp/steps as real columns,
-- is_benchmark ~ "use as default"), so reusing it avoids a second,
-- redundant recipe shape.
--
-- As always in this project: cannot apply this myself from this
-- environment (no SUPABASE_ACCESS_TOKEN/SUPABASE_SERVICE_ROLE_KEY here —
-- see 0005's header). Apply via the Supabase SQL Editor, or
-- `supabase login && supabase link --project-ref vodmmtzclvqemcujwmdf &&
-- supabase db push`.

create table if not exists public.barista_profiles (
  -- Matches the app's own opaque Barista.id (e.g. 'barista-xo-alexey'),
  -- same "plain text id, not a uuid" convention as recipes.author_id and
  -- profiles.barista_id (see 0007's header note on why).
  id text primary key,
  coffee_shop_id text not null,
  name text not null,
  favorite_origin text not null default '',
  favorite_brew_method text not null default '',
  avatar_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_barista_profiles_shop on public.barista_profiles(coffee_shop_id);

alter table public.barista_profiles enable row level security;

-- Guest-facing cards (Success Screen, saved drink card, lot menu) read this
-- with no session at all — same open-read trust tier as public.recipes'
-- "public reads published recipes" policy.
drop policy if exists "public reads barista profiles" on public.barista_profiles;
create policy "public reads barista profiles" on public.barista_profiles
  for select using (true);

grant select on public.barista_profiles to anon, authenticated;

-- Writes follow the same public.profiles-scoped trust tier 0007
-- established for recipes/equipment_garage: a barista edits only their own
-- profile row, a cafe_admin manages every barista profile at their shop
-- (e.g. onboarding a new hire's profile before that person has their own
-- staff account).
drop policy if exists "staff manage own barista profile" on public.barista_profiles;
create policy "staff manage own barista profile" on public.barista_profiles
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          (p.role = 'barista' and p.barista_id = barista_profiles.id)
          or (p.role = 'cafe_admin' and p.cafe_id = barista_profiles.coffee_shop_id)
        )
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          (p.role = 'barista' and p.barista_id = barista_profiles.id)
          or (p.role = 'cafe_admin' and p.cafe_id = barista_profiles.coffee_shop_id)
        )
    )
  );

grant insert, update, delete on public.barista_profiles to authenticated;
