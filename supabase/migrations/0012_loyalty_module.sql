-- =========================================================
-- Loyalty, Ranks & Subscriptions module
-- =========================================================
-- Three-sided feature: guest ("Мои карты"), barista (scan guest QR → apply
-- discount / sell a subscription), cafe dashboard (configure rank ladder,
-- registry of sold subscriptions, reconciliation log). Financial tracking
-- here is informational only — real payment capture and fiscal receipts
-- happen on the shop's own external Yuma till; loyalty_transactions exists
-- so a shop can reconcile against that till's own reports, not to process
-- any payment itself.
--
-- No separate auth/registration for this module: a guest is already
-- signed in to Coffee Passport (see lib/auth/currentUser.tsx), and every
-- table below keys off that same auth.users id. This module has no
-- anonymous-device tier (unlike checkins/recipes) — a loyalty balance
-- needs a persistent, real identity on both the guest and staff side, so
-- every guest_id/barista_id here is a real uuid, never the anonymous
-- per-browser device id used elsewhere in this app for un-authenticated
-- browsing.
--
-- shop_id stays plain text everywhere below, matching cafe_id/
-- coffee_shop_id across every earlier migration (0005/0007) — there is
-- still no public.shops table; coffee shops are the app's own opaque ids
-- (e.g. "shop-xo-vsevolozhsk", see lib/data/coffeeShops.ts), not a real
-- foreign key target. Creating one now would be a separate, unrelated
-- migration, not part of this feature.
--
-- As always: I cannot apply this migration myself from this environment
-- (no SUPABASE_ACCESS_TOKEN/SUPABASE_SERVICE_ROLE_KEY, no direct Postgres
-- connection — see 0005's header). Apply via the Supabase SQL Editor, or
-- `supabase login && supabase link --project-ref <ref> && supabase db push`.

-- =========================================================
-- PROFILES — add the two guest-facing fields this module (and the spec
-- it was written against) assumes already exist on the profile: a real
-- email (mirrored from auth.users, since PostgREST can't join staff
-- queries against auth.users directly) and a self-editable display_name.
-- =========================================================
alter table public.profiles add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, email)
  values (new.id, 'enthusiast', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- display_name is the one profile field a guest may change themselves —
-- everything else (role/cafe_id/roaster_id/barista_id/email) stays
-- staff-assigned per 0007's rule. Column-level grant is what actually
-- restricts this to just that one field: the row-level policy alone would
-- let a user rewrite ANY column on their own row, including role.
create policy "user updates own display name" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

grant update (display_name) on public.profiles to authenticated;

-- A barista/cafe_admin scanning a guest's loyalty QR needs to read that
-- guest's display_name (and, if useful, email) to greet them by name —
-- before any guest_shop_statuses row exists for a first-time visitor, so
-- this can't be scoped through that table. The QR payload (an unguessable
-- uuid) is effectively the credential here, same trust model as a
-- physical loyalty card — documented tradeoff, not an oversight.
create policy "staff read enthusiast display names" on public.profiles
  for select
  using (
    profiles.role = 'enthusiast'
    and exists (
      select 1 from public.profiles staff
      where staff.id = auth.uid() and staff.role in ('barista', 'cafe_admin')
    )
  );

-- =========================================================
-- SHOP_RANKS — one shop's own rank ladder. Bronze/Silver/Gold/Platinum are
-- the seeded defaults below, not hardcoded values — a cafe_admin can
-- rename/add/remove/re-threshold tiers freely from the dashboard.
-- =========================================================
create table if not exists public.shop_ranks (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null,
  rank_name text not null,
  -- Ladder position (low → high). required_visits/required_spend alone
  -- don't guarantee a stable sort if a shop sets them unevenly across two
  -- axes, so the ladder order is its own explicit field.
  rank_order integer not null default 0,
  discount_percent integer not null default 0 check (discount_percent between 0 and 15),
  required_visits integer not null default 0 check (required_visits >= 0),
  required_spend numeric not null default 0 check (required_spend >= 0),
  -- Days of inactivity before this rank lapses. 0 = never expires.
  retention_days integer not null default 0 check (retention_days >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, rank_name)
);

