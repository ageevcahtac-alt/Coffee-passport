-- =========================================================
-- Recipes, Equipment Garage, Checkins — real cross-device sync
-- =========================================================
-- Written against the ACTUAL live schema (confirmed live 2026-08-31 via
-- direct PostgREST probes, same method 0004's header documents): only
-- coffee_lots, partner_requests, review_replies and user_taste_profiles
-- exist live. 0001's roasters/coffee_shops/users/roaster_members/
-- coffee_shop_members and 0004's own public.reviews were never applied.
-- There is still no roasters/coffee_shops table, so roaster_id/
-- coffee_shop_id/lot_id stay plain text here — the app's own opaque ids
-- (e.g. "roaster-xo", "shop-xo-vsevolozhsk", "LOT-XO-ETH-001"), not real
-- foreign keys — same reasoning 0004 already used for coffee_lots/reviews.
--
-- Trust model (two tiers, matching what actually has real auth today):
--   * Enthusiast-authored rows (a guest's own recipe/garage/checkin) are
--     owned by owner_user_id = auth.uid() — real per-account RLS, since
--     the consumer (site) auth flow is the one place in this app with a
--     working Supabase session (see lib/auth/currentUser.tsx).
--   * Roaster/coffee-shop-authored rows (benchmark/signature recipes, the
--     pilot roaster/cafe's own Garage) have owner_user_id = null and an
--     open policy. /dashboard/roaster and /dashboard/cafe have NO auth
--     gate at all yet (hardcoded ACTIVE_ROASTER_ID/ACTIVE_SHOP_ID pilot
--     scoping, see comments throughout app/dashboard/roaster|cafe/*) — an
--     open write policy here is not a new regression, it's the same
--     trust the pilot dashboards already operate under, just now shared
--     via the DB instead of being stuck in one browser's localStorage.
--     Tighten this once real roaster/coffee-shop membership auth exists
--     (same acknowledged gap 0004 already flagged for review_replies).

-- =========================================================
-- RECIPES — mirrors lib/types/coffee.ts BrewingRecipe.
-- =========================================================
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  lot_id text not null,
  brewing_method_id text not null,
  author_type text not null check (author_type in ('roaster', 'coffee_shop', 'enthusiast')),
  author_id text not null,   -- roasterId / coffeeShopId / auth user id as text
  author_name text not null,
  is_benchmark boolean not null default false,
  parent_recipe_id uuid references public.recipes(id) on delete set null,
  dose_g numeric not null,
  yield_g numeric not null,
  measured_tds_percent numeric,
  grinder_model text not null default '',
  grinder_setting text not null default '',
  water_temp_c numeric not null default 0,
  water_brand text not null default '',
  water_tds numeric,
  water_custom_mineralization text not null default '',
  bloom_time_sec numeric,
  pre_infusion_sec numeric,
  flow_rate_g_per_sec numeric,
  total_time_sec numeric not null default 0,
  equipment_model text not null default '',
  pressure_bar numeric,
  pressure_profile text not null default '',
  notes text not null default '',
  is_public boolean not null default false,
  -- Real per-account anchor for enthusiast rows; always null for
  -- roaster/coffee_shop rows (see trust-model note above).
  owner_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint recipes_owner_matches_author_type check (
    (author_type = 'enthusiast' and owner_user_id is not null)
    or (author_type in ('roaster', 'coffee_shop') and owner_user_id is null)
  )
);

create index if not exists idx_recipes_lot on public.recipes(lot_id);
create index if not exists idx_recipes_lot_method on public.recipes(lot_id, brewing_method_id);
create index if not exists idx_recipes_owner on public.recipes(owner_user_id);
create index if not exists idx_recipes_author on public.recipes(author_type, author_id);

-- =========================================================
-- EQUIPMENT_GARAGE — mirrors lib/types/coffee.ts EquipmentSetup, extended
-- with an owner_kind since one shared table now serves all three roles
-- (see components/coffee/EquipmentGarage.tsx, already parameterized by
-- ownerId across /journey/equipment, /dashboard/cafe/equipment and
-- /dashboard/roaster/equipment).
-- =========================================================
create table if not exists public.equipment_garage (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null check (owner_kind in ('enthusiast', 'roaster', 'coffee_shop')),
  owner_id text not null,   -- auth user id as text / roasterId / coffeeShopId
  owner_user_id uuid references auth.users(id) on delete cascade,
  espresso_grinder text not null default '',
  espresso_machine text not null default '',
  espresso_water text not null default '',
  filter_grinder text not null default '',
  filter_water text not null default '',
  favorite_device_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (owner_kind, owner_id),
  constraint equipment_owner_matches_kind check (
    (owner_kind = 'enthusiast' and owner_user_id is not null)
    or (owner_kind in ('roaster', 'coffee_shop') and owner_user_id is null)
  )
);

create index if not exists idx_equipment_owner on public.equipment_garage(owner_user_id);

-- =========================================================
-- CHECKINS — mirrors lib/types/coffee.ts TastingRecord (one row per blind
-- tasting / check-in). Always personal — unlike recipes/garage there is no
-- roaster/coffee_shop-authored variant, so this stays strictly
-- owner_user_id = auth.uid() with no open tier.
-- =========================================================
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  lot_id text not null,
  roaster_id text not null default '',
  coffee_shop_id text not null default '',
  brewing_method text not null default '',
  rating numeric(2, 1) not null default 0 check (rating between 0 and 5),
  acidity numeric(2, 1) not null default 0 check (acidity between 0 and 5),
  sweetness numeric(2, 1) not null default 0 check (sweetness between 0 and 5),
  body numeric(2, 1) not null default 0 check (body between 0 and 5),
  bitterness numeric(2, 1) not null default 0 check (bitterness between 0 and 5),
  body_texture text,
  sensory_tags jsonb not null default '[]'::jsonb,
  sub_descriptors jsonb not null default '{}'::jsonb,
  defects jsonb not null default '[]'::jsonb,
  liked text not null default '',
  disliked text not null default '',
  note text not null default '',
  barista_id text not null default '',
  barista_rating numeric(2, 1) not null default 0 check (barista_rating between 0 and 5),
  barista_note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_checkins_owner on public.checkins(owner_user_id);
create index if not exists idx_checkins_lot on public.checkins(lot_id);
create index if not exists idx_checkins_shop on public.checkins(coffee_shop_id);

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.recipes enable row level security;
alter table public.equipment_garage enable row level security;
alter table public.checkins enable row level security;

-- Recipes: public ones are readable by anyone (guests browsing a lot's
-- passport need to see benchmark/signature/community recipes without being
-- signed in); an enthusiast can always read their own, even unpublished
-- drafts.
create policy "public reads published recipes" on public.recipes
  for select using (is_public = true);

create policy "owner reads own recipes" on public.recipes
  for select using (auth.uid() = owner_user_id);

create policy "owner manages own recipes" on public.recipes
  for all
  using (auth.uid() = owner_user_id)
  with check (author_type = 'enthusiast' and auth.uid() = owner_user_id);

-- Pilot roaster/coffee-shop dashboards have no auth gate yet (see note at
-- top) — open policy, matching that existing trust level.
create policy "open access to roaster/shop recipes" on public.recipes
  for all
  using (author_type in ('roaster', 'coffee_shop'))
  with check (author_type in ('roaster', 'coffee_shop') and owner_user_id is null);

-- Equipment Garage: never shown to anyone but its own owner (recipe forms
-- only ever read *their own* author's Garage — see
-- components/coffee/ProRecipeForm.tsx / EnthusiastRecipeForm.tsx), so no
-- public read policy at all, only owner + open-pilot tiers.
create policy "owner manages own equipment" on public.equipment_garage
  for all
  using (auth.uid() = owner_user_id)
  with check (owner_kind = 'enthusiast' and auth.uid() = owner_user_id);

create policy "open access to roaster/shop equipment" on public.equipment_garage
  for all
  using (owner_kind in ('roaster', 'coffee_shop'))
  with check (owner_kind in ('roaster', 'coffee_shop') and owner_user_id is null);

-- Checkins: strictly owner-only, both directions — no open tier, this is
-- personal tasting history including the barista rating that must stay
-- hidden from the roaster (see components/roaster/LotGuestAnalytics.tsx,
-- which never reads it — this RLS is the DB-level backstop for that same
-- rule now that checkins can be queried directly).
create policy "owner manages own checkins" on public.checkins
  for all
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

-- =========================================================
-- Table-level GRANTs — see 0004's note: RLS alone doesn't expose a new
-- table to PostgREST's anon/authenticated roles, an explicit GRANT is
-- required too. RLS above is still the real gate.
-- =========================================================
grant select, insert, update, delete on public.recipes to anon, authenticated;
grant select, insert, update, delete on public.equipment_garage to anon, authenticated;
grant select, insert, update, delete on public.checkins to anon, authenticated;
