-- =========================================================
-- Real B2B staff auth: roles/profiles schema + hard RLS isolation
-- =========================================================
-- Supersedes the "no real auth yet, open pilot trust tier" model that
-- 0005/0006 documented for recipes/equipment_garage, and the pure
-- application-level isolation 0006 documented for checkins (its own
-- header explains why: without a real per-role session marker, opening
-- checkins up by coffee_shop_id would not have restricted roasters, it
-- would just have been a wider-open hole). This migration is that
-- previously-missing prerequisite — a real auth.users-linked role/scope
-- table — landing now specifically so the RLS gates it enables are
-- correct instead of theatrical.
--
-- As always: I cannot apply this migration myself from this environment
-- (no SUPABASE_ACCESS_TOKEN for the CLI, no SUPABASE_SERVICE_ROLE_KEY,
-- and direct Postgres connection attempts are outside this sandbox's
-- policy — see 0005's header for the first time this came up). Apply via
-- the Supabase SQL Editor, or `supabase login && supabase link
-- --project-ref vodmmtzclvqemcujwmdf && supabase db push`.

-- =========================================================
-- PROFILES — the missing link between auth.users and "which
-- org/location/role does this account act as". cafe_id/roaster_id/
-- barista_id are plain text, matching the app's own opaque ids
-- everywhere else (lib/data/coffeeShops.ts, lib/data/roasters.ts,
-- lib/data/baristas.ts) — same reasoning 0005 used for recipes.
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'enthusiast'
    check (role in ('enthusiast', 'barista', 'cafe_admin', 'roaster_admin')),
  cafe_id text,
  roaster_id text,
  barista_id text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_scope_check check (
    (role = 'enthusiast' and cafe_id is null and roaster_id is null and barista_id is null)
    or (role = 'barista' and cafe_id is not null and barista_id is not null and roaster_id is null)
    or (role = 'cafe_admin' and cafe_id is not null and roaster_id is null and barista_id is null)
    or (role = 'roaster_admin' and roaster_id is not null and cafe_id is null and barista_id is null)
  )
);

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_cafe on public.profiles(cafe_id);
create index if not exists idx_profiles_roaster on public.profiles(roaster_id);

-- Auto-create a default 'enthusiast' profile on signup — every consumer
-- account needs one so the enthusiast-side app doesn't break, and it's
-- also what makes "no row / role isn't the required one" the uniform
-- failure case the dashboard guards check for. security definer so it
-- can insert regardless of the (deliberately restrictive) RLS below.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'enthusiast')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

alter table public.profiles enable row level security;

-- A user reads their own profile (the dashboard guards need this) —
-- nothing else. Deliberately NO update/insert policy for regular users:
-- role/cafe_id/roaster_id/barista_id are staff-assigned, not self-service
-- (that's the whole point — a guest must never be able to grant
-- themselves 'roaster_admin'). Assign roles by running SQL directly, e.g.:
--
--   update public.profiles
--   set role = 'cafe_admin', cafe_id = 'shop-xo-vsevolozhsk'
--   where id = '<the user''s auth.users.id>';
--
--   update public.profiles
--   set role = 'barista', cafe_id = 'shop-xo-vsevolozhsk', barista_id = 'barista-xo-alexey'
--   where id = '<the user''s auth.users.id>';
--
--   update public.profiles
--   set role = 'roaster_admin', roaster_id = 'roaster-xo'
--   where id = '<the user''s auth.users.id>';
create policy "user reads own profile" on public.profiles
  for select using (auth.uid() = id);

grant select on public.profiles to authenticated;

-- =========================================================
-- CHECKINS — replace the strictly-owner-only policy from 0005 with one
-- that also lets this shop's own staff (barista/cafe_admin) read the
-- full row (needed for the ☕ Кофе и экстракция / 👤 Сервис и внешний вид
-- split on their dashboards). roaster_admin gets NO policy on this table
-- at all — a direct query against public.checkins from a roaster_admin
-- session returns zero rows, full stop. Their only access path is the
-- sanitized view below.
-- =========================================================
drop policy if exists "owner manages own checkins" on public.checkins;

create policy "owner manages own checkins" on public.checkins
  for all
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

