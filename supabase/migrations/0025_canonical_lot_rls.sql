-- =========================================================
-- CANONICAL LOT — Phase 4.1 / migration D (minimal RLS for the new tables
-- only). Depends on 0022, 0023.
--
-- Stage 4 §27: this is not a general RLS audit or hardening pass — existing
-- policies on profiles/checkins/recipes/cafe_menu_entries/loyalty_* are
-- untouched. The goal here is narrow: the eight new tables from 0022/0023
-- must not be world-writable just because they're new.
--
-- Trust model, matched deliberately to what already exists in this project
-- rather than invented fresh:
--   - SELECT is public (anon + authenticated) for every new table, exactly
--     like recipes/cafe_menu_entries/events today — a guest scanning a QR
--     with no session must be able to read a Lot's catalog and reference
--     profile data.
--   - INSERT/UPDATE/DELETE is restricted to the roaster staff who own that
--     row's roaster_id (via the Lot it belongs to, where applicable),
--     using the same recursion-safe security-definer-function pattern
--     0013 already established for is_shop_staff() — not a new pattern.
--   - roast_batches additionally relies on the immutability trigger from
--     0023 to block UPDATE/DELETE outright, regardless of role.
-- =========================================================

-- Bridges profiles.roaster_id (text, e.g. 'roaster-xo') to roasters.id
-- (uuid) via roasters.slug, so this stage does not need to touch the
-- profiles table at all to gain real per-roaster write scoping.
create or replace function public.is_roaster_staff_for(target_roaster_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roasters r on r.slug = p.roaster_id
    where p.id = auth.uid()
      and p.role = 'roaster_admin'
      and r.id = target_roaster_id
  );
$$;

grant execute on function public.is_roaster_staff_for(uuid) to authenticated;

-- Same bridge for coffee_shops.slug ↔ profiles.cafe_id, kept for symmetry
-- and future use even though nothing writes coffee_shops rows in this
-- stage (Stage 4 §9 — thin identity anchor only).
create or replace function public.is_cafe_staff_for(target_shop_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.coffee_shops s on s.slug = p.cafe_id
    where p.id = auth.uid()
      and p.role in ('barista', 'cafe_admin')
      and s.id = target_shop_id
  );
$$;

grant execute on function public.is_cafe_staff_for(uuid) to authenticated;

-- =========================================================
alter table public.roasters enable row level security;
alter table public.coffee_shops enable row level security;
alter table public.coffees enable row level security;
alter table public.green_lots enable row level security;
alter table public.lots enable row level security;
alter table public.reference_roast_profiles enable row level security;
alter table public.roast_batches enable row level security;
alter table public.reference_taste_profiles enable row level security;

grant select on public.roasters, public.coffee_shops, public.coffees, public.green_lots,
  public.lots, public.reference_roast_profiles, public.roast_batches, public.reference_taste_profiles
  to anon, authenticated;
grant insert, update on public.roasters, public.coffee_shops, public.coffees, public.green_lots,
  public.lots, public.reference_roast_profiles, public.reference_taste_profiles
  to authenticated;
grant insert on public.roast_batches to authenticated;

create policy "public reads roasters" on public.roasters
  for select using (true);

create policy "roaster staff manage own roaster row" on public.roasters
  for update using (public.is_roaster_staff_for(id)) with check (public.is_roaster_staff_for(id));

create policy "public reads coffee shops" on public.coffee_shops
  for select using (true);

create policy "cafe staff manage own shop row" on public.coffee_shops
  for update using (public.is_cafe_staff_for(id)) with check (public.is_cafe_staff_for(id));

create policy "public reads coffees" on public.coffees
  for select using (true);

create policy "roaster staff manage own coffees" on public.coffees
  for all using (public.is_roaster_staff_for(roaster_id)) with check (public.is_roaster_staff_for(roaster_id));

create policy "public reads green lots" on public.green_lots
  for select using (true);

create policy "roaster staff manage own green lots" on public.green_lots
  for all using (public.is_roaster_staff_for(roaster_id)) with check (public.is_roaster_staff_for(roaster_id));

create policy "public reads lots" on public.lots
  for select using (true);

create policy "roaster staff manage own lots" on public.lots
  for all using (public.is_roaster_staff_for(roaster_id)) with check (public.is_roaster_staff_for(roaster_id));

create policy "public reads reference roast profiles" on public.reference_roast_profiles
  for select using (true);

create policy "roaster staff manage own reference roast profiles" on public.reference_roast_profiles
  for all
  using (public.is_roaster_staff_for((select l.roaster_id from public.lots l where l.id = lot_id)))
  with check (public.is_roaster_staff_for((select l.roaster_id from public.lots l where l.id = lot_id)));

create policy "public reads roast batches" on public.roast_batches
  for select using (true);

-- Insert-only by design: the trigger from 0023 already rejects UPDATE/DELETE
-- unconditionally, so no update/delete policy is needed or possible here.
create policy "roaster staff create own roast batches" on public.roast_batches
  for insert
  with check (public.is_roaster_staff_for((select l.roaster_id from public.lots l where l.id = lot_id)));

create policy "public reads reference taste profiles" on public.reference_taste_profiles
  for select using (true);

create policy "roaster staff manage own reference taste profiles" on public.reference_taste_profiles
  for all
  using (public.is_roaster_staff_for((select l.roaster_id from public.lots l where l.id = lot_id)))
  with check (public.is_roaster_staff_for((select l.roaster_id from public.lots l where l.id = lot_id)));
