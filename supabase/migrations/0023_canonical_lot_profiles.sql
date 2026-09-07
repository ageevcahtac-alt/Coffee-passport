-- =========================================================
-- CANONICAL LOT — Phase 4.1 / migration B (versioned reference profiles +
-- immutable roast events). Depends on 0022 (public.lots).
--
-- Stage 3 §06/§07/§15/§25: two independently versioned reference profiles
-- per Lot (roast + taste), each with "exactly one active version" enforced
-- by a partial unique index rather than a denormalized pointer column on
-- lots — so there is only one place a version's status can disagree with
-- reality. Roast Batch is a separate, immutable event log: a new roast does
-- NOT create a new Reference Roast Profile version, and a Reference Roast
-- Profile change does NOT rewrite which version past batches point to.
--
-- Naming note: today's client-side RoastProfile type (lib/types/coffee.ts,
-- lib/data/roastProfilesStore.ts) already conflates these two concepts —
-- one array-of-records-per-lot, each carrying an actual logged curve, shown
-- newest-first with no "this one is the reference" flag. That is closer to
-- Roast Batch than to Reference Roast Profile. This migration keeps that
-- existing shape's fields on roast_batches (the actual-event table) and
-- adds the missing reference/target concept as a new, separate table.
-- =========================================================

-- =========================================================
-- REFERENCE ROAST PROFILE — the roaster's declared target approach for a
-- Lot. `target_curve` is the intended/target curve shape, distinct from an
-- actual Roast Batch's logged curve below.
-- =========================================================
create table if not exists public.reference_roast_profiles (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete restrict,
  version integer not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'superseded')),
  machine_model text not null default '',
  target_curve jsonb not null default '[]'::jsonb, -- [{timeSec, bt, et, ror}, ...]
  agtron_target numeric,
  notes text not null default '',
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (lot_id, version)
);

create index if not exists idx_ref_roast_profiles_lot on public.reference_roast_profiles(lot_id);

-- Exactly one active version per Lot — enforced by the database, not by
-- application discipline.
create unique index if not exists idx_ref_roast_profiles_one_active
  on public.reference_roast_profiles(lot_id) where status = 'active';

-- =========================================================
-- ROAST BATCH — one real, immutable roasting event. `reference_roast_profile_id`
-- is nullable: an early test roast during a Lot's `testing` lifecycle stage
-- may predate any finalized reference profile (Stage 3 §06). It always
-- stores the EXACT version that was followed — never "whatever is active
-- now" — so a later profile change can never make a past batch look like it
-- followed a profile it never saw.
-- =========================================================
create table if not exists public.roast_batches (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete restrict,
  reference_roast_profile_id uuid references public.reference_roast_profiles(id) on delete restrict,
  batch_number text not null default '',
  roasted_at timestamptz not null default now(),
  machine_model text not null default '',
  green_kg numeric,
  charge_temp numeric,
  drop_temp numeric,
  first_crack_time_sec integer,
  total_time_sec integer,
  dtr_percent numeric,
  agtron_number numeric,
  curve jsonb not null default '[]'::jsonb, -- actual logged [{timeSec, bt, et, ror}, ...] for this event
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_roast_batches_lot on public.roast_batches(lot_id);
create index if not exists idx_roast_batches_profile on public.roast_batches(reference_roast_profile_id);

-- Roast Batch rows are historical events, not editable records — enforced
-- here rather than left as an application-only convention, since this is a
-- genuine data-integrity invariant (Stage 3 §15/§25), not extra machinery.
create or replace function public.prevent_roast_batch_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'roast_batches rows are immutable once created (attempted % on id=%)', tg_op, coalesce(old.id, new.id);
end;
$$;

drop trigger if exists trg_roast_batches_immutable on public.roast_batches;
create trigger trg_roast_batches_immutable
  before update or delete on public.roast_batches
  for each row execute function public.prevent_roast_batch_mutation();

-- =========================================================
-- REFERENCE TASTE PROFILE — versioned expected sensory read for a Lot.
-- Canonical 4-axis model only (Stage 3 §07/§10) — acidity/sweetness/body/
-- bitterness. Milk-drink and aftertaste axes are NOT reference-side
-- concepts (they describe one guest's cup, not the roaster's expectation
-- for the lot as a whole) and are intentionally absent here.
-- =========================================================
create table if not exists public.reference_taste_profiles (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete restrict,
  version integer not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'superseded')),
  acidity numeric(2, 1) not null check (acidity between 0 and 5),
  sweetness numeric(2, 1) not null check (sweetness between 0 and 5),
  body numeric(2, 1) not null check (body between 0 and 5),
  bitterness numeric(2, 1) not null check (bitterness between 0 and 5),
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (lot_id, version)
);

create index if not exists idx_ref_taste_profiles_lot on public.reference_taste_profiles(lot_id);

create unique index if not exists idx_ref_taste_profiles_one_active
  on public.reference_taste_profiles(lot_id) where status = 'active';
