-- =========================================================
-- Community view — expose sensory_tags (Contextual Taste block)
-- =========================================================
-- COFFEE_PASSPORT_CONTEXTUAL_TASTE_UX.md's community aggregation ("как его
-- чувствовали другие" / "чаще всего отмечали") needs real descriptor
-- words, not only the four numeric axes checkins_community_view already
-- exposed — otherwise "most common perception" can only ever be phrased as
-- an average number, which doesn't match how a guest actually describes a
-- cup.
--
-- sensory_tags is a small, fixed-vocabulary category list (see
-- SENSORY_TAGS in lib/types/coffee.ts — "Сладость", "Кислотность",
-- "Фруктовость", etc.), not free text and not identity-revealing. It is
-- already exposed to staff in two other views
-- (checkins_roaster_view/0007, a similar cafe-benchmark view/0021) for the
-- exact same "what did people notice" tally purpose — this is the same
-- column, in the same anonymous shape, added to a third, already-public
-- view. It does NOT reopen anything 0026 deliberately closed: that
-- migration's own comment excludes owner_user_id, coffee_shop_id,
-- roaster_id, barista fields, sub_descriptors (the free-form flavor-wheel
-- drill-down, still excluded here), defects, and the adaptive milk/drink
-- axes — none of that changes. sensory_tags was simply never added when
-- 0026 was first written; this is additive, not a reversal.
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
  c.created_at,
  c.sensory_tags
from public.checkins c
where c.is_public = true;

-- Grant unchanged (already select-only, already anon+authenticated per
-- 0026) — re-stated here only for clarity, not a behavior change.
grant select on public.checkins_community_view to anon, authenticated;
