# Canonical Lot Lifecycle ↔ Café Menu Integrity — Design

Design/audit only. No code, no migration, no commit was made to produce
this document — every claim below is sourced from re-reading the actual,
current code, migrations, and RLS policies.

## 1. Current system, as it actually is

### 1.1 `cafe_menu_entries` — full live schema

```sql
-- 0017_cafe_menu_entries.sql
create table if not exists public.cafe_menu_entries (
  id text primary key,
  coffee_shop_id text not null,
  lot_id text not null,                -- legacy text id, NOT an FK
  is_active boolean not null default true,
  status text not null default 'active' check (status in ('new', 'active', 'discontinuing')),
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coffee_shop_id, lot_id)
);
-- indexes on coffee_shop_id, lot_id

-- 0018_cafe_menu_scheduled_removal.sql
alter table public.cafe_menu_entries add column if not exists scheduled_removal_at timestamptz;

create function public.cafe_menu_expire_discontinuing() returns integer
  security definer set search_path = public as $$
  update public.cafe_menu_entries
    set is_active = false, updated_at = now()
    where is_active = true and status = 'discontinuing'
      and scheduled_removal_at is not null and scheduled_removal_at <= now()
  ...
$$;

-- 0024_canonical_lot_fk_columns.sql
alter table public.cafe_menu_entries
  add column if not exists lot_ref uuid references public.lots(id) on delete set null;
create index if not exists idx_cafe_menu_entries_lot_ref on public.cafe_menu_entries(lot_ref);
```

RLS (`0017`, untouched since — `0025`'s own header states this table's
policies are "untouched"): SELECT is fully public (`using (true)`, granted
to `anon, authenticated`); INSERT/UPDATE/DELETE require an authenticated
`barista`/`cafe_admin` profile whose `cafe_id` matches the row's
`coffee_shop_id`. No trigger exists on this table.

**`lot_ref` is never written by any code path** — `writeThroughEntry()`
(`lib/data/cafeMenuStore.ts`), the sole function that upserts this table,
builds its payload from exactly `id, coffee_shop_id, lot_id, is_active,
status, status_changed_at, scheduled_removal_at, created_at, updated_at`
— no `lot_ref` key. `rowToEntry()` never reads it back either. It has sat
idle since `0024`.

### 1.2 The café's own menu lifecycle already exists, and is a good pattern to reuse

`status` (`'new' | 'active' | 'discontinuing'`) and `is_active` are two
independent axes, by the store file's own header comment: `is_active` is
"the ONLY switch that controls guest-facing visibility"; `status` is "a
second, independent axis." The café-initiated discontinue flow already
works exactly the way a good version of this feature should: café sets
`status: 'discontinuing'` + `scheduled_removal_at` via `LotStatusControl`
→ `setMenuLotStatus()` → `cafe_menu_expire_discontinuing()` (a `security
definer` SQL function, invoked by `app/api/cron/cafe-menu-expire/route.ts`
on a schedule) flips `is_active = false` once the deadline passes. **No
row is ever deleted** — the RPC is an `UPDATE`, never a `DELETE`, even
though the RLS policy would technically permit delete; no code path calls
it.

`LotRemovalCountdown.tsx` renders this state transparently to the guest
(`variant="notice"` on the Passport page, `variant="inline"` on the café's
own "Обновления на баре" feed) — a visible countdown, not a silent
disappearance. This is the existing, correct precedent for "how this
product already discloses an impending menu change" and is the template
this design reuses, not replaces.

### 1.3 Where Canonical Lot `status` is actually checked today — only once, at add-time

