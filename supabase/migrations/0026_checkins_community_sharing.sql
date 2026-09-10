-- =========================================================
-- Checkins — opt-in Community sharing (Community/Social Layer, Category A)
-- =========================================================
-- See COMMUNITY_LAYER_PRODUCT_AUDIT.md. Mirrors the exact pattern already
-- proven for public.recipes: BrewingRecipe.isPublic is an explicit opt-in
-- consent checkbox (default false — see EnthusiastRecipeForm.tsx), never
-- automatic. This applies the same shape to public.checkins: a personal
-- tasting stays strictly private (existing "owner manages own checkins"
-- RLS, unmodified) unless the guest who saved it explicitly opts in.
--
-- Read access for opted-in rows is via a view, not a new RLS policy on the
-- base table — the same technique already used twice in this schema
-- (checkins_roaster_view, checkins_cafe_benchmark_view: "a plain view (no
-- security_invoker) runs with its OWNER's privileges", see
-- 0010_cafe_lot_benchmark_view.sql's own comment). This view exposes only
-- the fields meaningful to "how did the community perceive this coffee's
-- taste" — never owner_user_id, coffee_shop_id, roaster_id, barista_id/
-- barista_rating/barista_note, sub_descriptors, defects, or any of the
-- adaptive milk/drink axes. Community-shared tastings stay anonymous by
-- construction: this app has no real display-name/profile entity for a
-- guest at all (every "authorName" elsewhere in this codebase is the
-- literal placeholder "Вы", never a real identity), so there is nothing
-- safe to attribute a shared tasting to beyond "someone."
alter table public.checkins add column if not exists is_public boolean not null default false;

create or replace view public.checkins_community_view as
select
  c.id,
  c.lot_id,
  c.brewing_method,
  c.rating,
  c.acidity,
  c.sweetness,
  c.body,
  c.bitterness,
  c.liked,
  c.disliked,
  c.note,
  c.created_at
from public.checkins c
where c.is_public = true;

-- No sign-in required to READ community tastings — same "guests browsing a
-- lot need no account" tier already established for public recipes
-- (0005_recipes_equipment_checkins.sql's RLS comment). Only WRITING an
-- opt-in stays gated by the existing owner-only checkins RLS/grant
-- (unmodified) — an anonymous guest's checkin never reaches this table at
-- all (owner_user_id references auth.users, on delete cascade), so opting
-- in only ever has an effect for a signed-in guest.
grant select on public.checkins_community_view to anon, authenticated;
