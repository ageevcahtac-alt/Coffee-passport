-- =========================================================
-- Coffee Passport — initial schema
-- =========================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- =========================================================
-- USERS (Supabase Auth handles auth.users; this is the profile)
-- =========================================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- ROASTERS
-- =========================================================
create table public.roasters (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  description text,
  website text,
  logo_url text,
  city text,
  country text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roaster_members (
  id uuid primary key default uuid_generate_v4(),
  roaster_id uuid not null references public.roasters(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'owner', -- owner | staff
  created_at timestamptz not null default now(),
  unique (roaster_id, user_id)
);

-- =========================================================
-- COFFEE SHOPS
-- =========================================================
create table public.coffee_shops (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  address text,
  city text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  description text,
  website text,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coffee_shop_members (
  id uuid primary key default uuid_generate_v4(),
  coffee_shop_id uuid not null references public.coffee_shops(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  unique (coffee_shop_id, user_id)
);

-- =========================================================
-- COFFEES (general product / origin, NOT lot-specific)
-- =========================================================
create table public.coffees (
  id uuid primary key default uuid_generate_v4(),
  roaster_id uuid not null references public.roasters(id) on delete cascade,
  slug text not null,
  name text not null,                 -- "Ethiopia Guji"
  country text,
  region text,
  subregion text,
  farm text,
  producer text,
  station text,
  variety text,
  process text,                       -- washed | natural | honey | anaerobic ...
  altitude_min int,
  altitude_max int,
  roast_level text,                   -- light | medium | dark
  tasting_notes text,
  description text,
  image_url text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (roaster_id, slug)
);

create index idx_coffees_roaster on public.coffees(roaster_id);
create index idx_coffees_country on public.coffees(country);

-- =========================================================
-- LOTS (specific physical batch — Q-score lives HERE)
-- =========================================================
create table public.lots (
  id uuid primary key default uuid_generate_v4(),
  coffee_id uuid not null references public.coffees(id) on delete cascade,
  lot_number text,
  harvest_year int,
  crop_year int,
  roast_date date,
  roast_profile text,
  q_score numeric(4,1),
  q_score_system text,
  q_grader text,
  q_grading_date date,
  q_notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_lots_coffee on public.lots(coffee_id);
create index idx_lots_q_score on public.lots(q_score);

-- =========================================================
-- QR CODES (each code identifies exactly one lot)
-- =========================================================
create table public.qr_codes (
  id uuid primary key default uuid_generate_v4(),
  lot_id uuid not null references public.lots(id) on delete cascade,
  unique_code text unique not null,   -- "XO-GUJI-2026-LOT24"
  scan_count int not null default 0,
  last_scanned_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_qr_lot on public.qr_codes(lot_id);

-- =========================================================
-- COFFEE SHOP <-> LOT
-- =========================================================
create table public.coffee_shop_lots (
  id uuid primary key default uuid_generate_v4(),
  coffee_shop_id uuid not null references public.coffee_shops(id) on delete cascade,
  lot_id uuid not null references public.lots(id) on delete cascade,
  is_available boolean not null default true,
  added_at timestamptz not null default now(),
  unique (coffee_shop_id, lot_id)
);

create index idx_csl_shop on public.coffee_shop_lots(coffee_shop_id);
create index idx_csl_lot on public.coffee_shop_lots(lot_id);

-- =========================================================
-- FLAVOR TAGS
-- =========================================================
create table public.flavor_tags (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  label text not null,
  emoji text,
  category text,
  created_at timestamptz not null default now()
);

create table public.coffee_flavors (
  id uuid primary key default uuid_generate_v4(),
  coffee_id uuid not null references public.coffees(id) on delete cascade,
  flavor_tag_id uuid not null references public.flavor_tags(id) on delete cascade,
  unique (coffee_id, flavor_tag_id)
);

create index idx_cf_coffee on public.coffee_flavors(coffee_id);
create index idx_cf_flavor on public.coffee_flavors(flavor_tag_id);

-- =========================================================
-- REVIEWS
-- Every re-taste creates a NEW history entry (no unique constraint on
-- user_id + lot_id) so users can track how their perception of the same
-- lot changes over time, per product decision.
-- =========================================================
create table public.reviews (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  coffee_id uuid not null references public.coffees(id) on delete cascade,
  lot_id uuid references public.lots(id) on delete set null,
  coffee_shop_id uuid references public.coffee_shops(id) on delete set null,
  rating numeric(2,1) not null check (rating >= 1 and rating <= 5),
  liked boolean,
  notes text,
  tasted_at timestamptz not null default now(), -- when this particular taste happened
  created_at timestamptz not null default now()
);

create index idx_reviews_user on public.reviews(user_id);
create index idx_reviews_coffee on public.reviews(coffee_id);
create index idx_reviews_lot on public.reviews(lot_id);
create index idx_reviews_user_lot on public.reviews(user_id, lot_id);

create table public.review_flavors (
  id uuid primary key default uuid_generate_v4(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  flavor_tag_id uuid not null references public.flavor_tags(id) on delete cascade,
  unique (review_id, flavor_tag_id)
);

-- =========================================================
-- USER FLAVOR PREFERENCES (derived, deterministic recompute)
-- =========================================================
create table public.user_flavor_preferences (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  flavor_tag_id uuid not null references public.flavor_tags(id) on delete cascade,
  score numeric(5,2) not null default 0,
  sample_size int not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, flavor_tag_id)
);

create index idx_ufp_user on public.user_flavor_preferences(user_id);

-- =========================================================
-- VIEW: Q-score bands vs. user rating (drives "My Taste" §18)
-- =========================================================
create or replace view public.v_user_qscore_bands as
select
  r.user_id,
  case
    when l.q_score < 85 then '<85'
    when l.q_score >= 85 and l.q_score < 86 then '85-86'
    when l.q_score >= 86 and l.q_score < 88 then '86-88'
    else '88+'
  end as q_band,
  avg(r.rating) as avg_rating,
  count(*) as sample_size
from public.reviews r
join public.lots l on l.id = r.lot_id
where l.q_score is not null
group by r.user_id, q_band;

-- =========================================================
-- VIEW: most recent review per user/lot (for "your current rating"
-- on the passport page — history still keeps every past taste)
-- =========================================================
create or replace view public.v_latest_review_per_lot as
select distinct on (r.user_id, r.lot_id)
  r.*
from public.reviews r
where r.lot_id is not null
order by r.user_id, r.lot_id, r.tasted_at desc;

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.users enable row level security;
alter table public.reviews enable row level security;
alter table public.review_flavors enable row level security;
alter table public.user_flavor_preferences enable row level security;
alter table public.roasters enable row level security;
alter table public.roaster_members enable row level security;
alter table public.coffee_shops enable row level security;
alter table public.coffee_shop_members enable row level security;
alter table public.coffees enable row level security;
alter table public.lots enable row level security;
alter table public.qr_codes enable row level security;
alter table public.coffee_shop_lots enable row level security;
alter table public.flavor_tags enable row level security;
alter table public.coffee_flavors enable row level security;

-- Public read for catalog data
create policy "public read roasters" on public.roasters for select using (is_active);
create policy "public read coffee_shops" on public.coffee_shops for select using (is_active);
create policy "public read coffees" on public.coffees for select using (true);
create policy "public read lots" on public.lots for select using (true);
create policy "public read qr_codes" on public.qr_codes for select using (true);
create policy "public read coffee_shop_lots" on public.coffee_shop_lots for select using (true);
create policy "public read flavor_tags" on public.flavor_tags for select using (true);
create policy "public read coffee_flavors" on public.coffee_flavors for select using (true);

-- Users manage their own profile
create policy "user reads own profile" on public.users for select using (auth.uid() = id);
create policy "user updates own profile" on public.users for update using (auth.uid() = id);

-- Reviews: owner-only CRUD, but readable in aggregate via views/RPCs (not raw table)
create policy "user reads own reviews" on public.reviews for select using (auth.uid() = user_id);
create policy "user inserts own reviews" on public.reviews for insert with check (auth.uid() = user_id);
create policy "user updates own reviews" on public.reviews for update using (auth.uid() = user_id);
create policy "user deletes own reviews" on public.reviews for delete using (auth.uid() = user_id);

create policy "user reads own review_flavors" on public.review_flavors for select
  using (exists (select 1 from public.reviews r where r.id = review_id and r.user_id = auth.uid()));
create policy "user inserts own review_flavors" on public.review_flavors for insert
  with check (exists (select 1 from public.reviews r where r.id = review_id and r.user_id = auth.uid()));

create policy "user reads own flavor prefs" on public.user_flavor_preferences for select using (auth.uid() = user_id);

-- Roaster/shop members manage their own org's catalog data
create policy "roaster staff manage coffees" on public.coffees for all
  using (exists (select 1 from public.roaster_members m where m.roaster_id = coffees.roaster_id and m.user_id = auth.uid()));
create policy "roaster staff manage lots" on public.lots for all
  using (exists (
    select 1 from public.coffees c
    join public.roaster_members m on m.roaster_id = c.roaster_id
    where c.id = lots.coffee_id and m.user_id = auth.uid()
  ));
create policy "roaster staff manage qr_codes" on public.qr_codes for all
  using (exists (
    select 1 from public.lots l
    join public.coffees c on c.id = l.coffee_id
    join public.roaster_members m on m.roaster_id = c.roaster_id
    where l.id = qr_codes.lot_id and m.user_id = auth.uid()
  ));

create policy "roaster member reads own membership" on public.roaster_members for select using (auth.uid() = user_id);
create policy "shop member reads own membership" on public.coffee_shop_members for select using (auth.uid() = user_id);