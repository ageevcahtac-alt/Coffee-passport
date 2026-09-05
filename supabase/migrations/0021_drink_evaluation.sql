-- =========================================================
-- Drink selection + adaptive taste axes for the guest blind-tasting flow
-- (Энтузиаст cabinet, /passport/[lotId]/taste). Before the blind flavor
-- assessment, the guest now picks a drink category (milk / black / filter),
-- a specific drink or brew method within it, and — for milk drinks — a full
-- milk-base tree (cow vs. plant, fat %, lactose-free). See
-- components/coffee/DrinkTypeSelector.tsx and MilkBaseSelector.tsx.
--
-- All new columns are nullable or defaulted so every checkins row recorded
-- before this feature reads back as "not specified" rather than failing —
-- mirrors lib/journey/store.ts's normalizeRecord() backfill for old
-- localStorage-only records.
--
-- guestFlavorProfile (acidity/sweetness/body/bitterness) is intentionally
-- left untouched: it's what TasteComparison diffs against the roaster's own
-- cupping profile, and that comparison must stay identical across every
-- drink category and brewing method. The new milk_balance/coffee_readability/
-- creaminess/aftertaste columns are purely additive, category-specific
-- axes layered on top — never a replacement for the core four.
-- =========================================================

alter table public.checkins
  add column if not exists drink_category text not null default '',
  add column if not exists drink_type text not null default '',
  add column if not exists custom_drink_name text not null default '',
  add column if not exists milk_base_type text,
  add column if not exists cow_milk_type text,
  add column if not exists is_lactose_free boolean not null default false,
  add column if not exists fat_content_percent numeric(3, 1),
  add column if not exists plant_milk_type text,
  add column if not exists milk_balance numeric(2, 1),
  add column if not exists coffee_readability numeric(2, 1),
  add column if not exists creaminess numeric(2, 1),
  add column if not exists aftertaste numeric(2, 1);

alter table public.checkins drop constraint if exists checkins_drink_category_check;
alter table public.checkins
  add constraint checkins_drink_category_check
  check (drink_category in ('', 'milk_based', 'black_coffee', 'filter_alternative'));

alter table public.checkins drop constraint if exists checkins_milk_base_type_check;
alter table public.checkins
  add constraint checkins_milk_base_type_check
  check (milk_base_type is null or milk_base_type in ('cow', 'plant'));

alter table public.checkins drop constraint if exists checkins_cow_milk_type_check;
alter table public.checkins
  add constraint checkins_cow_milk_type_check
  check (cow_milk_type is null or cow_milk_type in ('whole', 'normalized'));

alter table public.checkins drop constraint if exists checkins_fat_content_percent_check;
alter table public.checkins
  add constraint checkins_fat_content_percent_check
  check (fat_content_percent is null or fat_content_percent between 0 and 100);

alter table public.checkins drop constraint if exists checkins_milk_balance_check;
alter table public.checkins
  add constraint checkins_milk_balance_check
  check (milk_balance is null or milk_balance between 0 and 5);

alter table public.checkins drop constraint if exists checkins_coffee_readability_check;
alter table public.checkins
  add constraint checkins_coffee_readability_check
  check (coffee_readability is null or coffee_readability between 0 and 5);

alter table public.checkins drop constraint if exists checkins_creaminess_check;
alter table public.checkins
  add constraint checkins_creaminess_check
  check (creaminess is null or creaminess between 0 and 5);

alter table public.checkins drop constraint if exists checkins_aftertaste_check;
alter table public.checkins
  add constraint checkins_aftertaste_check
  check (aftertaste is null or aftertaste between 0 and 5);

-- Roaster analytics view (see 0007_staff_profiles_rls.sql): extend with the
-- drink/milk facts, genuinely useful for "how is my lot actually being
-- drunk" analytics. Still excludes everything owner/barista-identifying —
-- same privacy boundary as the original view.
--
-- The new columns land in the middle of the select list (ahead of
-- created_at) instead of at the end, so `create or replace view` alone
-- fails with 42P16 ("cannot change name of view column") — Postgres only
-- allows CREATE OR REPLACE to append columns, not reorder them. Drop and
-- recreate instead; CASCADE takes the view's own dependents with it (none
-- currently depend on it), and the grant below re-establishes access since
-- a dropped-and-recreated view is a new object with no prior grants.
drop view if exists public.checkins_roaster_view cascade;

create view public.checkins_roaster_view as
select
  c.id,
  c.lot_id,
  c.roaster_id,
  c.brewing_method,
  c.rating,
  c.acidity,
  c.sweetness,
  c.body,
  c.bitterness,
  c.sensory_tags,
  c.sub_descriptors,
  c.defects,
  c.liked,
  c.disliked,
  c.note,
  c.drink_category,
  c.drink_type,
  c.custom_drink_name,
  c.milk_base_type,
  c.cow_milk_type,
  c.is_lactose_free,
  c.fat_content_percent,
  c.plant_milk_type,
  c.milk_balance,
  c.coffee_readability,
  c.creaminess,
  c.aftertaste,
  c.created_at
from public.checkins c
join public.profiles p
  on p.id = auth.uid()
  and p.role = 'roaster_admin'
  and p.roaster_id = c.roaster_id;

grant select on public.checkins_roaster_view to authenticated;
