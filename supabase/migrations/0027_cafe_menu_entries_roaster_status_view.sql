-- =========================================================
-- Café menu entries — read-only roaster lifecycle signal
-- (Canonical Lot Lifecycle <-> Café Menu Integrity)
-- =========================================================
-- See CANONICAL_LOT_CAFE_MENU_INTEGRITY_DESIGN.md for the full contract.
-- Central principle, unchanged by this migration: the roaster owns the
-- Canonical Lot's `status`/`in_roaster_catalog`; the café owns its own
-- `cafe_menu_entries.is_active`/`status`/`scheduled_removal_at`. This
-- view only ever READS both and joins them — it never writes to either,
-- and nothing in the application is meant to write to it either (a
-- multi-table left join is not updatable in Postgres by default, so this
-- is read-only by construction, not just by convention).
--
-- Additive only: no existing column, row, or policy is touched. No
-- backfill is performed or required — see the join logic below.
--
-- Same technique already used three times in this schema
-- (checkins_roaster_view, checkins_cafe_benchmark_view,
-- checkins_community_view): a plain view (no security_invoker) runs with
-- its OWNER's privileges, but that's moot here — both public.cafe_menu_entries
-- ("public reads cafe menu entries", 0017) and public.lots ("public reads
-- lots", 0025) already grant unconditional public select, so this view
-- exposes nothing that wasn't already independently, fully publicly
-- readable. No new RLS concept, no new privilege boundary.
--
-- Join logic: prefer the real FK `cafe_menu_entries.lot_ref` (added by
-- 0024, populated by the application only for entries created from now
-- on — see lib/data/cafeMenuStore.ts's addLotToMenu). Every entry that
-- predates this (100% of current rows, lot_ref IS NULL) resolves via the
-- legacy `lot_id` (text) matching `lots.public_id` — the exact same
-- match app/dashboard/cafe/add-lot/page.tsx already relies on today. The
-- coalesce+subquery form (rather than a plain `on l.id = lot_ref or
-- l.public_id = lot_id`) guarantees at most one join target per row: if
-- lot_ref is present it is authoritative and the text fallback is never
-- consulted, so there is no fan-out/ambiguous-match risk even in a
-- hypothetical case where the legacy text id no longer matches the same
-- Lot lot_ref now points to.
create or replace view public.cafe_menu_entries_roaster_status_view as
select
  cme.*,
  l.status as roaster_lot_status,
  l.in_roaster_catalog as roaster_in_catalog
from public.cafe_menu_entries cme
left join public.lots l
  on l.id = coalesce(
    cme.lot_ref,
    (select l2.id from public.lots l2 where l2.public_id = cme.lot_id limit 1)
  );

-- Read-only, no sign-in required — same tier as the two base tables it
-- joins. No insert/update/delete grant: this view is not meant to be
-- written to, and a multi-table join isn't updatable in Postgres anyway.
grant select on public.cafe_menu_entries_roaster_status_view to anon, authenticated;
