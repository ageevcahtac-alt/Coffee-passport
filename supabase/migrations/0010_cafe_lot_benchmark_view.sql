-- =========================================================
-- Cafe lot benchmark view — anonymized cross-shop leaderboard per lot
-- =========================================================
-- Powers the three ratings on a lot's card in /dashboard/cafe (see
-- components/cafe/LotMenuCard.tsx / LotRatingBenchmarks.tsx):
--   1. "Топ-локация №1" / 2 — this lot's average guest rating in the two
--      coffee shops with the highest average rating for it, anonymized
--      (no coffee_shop_id, no shop name — just rank + the numbers).
--   3. "Ваша кофейня" — the calling cafe_admin's own shop's average for
--      the same lot, which needs no new view: it already reads straight
--      off public.checkins under the existing "shop staff read own shop
--      checkins" policy (see 0007_staff_profiles_rls.sql) filtered to
--      coffee_shop_id = their own cafe_id.
--
-- Same pattern 0007 already used for checkins_roaster_view: a plain view
-- (no security_invoker) runs with its OWNER's privileges, so it can
-- aggregate every shop's rows regardless of the caller's own RLS
-- visibility, while the join to profiles on auth.uid() is the actual
-- gate — it only returns anything for a signed-in cafe_admin session.
-- Unlike checkins_roaster_view this one is NOT scoped to "your own
-- org's rows" (a cafe_admin has no roaster_id/cafe_id-shaped
-- restriction here by design — the whole point is to compare against
-- OTHER shops), it's scoped to "you must be some cafe_admin" and then
-- anonymized by construction: coffee_shop_id never appears in the
-- output, only a 1/2 rank.
--
-- As with every migration in this project: I cannot apply this one
-- myself (no CLI access token, no service-role key, direct Postgres
-- connections are outside this sandbox's policy). Apply via the
-- Supabase SQL Editor, or `supabase db push` after `supabase login &&
-- supabase link --project-ref vodmmtzclvqemcujwmdf`.

create or replace view public.checkins_cafe_benchmark_view as
with shop_lot_stats as (
  select
    c.lot_id,
    c.coffee_shop_id,
    avg(c.rating) as avg_rating,
    count(*) as review_count
  from public.checkins c
  where c.coffee_shop_id <> ''
  group by c.lot_id, c.coffee_shop_id
),
ranked as (
  select
    lot_id,
    avg_rating,
    review_count,
    row_number() over (
      partition by lot_id
      order by avg_rating desc, review_count desc
    ) as rank
  from shop_lot_stats
)
select r.lot_id, r.rank, r.avg_rating, r.review_count
from ranked r
join public.profiles p
  on p.id = auth.uid()
  and p.role = 'cafe_admin'
where r.rank <= 2;

grant select on public.checkins_cafe_benchmark_view to authenticated;