create policy "shop staff read own shop checkins" on public.checkins
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('barista', 'cafe_admin')
        and p.cafe_id = checkins.coffee_shop_id
    )
  );

-- =========================================================
-- Roaster's view: "anonymous data about beans and extraction only" —
-- never barista_id/barista_rating/barista_note (service data), never
-- coffee_shop_id (which location), never owner_user_id (which guest).
-- A plain view (no `security_invoker`) runs with its OWNER's privileges,
-- not the caller's — so it can read every row of the locked-down
-- checkins table regardless of the caller's own RLS visibility, while
-- the `join public.profiles p on ... auth.uid() ...` clause inside the
-- view is the actual gate: it only lets a row through when the CALLING
-- user (auth.uid() is evaluated per-session, not per-view-owner) is a
-- roaster_admin whose roaster_id matches that row's roaster_id. This is
-- the standard Supabase pattern for column-level restriction, since RLS
-- itself is row-level only.
-- =========================================================
create or replace view public.checkins_roaster_view as
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
  c.created_at
from public.checkins c
join public.profiles p
  on p.id = auth.uid()
  and p.role = 'roaster_admin'
  and p.roaster_id = c.roaster_id;

grant select on public.checkins_roaster_view to authenticated;

-- =========================================================
-- RECIPES / EQUIPMENT_GARAGE — the "open, no real auth yet" pilot trust
-- tier from 0005/0006 is superseded now that real staff accounts exist.
-- Replace with: public still reads is_public recipes (guests browsing a
-- lot need no account), a signed-in staff member manages recipes/garage
-- rows that belong to their own org (author_id/owner_id must equal their
-- profile's scoped id for that role).
-- =========================================================
drop policy if exists "open access to roaster/shop recipes" on public.recipes;
drop policy if exists "open access to roaster/shop/barista recipes" on public.recipes;

create policy "staff manage own org recipes" on public.recipes
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          (p.role = 'roaster_admin' and recipes.author_type = 'roaster' and p.roaster_id = recipes.author_id)
          or (p.role = 'cafe_admin' and recipes.author_type = 'coffee_shop' and p.cafe_id = recipes.author_id)
          or (p.role = 'barista' and recipes.author_type = 'barista' and p.barista_id = recipes.author_id)
        )
    )
  )
  with check (
    owner_user_id is null
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          (p.role = 'roaster_admin' and recipes.author_type = 'roaster' and p.roaster_id = recipes.author_id)
          or (p.role = 'cafe_admin' and recipes.author_type = 'coffee_shop' and p.cafe_id = recipes.author_id)
          or (p.role = 'barista' and recipes.author_type = 'barista' and p.barista_id = recipes.author_id)
        )
    )
  );

drop policy if exists "open access to roaster/shop equipment" on public.equipment_garage;

create policy "staff manage own org equipment" on public.equipment_garage
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          (p.role = 'roaster_admin' and equipment_garage.owner_kind = 'roaster' and p.roaster_id = equipment_garage.owner_id)
          or (p.role = 'cafe_admin' and equipment_garage.owner_kind = 'coffee_shop' and p.cafe_id = equipment_garage.owner_id)
        )
    )
  )
  with check (
    owner_user_id is null
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          (p.role = 'roaster_admin' and equipment_garage.owner_kind = 'roaster' and p.roaster_id = equipment_garage.owner_id)
          or (p.role = 'cafe_admin' and equipment_garage.owner_kind = 'coffee_shop' and p.cafe_id = equipment_garage.owner_id)
        )
    )
  );

-- A barista brews on their shop's own equipment (see
-- components/barista/BaristaRecipeForm.tsx's equipmentOwnerId) rather than
-- a personal equipment_garage row of their own, so they need to READ their
-- shop's garage (for the same auto-fill ProRecipeForm gives roaster_admin/
-- cafe_admin) without being able to overwrite it — a separate select-only
-- policy, not folded into the "for all" one above.
create policy "barista reads own shop equipment" on public.equipment_garage
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'barista'
        and equipment_garage.owner_kind = 'coffee_shop'
        and p.cafe_id = equipment_garage.owner_id
    )
  );
