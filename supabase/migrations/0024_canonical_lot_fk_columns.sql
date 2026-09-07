-- =========================================================
-- CANONICAL LOT — Phase 4.1 / migration C (additive FK columns on existing
-- tables). Depends on 0022 (public.lots) and 0023 (public.reference_taste_profiles).
--
-- Strictly additive per Stage 3 §11/§I and Stage 4 §11/§12/§13: every
-- existing text lot_id column (checkins.lot_id, recipes.lot_id,
-- cafe_menu_entries.lot_id) is kept exactly as-is. Each new column is
-- nullable, so no existing row, read path, or write path changes behavior
-- until a later backfill/application-switch step explicitly populates and
-- then reads it. Nothing here can break a currently working query.
--
-- `on delete set null` (not `restrict`, not `cascade`) is deliberate: these
-- three tables hold guest/roaster/cafe history that must never be deleted
-- as a side effect of something happening to a Lot. If a Lot row were ever
-- removed, the new FK simply goes null and the original legacy text value
-- stays untouched — the historical row itself is never at risk.
-- =========================================================

alter table public.checkins
  add column if not exists lot_ref uuid references public.lots(id) on delete set null,
  -- Captured at write time: the reference_taste_profiles row that was
  -- `active` for this lot at the moment this checkin was recorded. Stage 3
  -- §08/§G and Stage 4 §8: a later profile version must never cause this
  -- checkin to look like it was compared against a profile it never saw.
  -- Left null for every checkin that predates this column — Stage 4 §32
  -- explicitly forbids guessing a historical version for those rows.
  add column if not exists reference_taste_profile_ref uuid references public.reference_taste_profiles(id) on delete set null;

create index if not exists idx_checkins_lot_ref on public.checkins(lot_ref);
create index if not exists idx_checkins_taste_profile_ref on public.checkins(reference_taste_profile_ref);

alter table public.recipes
  add column if not exists lot_ref uuid references public.lots(id) on delete set null;

create index if not exists idx_recipes_lot_ref on public.recipes(lot_ref);

alter table public.cafe_menu_entries
  add column if not exists lot_ref uuid references public.lots(id) on delete set null;

create index if not exists idx_cafe_menu_entries_lot_ref on public.cafe_menu_entries(lot_ref);

-- loyalty_transactions and subscriptions intentionally receive NO Lot
-- column in this migration — Stage 3 §20 and Stage 4 §22: Loyalty stays an
-- independent operational loop, scoped to guest+shop, not to a specific
-- coffee. Adding a Lot FK here would answer a question nobody asked.
