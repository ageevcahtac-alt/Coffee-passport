-- =========================================================
-- CANONICAL LOT — Phase 4.1 / migration A (core identity + product chain)
--
-- Implements the entity split approved in Stage 3
-- (Coffee Passport 2.0 → Stage 2.5 Reconciliation → Stage 3 Canonical Lot
-- Architecture): Coffee (origin) -> Green Lot (physical purchase) -> Lot
-- (commercial product). Roast/taste reference profiles are a separate
-- migration (0023) since they FK into lots.id created here.
--
-- `roasters` / `coffee_shops` are deliberately thin identity anchors, not a
-- migration of the full localStorage Roaster/CoffeeShop profile shape
-- (lib/types/coffee.ts). They exist only so lots/green_lots/coffees have a
-- real foreign key target, and so today's text ids ("roaster-xo",
-- "shop-xo-vsevolozhsk") have a stable place to resolve into during
-- backfill — see `slug`. Nothing else about Roaster/CoffeeShop moves here.
--
-- Table-name note: `0004_taste_profile.sql`'s own header records that the
-- full relational schema from `0001_init_schema.sql` (which also defines
-- `public.roasters` / `public.coffee_shops`) was never applied to the live
-- database. That finding was independently reconfirmed by the Coffee
-- Passport 2.0 Audit and by Stage 3. This migration relies on that same
-- finding to reuse these two table names for their intended target shape.
-- If it ever turns out `0001` was partially applied after all, this
-- `create table if not exists` will silently keep 0001's incompatible
-- columns instead of failing loudly — that risk is accepted here exactly as
-- prior migrations (0004, 0005) already accepted it for `checkins`.
-- =========================================================

create table if not exists public.roasters (
  id uuid primary key default gen_random_uuid(),
  -- Stable text anchor equal to today's hardcoded ids (e.g. 'roaster-xo',
  -- 'roaster-north-star') — lets profiles.roaster_id (text, unchanged) and
  -- localStorage Roaster.id resolve to this row during backfill without
  -- touching the profiles table.
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.coffee_shops (
  id uuid primary key default gen_random_uuid(),
  -- Same pattern as roasters.slug — e.g. 'shop-xo-vsevolozhsk'.
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

-- =========================================================
-- COFFEE — origin description, scoped to one roaster (Stage 3 §01: no
-- global origin canonicalization on this pass).
-- =========================================================
create table if not exists public.coffees (
  id uuid primary key default gen_random_uuid(),
  roaster_id uuid not null references public.roasters(id) on delete restrict,
  country text not null,
  region text not null default '',
  farm text not null default '',        -- farm / washing station / cooperative
  producer text not null default '',
  variety text not null default '',
  altitude text not null default '',    -- free text, matches ProducerProfile.altitude convention
  processing text not null default '',
  harvest_year text not null default '', -- free text, matches Lot.cropYear convention ("2025/2026")
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_coffees_roaster on public.coffees(roaster_id);

-- =========================================================
-- GREEN LOT — one physical purchase of green coffee under a Coffee origin.
-- Stage 3 §02: Coffee 1→N Green Lot, Green Lot 1→N Lot.
-- =========================================================
create table if not exists public.green_lots (
  id uuid primary key default gen_random_uuid(),
  coffee_id uuid not null references public.coffees(id) on delete restrict,
  -- Denormalized for simpler RLS joins (matches coffees.roaster_id) — not a
  -- second source of truth, always equal to coffees.roaster_id for coffee_id.
  roaster_id uuid not null references public.roasters(id) on delete restrict,
  purchased_kg numeric,
  purchase_date date,
  contract_reference text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_green_lots_coffee on public.green_lots(coffee_id);
create index if not exists idx_green_lots_roaster on public.green_lots(roaster_id);

-- =========================================================
-- LOT — the canonical commercial product. Stage 3 §03/§04: exactly one
-- Green Lot per Lot; public_id is the immutable, human-readable identifier
-- already used as the QR payload and /passport/[lotId] route param today
-- (lib/data/lotsStore.ts generateLotId()) — format unchanged, only where
-- uniqueness is enforced changes (real DB constraint, not a per-browser
-- localStorage scan).
--
-- Sensory reference values (4-axis roasterFlavorProfile) are deliberately
-- NOT columns here — they live in reference_taste_profiles (0023) as
-- versioned rows, per Stage 3 §07/§15. A Lot that has never had a version
-- marked active simply has no active reference taste/roast profile yet
-- (status='draft'/'testing').
-- =========================================================
create table if not exists public.lots (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  roaster_id uuid not null references public.roasters(id) on delete restrict,
  green_lot_id uuid not null references public.green_lots(id) on delete restrict,
  name text not null,
  descriptors jsonb not null default '[]'::jsonb,
  q_grade numeric(4,1),
  roast_type text not null default '' check (roast_type in ('', 'filter', 'espresso', 'omni', 'alternative')),
  -- Branded roast-approach label shown to guests (e.g. "Pure Roast®") —
  -- distinct from the structured Reference Roast Profile entity (0023),
  -- kept here only as display copy, matching Lot.roastProfile:string today.
  roast_profile_label text not null default '',
  status text not null default 'draft' check (status in ('draft', 'testing', 'active', 'archived')),
  -- Roaster's own "still in production" catalog flag — see the identical
  -- field's comment in lib/types/coffee.ts: turning this off must never
  -- cascade into hiding the lot from a shop that already stocked it.
  in_roaster_catalog boolean not null default true,
  -- Traceability only: the pre-migration text Lot.id this row was backfilled
  -- from (e.g. "LOT-XO-ETH-001"), so the Stage 4 migration report can show
  -- exactly which legacy id maps to which new row. Null for lots created
  -- fresh after this migration.
  legacy_text_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lots_roaster on public.lots(roaster_id);
create index if not exists idx_lots_green_lot on public.lots(green_lot_id);
create index if not exists idx_lots_status on public.lots(status);
create index if not exists idx_lots_legacy_text_id on public.lots(legacy_text_id);
