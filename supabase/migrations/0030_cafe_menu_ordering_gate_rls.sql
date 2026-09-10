-- =========================================================
-- Café ordering gate, enforced server-side — production readiness
-- hardening.
--
-- The rule "café can only offer a Lot for ordering when
-- in_roaster_catalog = true AND status = 'active'" has so far only ever
-- been checked in app/dashboard/cafe/add-lot/page.tsx (client-side
-- TypeScript). "staff manage own shop menu entries" (0017) only checks
-- who is writing (their own shop), never what canonical Lot they're
-- attaching — a signed-in barista/cafe_admin calling supabase-js/REST
-- directly (skipping the add-lot UI) could INSERT a cafe_menu_entries row
-- for any lot_ref regardless of its real status, including a draft or
-- archived one never meant to be orderable.
--
-- Scoped to INSERT only, not UPDATE/DELETE: a café must still be free to
-- react to a Lot going out of catalog after the fact (turn off is_active,
-- move status to 'discontinuing', or remove the entry) even though the
-- Lot is no longer active/in_catalog at that moment — that reaction *is*
-- the intended "stale lot status" handling. Only creating a brand-new
-- orderable entry is gated. Legacy entries with no lot_ref (pre-Canonical
-- Lot rows) are unaffected — the gate only applies when a real Lot is
-- being attached.
-- =========================================================

drop policy if exists "staff manage own shop menu entries" on public.cafe_menu_entries;

create policy "staff select own shop menu entries" on public.cafe_menu_entries
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('barista', 'cafe_admin')
        and p.cafe_id = cafe_menu_entries.coffee_shop_id
    )
  );

create policy "staff insert own shop menu entries" on public.cafe_menu_entries
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('barista', 'cafe_admin')
        and p.cafe_id = cafe_menu_entries.coffee_shop_id
    )
    and (
      lot_ref is null
      or exists (
        select 1 from public.lots l
        where l.id = cafe_menu_entries.lot_ref
          and l.in_roaster_catalog = true
          and l.status = 'active'
      )
    )
  );

create policy "staff update own shop menu entries" on public.cafe_menu_entries
  for update
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

create policy "staff delete own shop menu entries" on public.cafe_menu_entries
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('barista', 'cafe_admin')
        and p.cafe_id = cafe_menu_entries.coffee_shop_id
    )
  );

-- select/insert/update/delete privileges were already granted to
-- authenticated by 0017 (still in force); no grant changes needed here.
