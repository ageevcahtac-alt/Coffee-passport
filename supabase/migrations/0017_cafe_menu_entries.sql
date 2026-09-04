-- =========================================================
-- Cafe menu entries — lot lifecycle status per shop
-- =========================================================
-- Promotes lib/data/cafeMenuStore.ts off pure localStorage: the new
-- "Обновления на баре" guest announcements feature needs a guest, on a
-- different device/account than the cafe's own dashboard, to see a status
-- change — impossible with a localStorage-only store. Same evolution
-- barista_profiles (0015) and recipes (0005) already went through.
--
-- is_active is the existing "В меню кофейни" master visibility switch
-- (lib/data/cafeMenuStore.ts's own header comment — the ONLY thing that
-- controls guest-facing visibility); status is the new lifecycle field,
-- only meaningful while is_active is true:
--   'new'           — Новинка / Поступление
--   'active'        — Активен / В наличии (default)
--   'discontinuing' — Выводим из ассортимента / Скоро закончится
--
-- As always: cannot apply this myself from this environment (see 0005's
-- header for why). Apply via the Supabase SQL Editor, or
-- `supabase login && supabase link --project-ref vodmmtzclvqemcujwmdf &&
-- supabase db push`.

create table if not exists public.cafe_menu_entries (
  id text primary key,
  coffee_shop_id text not null,
  lot_id text not null,
  is_active boolean not null default true,
  status text not null default 'active' check (status in ('new', 'active', 'discontinuing')),
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coffee_shop_id, lot_id)
);

create index if not exists idx_cafe_menu_entries_shop on public.cafe_menu_entries(coffee_shop_id);
create index if not exists idx_cafe_menu_entries_lot on public.cafe_menu_entries(lot_id);

alter table public.cafe_menu_entries enable row level security;

-- Guest-facing catalog (the new 3-level hierarchy, the tasting/QR flow,
-- and the announcements feed) all read this with no session — same open
-- read tier as barista_profiles.
drop policy if exists "public reads cafe menu entries" on public.cafe_menu_entries;
create policy "public reads cafe menu entries" on public.cafe_menu_entries
  for select using (true);

grant select on public.cafe_menu_entries to anon, authenticated;

-- Writes follow the same public.profiles-scoped trust tier 0007
-- established: a barista or cafe_admin manages entries for their own shop
-- only.
drop policy if exists "staff manage own shop menu entries" on public.cafe_menu_entries;
create policy "staff manage own shop menu entries" on public.cafe_menu_entries
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('barista', 'cafe_admin')
        and p.cafe_id = cafe_menu_entries.coffee_shop_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('barista', 'cafe_admin')
        and p.cafe_id = cafe_menu_entries.coffee_shop_id
    )
  );

grant insert, update, delete on public.cafe_menu_entries to authenticated;