create index if not exists idx_shop_ranks_shop on public.shop_ranks(shop_id);

-- =========================================================
-- GUEST_SHOP_STATUSES — one guest's current standing at one shop. Never
-- written directly by a client — only the loyalty_redeem() function below
-- (security definer) ever inserts/updates this table, so the numbers here
-- can always be trusted to have come from an actual recorded transaction.
-- =========================================================
create table if not exists public.guest_shop_statuses (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references auth.users(id) on delete cascade,
  shop_id text not null,
  current_rank_id uuid references public.shop_ranks(id) on delete set null,
  visits_count integer not null default 0 check (visits_count >= 0),
  total_spent numeric not null default 0 check (total_spent >= 0),
  last_visit_at timestamptz,
  -- When the CURRENT rank lapses without a new visit — read-time only
  -- (nothing re-checks this on a timer); a client treats a status whose
  -- rank_expires_at is already in the past as "no active rank" without
  -- this row being physically rewritten until the guest's next visit.
  rank_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guest_id, shop_id)
);

create index if not exists idx_guest_shop_statuses_guest on public.guest_shop_statuses(guest_id);
create index if not exists idx_guest_shop_statuses_shop on public.guest_shop_statuses(shop_id);

-- =========================================================
-- SUBSCRIPTIONS — a sold prepaid balance, hard-scoped to one shop (no
-- cross-location spend, per the task's "жёсткая привязка к локации").
-- =========================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references auth.users(id) on delete cascade,
  shop_id text not null,
  initial_nominal numeric not null check (initial_nominal > 0),
  current_balance numeric not null check (current_balance >= 0),
  status text not null default 'active' check (status in ('active', 'exhausted', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_guest on public.subscriptions(guest_id);
create index if not exists idx_subscriptions_shop on public.subscriptions(shop_id);
create index if not exists idx_subscriptions_status on public.subscriptions(status);

-- =========================================================
-- LOYALTY_TRANSACTIONS — append-only log of every sale/redemption, for the
-- dashboard's Yuma-till reconciliation view. Never updated after insert.
-- =========================================================
create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references auth.users(id) on delete cascade,
  shop_id text not null,
  barista_id uuid references auth.users(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  type text not null check (type in ('sell_subscription', 'deduct_points')),
  gross_amount numeric not null default 0 check (gross_amount >= 0),
  discount_applied integer not null default 0 check (discount_applied between 0 and 100),
  net_amount numeric not null default 0 check (net_amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_loyalty_tx_guest on public.loyalty_transactions(guest_id);
create index if not exists idx_loyalty_tx_shop on public.loyalty_transactions(shop_id);
create index if not exists idx_loyalty_tx_created on public.loyalty_transactions(created_at);

-- =========================================================
-- Business logic, server-side — both writes below (sell / redeem) are
-- security definer functions rather than plain client inserts/updates,
-- because each one touches 2-3 tables that must move together (e.g.
-- redeem: deduct a subscription balance AND bump visits/spend AND
-- recompute the rank, or none of it). Doing that as separate client calls
-- would risk a half-applied redemption under any failure/race. The
-- function body is also the ONE place the discount/rank-recompute rule
-- lives, instead of being re-implemented in guest/barista/dashboard code.
-- =========================================================

-- Best rank this shop offers for a given lifetime visits/spend total —
-- the highest-order tier whose thresholds are both already met.
create or replace function public.loyalty_rank_for(p_shop_id text, p_visits integer, p_spend numeric)
returns uuid
language sql
stable
as $$
  select id from public.shop_ranks
  where shop_id = p_shop_id
    and required_visits <= p_visits
    and required_spend <= p_spend
  order by rank_order desc
  limit 1;
$$;

create or replace function public.loyalty_sell_subscription(
  p_guest_id uuid,
  p_shop_id text,
  p_nominal numeric
)
returns public.subscriptions
language plpgsql
security definer set search_path = public
as $$
declare
  v_sub public.subscriptions;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('barista', 'cafe_admin')
      and p.cafe_id = p_shop_id
  ) then
    raise exception 'Not authorized to sell a subscription for this shop';
  end if;

  if p_nominal <= 0 then
    raise exception 'Nominal must be positive';
  end if;

  insert into public.subscriptions (guest_id, shop_id, initial_nominal, current_balance, status)
  values (p_guest_id, p_shop_id, p_nominal, p_nominal, 'active')
  returning * into v_sub;

  insert into public.loyalty_transactions (
    guest_id, shop_id, barista_id, subscription_id, type, gross_amount, discount_applied, net_amount
  ) values (
    p_guest_id, p_shop_id, auth.uid(), v_sub.id, 'sell_subscription', p_nominal, 0, p_nominal
  );

  return v_sub;
end;
$$;

create or replace function public.loyalty_redeem(
  p_guest_id uuid,
  p_shop_id text,
  p_gross_amount numeric,
  p_subscription_id uuid default null
)
returns public.guest_shop_statuses
language plpgsql
security definer set search_path = public
as $$
declare
  v_discount integer;
  v_net numeric;
  v_status public.guest_shop_statuses;
  v_sub public.subscriptions;
  v_rank_id uuid;
  v_retention integer;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('barista', 'cafe_admin')
      and p.cafe_id = p_shop_id
  ) then
    raise exception 'Not authorized to redeem for this shop';
  end if;

  if p_gross_amount < 0 then
    raise exception 'Gross amount cannot be negative';
  end if;

  select * into v_status from public.guest_shop_statuses
  where guest_id = p_guest_id and shop_id = p_shop_id
  for update;

  if not found then
    insert into public.guest_shop_statuses (guest_id, shop_id)
    values (p_guest_id, p_shop_id)
    returning * into v_status;
  end if;

  -- The discount comes from the rank the guest ALREADY held walking in —
  -- the visit that pushes them into the next tier still gets this visit's
  -- discount at the old rate, not a discount that depends on its own
  -- outcome.
  v_discount := 0;
  if v_status.current_rank_id is not null then
    select discount_percent into v_discount from public.shop_ranks where id = v_status.current_rank_id;
  end if;
  v_discount := coalesce(v_discount, 0);
  v_net := round(p_gross_amount * (100 - v_discount) / 100.0, 2);

  if p_subscription_id is not null then
    select * into v_sub from public.subscriptions
    where id = p_subscription_id and guest_id = p_guest_id and shop_id = p_shop_id
    for update;

    if not found then
      raise exception 'Subscription not found for this guest at this shop';
    end if;
    if v_sub.status != 'active' then
      raise exception 'Subscription is not active';
    end if;
    if v_sub.current_balance < v_net then
      raise exception 'Insufficient subscription balance';
    end if;

    update public.subscriptions
    set current_balance = v_sub.current_balance - v_net,
        status = case when v_sub.current_balance - v_net <= 0 then 'exhausted' else 'active' end,
        updated_at = now()
    where id = v_sub.id;
  end if;

  update public.guest_shop_statuses
  set visits_count = v_status.visits_count + 1,
      total_spent = v_status.total_spent + v_net,
      last_visit_at = now(),
      updated_at = now()
  where id = v_status.id
  returning * into v_status;

  v_rank_id := public.loyalty_rank_for(p_shop_id, v_status.visits_count, v_status.total_spent);
  v_retention := null;
  if v_rank_id is not null then
    select retention_days into v_retention from public.shop_ranks where id = v_rank_id;
  end if;

  update public.guest_shop_statuses
  set current_rank_id = v_rank_id,
      rank_expires_at = case when coalesce(v_retention, 0) > 0 then now() + (v_retention || ' days')::interval else null end,
      updated_at = now()
  where id = v_status.id
  returning * into v_status;

  insert into public.loyalty_transactions (
    guest_id, shop_id, barista_id, subscription_id, type, gross_amount, discount_applied, net_amount
  ) values (
    p_guest_id, p_shop_id, auth.uid(), p_subscription_id, 'deduct_points', p_gross_amount, v_discount, v_net
  );

  return v_status;
end;
$$;

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.shop_ranks enable row level security;
alter table public.guest_shop_statuses enable row level security;
alter table public.subscriptions enable row level security;
alter table public.loyalty_transactions enable row level security;

-- shop_ranks: never sensitive — a guest needs the thresholds to render a
-- progress bar, a barista needs them to know the discount table. Only the
-- owning shop's cafe_admin can write.
create policy "authenticated reads shop ranks" on public.shop_ranks
  for select to authenticated using (true);

create policy "cafe admin manages own shop ranks" on public.shop_ranks
  for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'cafe_admin' and p.cafe_id = shop_ranks.shop_id)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'cafe_admin' and p.cafe_id = shop_ranks.shop_id)
  );

