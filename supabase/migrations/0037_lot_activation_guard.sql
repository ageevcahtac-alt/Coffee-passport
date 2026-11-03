-- =========================================================
-- LOT ACTIVATION GUARD — grain-flow audit 2026-11-03, finding F-5 / proposal P-5.
--
-- isReadyForActive (components/roaster/CanonicalLotStatusControl.tsx:35-37) was a
-- browser-only check: a roastery could activate a not-ready Lot (blank name, or
-- q_grade null / <= 0) by PATCHing lots.status straight through PostgREST,
-- bypassing the UI. This trigger enforces the same rule (name non-empty AND
-- q_grade > 0) on EVERY path into status='active' — cabinet UI, direct REST
-- write, backfill script.
--
-- Scope mirrors the UI gate exactly: only becoming 'active' is guarded —
-- on INSERT (a row created directly as 'active', bypassing the draft
-- lifecycle) and on the UPDATE-transition INTO 'active' (old status
-- different). Saving an already-active Lot with unchanged status (e.g. a
-- name edit), moving active -> draft/testing/archived, and all non-status
-- writes pass unchanged. The cabinet UI never INSERTs 'active' (fresh Lots
-- default to 'draft', lib/data/canonicalLotStore.ts:377); the INSERT arm
-- closes the direct-PostgREST path around an UPDATE-only trigger (Codex
-- review, round 1).
--
-- No RLS policy is created, dropped or altered here: ownership stays enforced
-- by 0025's "roaster staff manage own lots"; this trigger adds a data-quality
-- raise only after that check passes — it widens no access. Same trigger
-- pattern as 0023's roast_batches immutability guard.
-- =========================================================

create or replace function public.prevent_lot_activation_when_not_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- name !~ '\S' (no non-whitespace char anywhere) matches the client gate's
  -- String.trim() semantics — plain btrim() would miss tab/newline-only names.
  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from 'active')
     and (new.name !~ '\S' or new.q_grade is null or new.q_grade <= 0) then
    raise exception 'Lot % cannot move to status %: a non-empty name and a real Q-Score (q_grade > 0) are required (grain-flow audit P-5)', coalesce(new.id::text, '(new row)'), new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lots_activation_guard on public.lots;
create trigger trg_lots_activation_guard
  before insert or update on public.lots
  for each row execute function public.prevent_lot_activation_when_not_ready();
