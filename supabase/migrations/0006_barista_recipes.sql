-- =========================================================
-- Barista as a fourth recipe author type
-- =========================================================
-- Layers on top of 0005_recipes_equipment_checkins.sql (as of this
-- writing, still not confirmed applied to the live database either — see
-- that migration's own note on why I can't apply migrations myself from
-- this environment). Written with `drop constraint/policy if exists`
-- guards throughout so it's safe to run whether 0005 already landed or
-- this is applied together with it in one pass.
--
-- A barista's own recipe (authorId = that barista's id, authorName = their
-- display name — see lib/data/baristas.ts) joins the same open, no-real-
-- auth-yet trust tier as roaster/coffee_shop rows: /dashboard/barista has
-- no auth gate either, same pilot-scoping reality as /dashboard/roaster
-- and /dashboard/cafe.

alter table public.recipes drop constraint if exists recipes_author_type_check;
alter table public.recipes
  add constraint recipes_author_type_check
  check (author_type in ('roaster', 'coffee_shop', 'barista', 'enthusiast'));

alter table public.recipes drop constraint if exists recipes_owner_matches_author_type;
alter table public.recipes
  add constraint recipes_owner_matches_author_type
  check (
    (author_type = 'enthusiast' and owner_user_id is not null)
    or (author_type in ('roaster', 'coffee_shop', 'barista') and owner_user_id is null)
  );

drop policy if exists "open access to roaster/shop recipes" on public.recipes;
drop policy if exists "open access to roaster/shop/barista recipes" on public.recipes;
create policy "open access to roaster/shop/barista recipes" on public.recipes
  for all
  using (author_type in ('roaster', 'coffee_shop', 'barista'))
  with check (author_type in ('roaster', 'coffee_shop', 'barista') and owner_user_id is null);

-- Note — deliberately NOT touching public.checkins here: the guest
-- service/staff feedback split (☕ Кофе и экстракция vs 👤 Сервис и
-- внешний вид) stays a client-side view over the existing strictly
-- owner-only checkins RLS (auth.uid() = owner_user_id, unchanged since
-- 0005). Genuinely restricting that data to "this shop's barista + this
-- shop's manager, but never a roaster" at the RLS layer requires a real
-- per-role membership/auth system — neither /dashboard/barista,
-- /dashboard/cafe nor /dashboard/roaster have one yet (all three are
-- unauthenticated pilot-scoped pages, same as always). Opening checkins
-- up by coffee_shop_id here would not actually achieve that isolation
-- (nothing at the DB level could tell a roaster's request from a
-- barista's), so today's real isolation is structural: the roaster
-- dashboard's own code never queries barista/service feedback at all
-- (see components/roaster/LotGuestAnalytics.tsx, which only ever reads
-- coffee/flavor fields). Revisit once staff auth exists.