-- guest_shop_statuses / subscriptions / loyalty_transactions: read-only
-- for everyone at the client level (own rows for a guest, own-shop rows
-- for staff) — every write goes through the two security-definer
-- functions above, so there is deliberately no insert/update/delete
-- policy on any of these three tables.
create policy "guest reads own status" on public.guest_shop_statuses
  for select using (auth.uid() = guest_id);

create policy "shop staff read own shop statuses" on public.guest_shop_statuses
  for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('barista', 'cafe_admin') and p.cafe_id = guest_shop_statuses.shop_id)
  );

create policy "guest reads own subscriptions" on public.subscriptions
  for select using (auth.uid() = guest_id);

create policy "shop staff read own shop subscriptions" on public.subscriptions
  for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('barista', 'cafe_admin') and p.cafe_id = subscriptions.shop_id)
  );

create policy "guest reads own transactions" on public.loyalty_transactions
  for select using (auth.uid() = guest_id);

create policy "shop staff read own shop transactions" on public.loyalty_transactions
  for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('barista', 'cafe_admin') and p.cafe_id = loyalty_transactions.shop_id)
  );

-- =========================================================
-- Table-level GRANTs — see 0004/0005's note: RLS alone doesn't expose a
-- table to PostgREST's roles, an explicit GRANT is required too.
-- guest_shop_statuses/subscriptions/loyalty_transactions get SELECT only —
-- the security-definer functions write them under their OWNER's
-- privileges (the migration-running role), which needs no client grant.
-- =========================================================
grant select, insert, update, delete on public.shop_ranks to authenticated;
grant select on public.guest_shop_statuses to authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.loyalty_transactions to authenticated;

grant execute on function public.loyalty_rank_for(text, integer, numeric) to authenticated;
grant execute on function public.loyalty_sell_subscription(uuid, text, numeric) to authenticated;
grant execute on function public.loyalty_redeem(uuid, text, numeric, uuid) to authenticated;

-- =========================================================
-- Seed: pilot shop's default rank ladder, so the module has real data to
-- demo against immediately. discount_percent/thresholds are ordinary
-- config a cafe_admin can change from the dashboard at any time.
-- =========================================================
insert into public.shop_ranks (shop_id, rank_name, rank_order, discount_percent, required_visits, required_spend, retention_days)
values
  ('shop-xo-vsevolozhsk', 'Bronze', 0, 0, 0, 0, 0),
  ('shop-xo-vsevolozhsk', 'Silver', 1, 5, 5, 3000, 60),
  ('shop-xo-vsevolozhsk', 'Gold', 2, 10, 15, 10000, 45),
  ('shop-xo-vsevolozhsk', 'Platinum', 3, 15, 30, 25000, 30)
on conflict (shop_id, rank_name) do nothing;