`app/dashboard/cafe/add-lot/page.tsx` fetches `listAllCanonicalLotStatuses()`
**once, on mount**, into a plain `Map<string, LotStatus>`, and uses it in
exactly two places: `isPublishedForOrdering()` (filters the "add from
catalog" list to `status === 'active'` lots) and `handleCodeSubmit()`
(rejects manual-code entry for a non-`active` lot). **Neither is ever
re-checked after the entry exists.** Once a café has added a Lot, nothing
in this codebase looks at the Canonical Lot's `status` again for that
entry.

### 1.4 The café dashboard already has a "roaster discontinued this" badge — but it's wired to the wrong (and incomplete) signal

`app/dashboard/cafe/(hub)/page.tsx` passes `discontinuedByRoaster={!lot.inRoasterCatalog}`
into both `LotMenuCard` and `LotDetailModal`. This badge already exists
and is already cosmetic-only (renders "Снято с производства обжарщиком"
text, does not disable or auto-change anything) — but it is derived
**only** from `in_roaster_catalog`, never from the Canonical Lot's own
`status`. A roaster who archives a Lot without also flipping
`in_roaster_catalog` gives the café **zero** signal of any kind, on either
the dashboard or the public menu.

### 1.5 Guest-facing exposure — two distinct surfaces, only one currently correct

- **`/passport/[lotId]`** (the QR destination): its core content (roast/
  taste/community cards) reads the Canonical Lot and related tables
  directly, never through `cafe_menu_entries` — already accurate
  regardless of café-menu state, confirmed by its own code comment
  ("nothing else on this page reads it yet" beyond `LotRemovalCountdown`).
  **Not at risk from this gap.**
- **`/shop/[shopId]`** (a café's own public menu listing,
  `GuestLotPreviewCard`): reads `entries[lot.id]?.status` — the café's
  **own** `status`/`is_active`, with no visibility into the Canonical
  Lot's real status at all. **This is the actual guest-facing exposure**:
  a guest browsing a café's menu page can see a Lot presented as
  available when the roaster has already archived it, with nothing on
  that page able to tell them otherwise.

### 1.6 Existing, directly reusable read helpers

- `findCanonicalLotByPublicId`, `listAllCanonicalLotStatuses` (`lib/data/canonicalLotStore.ts`) — already resolve Canonical Lot status by public id.
- The precedent of a plain, publicly-readable SQL view joining two already-public tables for a cross-cutting read (`checkins_roaster_view`, `checkins_cafe_benchmark_view`, `checkins_community_view`, all `create or replace view ... grant select ... to anon, authenticated`, no `security_invoker`, no new RLS needed because both source tables are already public-readable).
- `syncCafeMenuFromSupabase()`'s existing single `.select('*')` + `rowToEntry()` mapping shape — the exact seam to extend.

## 2. Product contract

1. **Roaster archives a Lot already on a café's active menu** — nothing
   in `cafe_menu_entries` changes automatically. No `is_active` flip, no
   `status` change, no deletion. The café's own operational reality
   (they may have real physical stock left) is never overridden by a
   background process.
2. **The menu position stays historically linked, and a derived,
   read-only "roaster availability" signal becomes visible** everywhere
   the entry is already rendered — this is the "explicit derived/
   availability mechanism at the café-menu level" the audit called for,
   not a new lifecycle state on `cafe_menu_entries` itself. It is
   computed at read time from the Canonical Lot's live `status`/
   `in_roaster_catalog`, never stored/synced onto the menu-entry row.
3. **Lot returns from `archived` to `active`** — requires no reversal
   logic at all, because nothing was ever written. The derived signal is
   simply absent on the next read. Self-healing by construction.
4. **Menu entry removal/cancellation** — entirely unchanged: the café's
   existing `is_active` toggle and `discontinuing` + `scheduled_removal_at`
   + cron-expiry flow, already non-destructive, already historically
   preserving. Nothing new is introduced here.
5. **Guest sees**: on the café's own public menu (`/shop/[shopId]`), an
   honest, visible label (same disclosure philosophy as
   `LotRemovalCountdown`'s countdown notice) when the underlying Lot is
   no longer roaster-available — shown *in addition to*, never instead
   of, the café's own listing, so the guest can still see it was real and
   decide whether to ask staff. The Lot's own Passport is unaffected (1.5).
6. **Café sees**: the existing `discontinuedByRoaster` badge on
   `LotMenuCard`/`LotDetailModal` now reflects the Lot's real, live
   `status` (not just `in_roaster_catalog`) — the café finally gets the
   same signal the roaster already has, with zero change to their own
   control surface (`isActive`/`status`/`scheduledRemovalAt` stay exactly
   as they are, café-owned, café-triggered only).
7. **Roaster sees**: no change at all. `CanonicalLotStatusControl.tsx`
   keeps its existing, ungated, free transition behavior — archiving a
   Lot remains a simple action with no new confirmation dialog or
   café-count warning in this minimal design (flagged below as an
   optional future enhancement, not part of this scope).
8. **Historical preservation**: no backfill required and none proposed.
   `lot_ref` starts being populated only for *newly created* menu entries
   going forward; every existing entry (which has `lot_ref = null` today)
   keeps working via the same legacy `lot_id`-text-to-`lots.public_id`
   match the add-time gate already relies on. No delete, no cascade, no
   destructive migration anywhere in this design — `lot_ref`'s own `on
   delete set null` (already correctly set in `0024`) is untouched.

## 3. Minimal architecture

**One additive SQL view, plus populating one already-existing, already-idle column going forward. No new table, no new status enum, no new lifecycle state machine.**

```sql
-- Illustrative shape, not a drafted migration — implementation is a later step.
create or replace view public.cafe_menu_entries_roaster_status_view as
select
  cme.*,
  l.status as roaster_lot_status,
  l.in_roaster_catalog as roaster_in_catalog
from public.cafe_menu_entries cme
left join public.lots l
  on l.id = cme.lot_ref          -- preferred: real FK, once populated
  or l.public_id = cme.lot_id;   -- fallback: legacy text match, for every entry that predates this

grant select on public.cafe_menu_entries_roaster_status_view to anon, authenticated;
```

Why this is the minimal fit, not an invented system:

- It is a **read-only projection**, not a new writable entity — the
  café's own `is_active`/`status`/`scheduled_removal_at` remain the only
  writable lifecycle fields on the menu entry, exactly as today.
- It reuses the **exact same pattern** already used three times in this
  schema for cross-cutting reads over already-public tables — no new RLS
  concept, no privilege question (both `cafe_menu_entries` and `lots` are
  already fully public-`select`).
- The `or`-fallback join means **no backfill is required**: an entry with
  `lot_ref = null` (every entry that exists today) still resolves
  `roaster_lot_status` correctly via the legacy text match, identically
  to how `add-lot/page.tsx` already matches lots today.
- `lot_ref` being populated for new entries going forward (a one-line
  addition to `addLotToMenu`'s existing insert, resolving the uuid via
  the already-existing `findCanonicalLotByPublicId`) is what finally gives
  that idle column a real, scoped, indexed join — better for "further
  scaling" than the current unscoped `listAllCanonicalLotStatuses()`
  fetch-everything pattern, without removing that function or breaking
  its existing call site.
- Consumption is a **one-line swap**: `syncCafeMenuFromSupabase()` reads
  from this view instead of the raw table (identical column set, plus
  two new ones), and `rowToEntry()`/`CafeMenuEntry` gain two new optional
  fields (e.g. `roasterLotStatus`, `roasterInCatalog`). Every existing
  reader of `CafeMenuEntry` keeps working unchanged; only the two new,
  additive fields are new to consume.

## 4. Status transition matrix

| Canonical Lot `status` / `in_roaster_catalog` | Café's own `is_active` / `status` (unchanged by this design) | Guest sees on `/shop/[shopId]` | Café sees on dashboard | Automatic write? |
|---|---|---|---|---|
| `active`, in catalog | anything | normal listing, as café set it | no roaster warning | none |
| `archived` (any catalog flag) | `is_active=true`, `status='active'`/`'new'` | listing stays, **plus** a "больше не в производстве у обжарщика"-style label | `discontinuedByRoaster`-style badge (now correctly firing) | **none** |
| `archived` | `is_active=true`, `status='discontinuing'` (café already scheduled removal) | both the existing countdown notice *and* the roaster-archived label — independent, both true | both the existing countdown control *and* the badge | none — cron's existing scheduled flip proceeds independently |
| `archived` | `is_active=false` (café already removed) | not rendered at all (existing `isActive` gate already suppresses it — unchanged) | shown only wherever inactive entries are already surfaced, with the badge for context | none |
| back to `active` (un-archived) | anything | label disappears on next read — no stored state to reverse | badge disappears on next read | none |
| `in_roaster_catalog=false`, `status` still `active`/`testing` | anything | same label as the `archived` row (already-existing case, now unified into the same derived field) | same badge | none |
| Lot genuinely not resolvable (theoretical only — Lots are never deleted anywhere in this codebase) | anything | no label (unknown ≠ warn) | no badge | none |

## 5. Backward compatibility, checked explicitly

- **Existing entries without `lot_ref`** (100% of current rows): resolved
  by the view's own `or l.public_id = cme.lot_id` fallback — no backfill,
  no migration touching existing rows required.
- **Entries created after this design ships, with `lot_ref` set**: resolved
  by the FK join directly; both paths coexist in the same view
  indefinitely.
- **Old Lots / active Lots / archived Lots**: the view reflects whatever
  `lots.status` truly is at read time — no special-casing by age.
- **History (`checkins`/`journey`)**: untouched; unrelated tables, no
  reference to `cafe_menu_entries` in either direction.
- **QR / Passport**: untouched — `public_id` generation, the Passport's
  own read paths, and `LotRemovalCountdown` all keep working exactly as
  today; this design adds a new *view*, not a new dependency for anything
  already working.
- **Community**: untouched — `checkins_community_view`/`is_public` share
  no table with this design.
- **No cascading deletes anywhere**: `lot_ref`'s existing `on delete set
  null` (from `0024`) is left exactly as is; the new view is read-only by
  construction (a multi-table `left join` is not updatable by default in
  Postgres, so there is no accidental write surface either); no
  `DELETE`/`TRUNCATE` appears anywhere in this design.

## 6. Explicitly out of scope for this design

- Any change to `CanonicalLotStatusControl.tsx`'s own transition freedom
  (still ungated both ways, except the existing `isReadyForActive` guard
  on entering `active` — untouched).
- Any roaster-side warning ("N cafés list this Lot") before archiving —
  a real, plausible future enhancement, but a second, separate feature
  with its own scope, not required to close this specific gap.
- Café Lot-edit ownership (a different, already-flagged, already-deferred
  gap — needs its own product decision, unrelated to menu-entry status).
- Coffee/Green Lot edit paths, Taste Intent historical link — unrelated
  gaps from the same prior audit, not touched here.
- Any backfill of `lot_ref` on existing rows — deliberately not proposed;
  the fallback join makes it unnecessary, and a backfill script would be
  a separate, optional, later decision if ever wanted for performance.
- Any change to `in_roaster_catalog`'s own meaning or sync behavior
  (Phase 4.5.11's work) — reused as one of the two inputs to the derived
  signal, not modified.
- Any change to RLS on `cafe_menu_entries` or `lots` — both already fully
  public-select; the new view needs its own `grant select`, nothing on
  the base tables changes.

---

**RECOMMENDATION:**
Add one read-only SQL view (`cafe_menu_entries_roaster_status_view`) that
left-joins `cafe_menu_entries` to `lots` — preferring the already-existing
but currently-idle `lot_ref` FK, falling back to the legacy `lot_id` text
match for every entry that predates it — and surface its two new derived
columns (`roaster_lot_status`, `roaster_in_catalog`) as read-only,
café-visible and guest-visible badges, without ever automatically writing
to `cafe_menu_entries` itself.

**WHY:**
This is the smallest change that closes the actual gap: right now a
roaster's own `status` change is invisible to a café and to that café's
guests once a Lot is already listed. A purely derived, read-only signal
gives both sides the truth immediately and is self-healing (no reversal
logic needed if the roaster un-archives), while never overriding the
café's own legitimate, independent decision about their own menu — which
is exactly the non-destructive, non-authoritative pattern this codebase
already uses for the café's own discontinue-then-expire flow.

**DATA MODEL:**
No new table, no new column beyond finally populating the existing
`cafe_menu_entries.lot_ref` (added in `0024`, currently unused) for
newly-created entries going forward. One new, additive, non-destructive
SQL view. `CafeMenuEntry` (TypeScript) gains two new optional, derived
fields; every existing field keeps its exact current meaning.

**STATUS TRANSITIONS:**
See §4 — in every case, `cafe_menu_entries.is_active`/`status`/
`scheduled_removal_at` are written only by the café's own existing
actions (or the existing cron expiry). The Canonical Lot's own `status`
changes never write to `cafe_menu_entries`; they only change what the
derived view computes on the next read.

**GUEST BEHAVIOR:**
`/passport/[lotId]` is unaffected (already correct, reads the Canonical
Lot directly). `/shop/[shopId]`'s public menu gains an honest,
non-destructive label when a listed Lot's roaster status is `archived` or
no longer in the roaster's catalog — shown alongside the existing
listing, never silently hiding it, matching the disclosure style
`LotRemovalCountdown` already uses.

**CAFE BEHAVIOR:**
The existing `discontinuedByRoaster` badge on `LotMenuCard`/
`LotDetailModal` starts reflecting the Canonical Lot's real `status`, not
just `in_roaster_catalog` — a strictly more accurate version of a badge
that already exists. The café's own `isActive`/`status`/
`scheduledRemovalAt` controls, and the meaning of every value they can
already set, are completely unchanged.

**ROASTER BEHAVIOR:**
No change. `CanonicalLotStatusControl.tsx` keeps its current, free,
ungated transition behavior in both directions.

**BACKWARD COMPATIBILITY:**
Every existing `cafe_menu_entries` row (100% currently have `lot_ref =
null`) resolves correctly through the view's legacy-text-match fallback —
no backfill migration, no destructive change, no cascading delete
anywhere in this design; `lot_ref`'s existing `on delete set null`
behavior is untouched.

**IMPLEMENTATION SCOPE (for a later step, not this one):**
- New migration: `create or replace view public.cafe_menu_entries_roaster_status_view` + `grant select ... to anon, authenticated` (illustrative SQL in §3).
- `lib/data/cafeMenuStore.ts`: extend `CafeMenuEntry`/`rowToEntry()` with the two new derived fields; point `syncCafeMenuFromSupabase()` at the new view instead of the raw table; add `lot_ref` to `addLotToMenu()`'s insert payload (resolved via the already-existing `findCanonicalLotByPublicId`).
- `components/cafe/LotMenuCard.tsx` / `LotDetailModal`: widen `discontinuedByRoaster`'s computation to also check the new `roasterLotStatus === 'archived'` field, not just `inRoasterCatalog`.
- `app/(site)/shop/[shopId]/page.tsx` / `GuestLotPreviewCard`: render the same derived signal as a guest-visible label.

**OUT OF SCOPE:**
Café Lot-edit ownership; Coffee/Green Lot edit paths; Taste Intent
historical link; any roaster-side "N cafés affected" warning before
archiving; any `lot_ref` backfill of existing rows; any change to
`CanonicalLotStatusControl.tsx`'s transition freedom, `in_roaster_catalog`'s
own semantics, or RLS on any existing table.

**CODE CHANGES:** NONE — design/audit only.

**GIT:** NO COMMIT / NO PUSH — repository changes are not allowed in this step.
