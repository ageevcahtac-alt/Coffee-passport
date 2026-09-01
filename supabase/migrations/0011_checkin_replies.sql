-- =========================================================
-- checkin_replies — coffee-shop/roaster replies to a guest's checkin
-- =========================================================
-- Replaces the localStorage-only lib/data/reviewRepliesStore.ts (see
-- components/shared/ReviewReplyThread.tsx, rendered from
-- components/cafe/CoffeeReviewCard.tsx and
-- components/roaster/LotGuestAnalytics.tsx). Deliberately a NEW table,
-- not the pre-existing public.review_replies from 0004_taste_profile.sql:
-- that one hangs off public.reviews, a table no current code path in this
-- app writes to. The app's real per-tasting table — the one
-- TastingRecord.id / this component's tastingRecordId prop actually
-- is — is public.checkins, wired up one migration later in
-- 0005_recipes_equipment_checkins.sql. Pointing replies at reviews.id
-- would reference rows that don't exist for any tasting a guest actually
-- makes today; this table is keyed to checkins.id instead, and gets its
-- own RLS matching the real staff-role model from 0007 (review_replies'
-- old "any authenticated user can read/write" policy predates that model
-- and was already flagged there as a gap to tighten, not a pattern worth
-- repeating here).
--
-- As with every migration in this project: I cannot apply this one
-- myself (no CLI access token, no service-role key, direct Postgres
-- connections are outside this sandbox's policy). Apply via the
-- Supabase SQL Editor, or `supabase db push` after `supabase login &&
-- supabase link --project-ref vodmmtzclvqemcujwmdf`.

create table if not exists public.checkin_replies (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  responder_type text not null check (responder_type in ('coffee_shop', 'roaster')),
  -- coffeeShopId or roasterId — opaque text id, same convention as
  -- checkins.coffee_shop_id / checkins.roaster_id (no real FK: there is
  -- still no coffee_shops/roasters table, see 0005's header).
  responder_id text not null,
  -- Display label at time of reply (e.g. shop/roaster name) — captured
  -- as-is rather than joined live, same reasoning checkins itself uses
  -- for denormalized text ids throughout.
  responder_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_checkin_replies_checkin on public.checkin_replies(checkin_id);

alter table public.checkin_replies enable row level security;

-- Read: the guest who owns the checkin, the checkin's own shop's staff,
-- and the checkin's own roaster's roaster_admin — the same three parties
-- who can already see the underlying checkin in some form (see
-- "owner manages own checkins" / "shop staff read own shop checkins" in
-- 0007_staff_profiles_rls.sql, and checkins_roaster_view for the
-- roaster's anonymized read). A thread should show every reply to
-- everyone who can already see the checkin it's attached to — replies
-- aren't more sensitive than the checkin itself.
create policy "checkin participants read replies" on public.checkin_replies
  for select
  using (
    exists (
      select 1 from public.checkins c
      where c.id = checkin_replies.checkin_id
        and (
          c.owner_user_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and (
                (p.role in ('barista', 'cafe_admin') and p.cafe_id = c.coffee_shop_id)
                or (p.role = 'roaster_admin' and p.roaster_id = c.roaster_id)
              )
          )
        )
    )
  );

-- Insert: only a shop's own staff can post as that shop, only a
-- roaster's own roaster_admin can post as that roaster — and only onto a
-- checkin that actually belongs to their own shop/roaster. Checked both
-- ways (responder_id must equal the writer's own scoped id, AND the
-- checkin's coffee_shop_id/roaster_id must match that same id) so nobody
-- can reply "as" a different shop/roaster than their own even by mistake.
create policy "shop staff reply as their own shop" on public.checkin_replies
  for insert
  with check (
    responder_type = 'coffee_shop'
    and exists (
      select 1 from public.checkins c
      join public.profiles p on p.id = auth.uid()
      where c.id = checkin_replies.checkin_id
        and p.role in ('barista', 'cafe_admin')
        and p.cafe_id = c.coffee_shop_id
        and checkin_replies.responder_id = p.cafe_id
    )
  );

create policy "roaster admin replies as their own roaster" on public.checkin_replies
  for insert
  with check (
    responder_type = 'roaster'
    and exists (
      select 1 from public.checkins c
      join public.profiles p on p.id = auth.uid()
      where c.id = checkin_replies.checkin_id
        and p.role = 'roaster_admin'
        and p.roaster_id = c.roaster_id
        and checkin_replies.responder_id = p.roaster_id
    )
  );

grant select, insert on public.checkin_replies to authenticated;
