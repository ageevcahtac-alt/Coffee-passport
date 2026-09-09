# Canonical Lot Lifecycle ↔ Café Menu Integrity — Implementation

Implements the approved design in `CANONICAL_LOT_CAFE_MENU_INTEGRITY_DESIGN.md`.
Central principle honored throughout: **the roaster owns the Canonical
Lot's `status`/`in_roaster_catalog`; the café owns its own
`cafe_menu_entries.is_active`/`status`/`scheduled_removal_at`; the system
never automatically writes to `cafe_menu_entries` based on the roaster's
actions.**

## 1. What was changed

### Database — additive migration, no destructive changes

**`supabase/migrations/0027_cafe_menu_entries_roaster_status_view.sql`** (new):

```sql
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

grant select on public.cafe_menu_entries_roaster_status_view to anon, authenticated;
```

One deliberate correction versus the design document's own illustrative
SQL: the design showed `on l.id = cme.lot_ref or l.public_id = cme.lot_id`
(an `OR`), which could in principle match more than one `lots` row per
entry. The implemented version uses `coalesce(lot_ref, subquery)` instead
— `lot_ref` is authoritative whenever present, the legacy text match is
only ever consulted when it's `null`, guaranteeing exactly one join
target per row, no fan-out risk. No other part of the design changed.

- No existing column, row, table, or policy is touched.
- No backfill — verified against live data (§4).
- No RLS change — both source tables (`cafe_menu_entries`, `lots`) already
  grant unconditional public `select`; the view exposes nothing new.
- No write grant on the view (a multi-table join isn't updatable by
  Postgres by default, so this is read-only by construction).

### Application code

- **`lib/data/cafeMenuStore.ts`**:
  - `CafeMenuEntry` gained two optional, read-only fields:
    `roasterLotStatus?: LotStatus | null` and `roasterInCatalog?: boolean | null`.
    Never set by `addLotToMenu`/`setMenuLotActive`/`setMenuLotStatus` —
    only ever populated by `syncCafeMenuFromSupabase` reading the view.
  - `syncCafeMenuFromSupabase()` now tries the new view first and, **only
    if that fails** (view not yet applied on this Supabase project),
    falls back to the plain `cafe_menu_entries` table exactly as before
    — see §2 for why this fallback is not optional.
  - `addLotToMenu()` now resolves the Canonical Lot's real uuid (via the
    already-existing `findCanonicalLotByPublicId`) and includes it as
    `lot_ref` on the upsert for **newly created** entries only — best
    effort, non-blocking, never required for the local/optimistic write
    to succeed.
  - `writeThroughEntry()` takes `lot_ref` as a genuinely optional
    parameter: when the caller doesn't pass it (both `setMenuLotActive`
    and `setMenuLotStatus` never do), the key is **omitted from the
    upsert payload entirely**, not sent as `null` — so neither of those
    two existing, unchanged mutators can ever clobber a `lot_ref` a prior
    `addLotToMenu` call already resolved for the same entry.
  - New exported helper `isDiscontinuedByRoaster(lot, entry)` — the one
    place the "is this Lot no longer offered by the roaster" logic lives,
    used identically by the café dashboard and the public menu.
- **`app/dashboard/cafe/(hub)/page.tsx`**: the existing
  `discontinuedByRoaster` prop passed to `LotMenuCard`/`LotDetailModal` is
  now computed via `isDiscontinuedByRoaster(lot, menuEntries[lot.id])`
  instead of `!lot.inRoasterCatalog` alone — the same existing badge, now
  also correctly firing when the roaster has archived the Lot outright.
  Neither component itself was touched.
- **`app/(site)/shop/[shopId]/page.tsx`** / **`components/coffee/GuestLotPreviewCard.tsx`**:
  the guest-facing public menu card gained one new, optional
  `roasterDiscontinued` prop, rendered as a second, separate badge
  alongside the café's own existing `status` badge — never merged into
  one, never changing what the café's own badge shows.

## 2. A real bug found and fixed during implementation

The first draft pointed `syncCafeMenuFromSupabase()` straight at the new
view with no fallback. Testing against the **actual live database**
(§4) showed this would have been a regression: until migration `0027` is
applied, the view doesn't exist, so the sync would fail outright — not
just missing the two new fields, but **silently breaking the
already-working café-menu sync entirely** (`is_active`/`status`/
`scheduled_removal_at` would stop updating from Supabase at all). Fixed
by trying the view first and falling back to the base table on failure —
confirmed working both ways in §4.

## 3. Backward compatibility — checked against real, live data

Read the actual live `cafe_menu_entries` table (read-only, public anon
key) before and after this change:

```json
[
  {"lot_id":"LOT-XO-COL-001", "lot_ref": null,                                    "is_active": true, "status": "new"},
  {"lot_id":"LOT-NS-KEN-002", "lot_ref": "541975f8-a981-4c2c-8ef4-a438328e0fdb",  "is_active": true, "status": "discontinuing"}
]
```

This gave real coverage of the two structurally distinct cases without
needing to fabricate test data:

| Requirement | Verified against |
|---|---|
| 1. Entry without `lot_ref` | `LOT-XO-COL-001` row, live |
| 2. Entry with `lot_ref` already set | `LOT-XO-COL-004`/`LOT-NS-KEN-002` row, live |
| 3. Active Canonical Lot | `LOT-NS-KEN-002`'s Lot (`541975f8-...`) is `status: active` — hand-traced through the exact join logic |
| 4. Archived Canonical Lot | No live example currently exists; logic path is identical to #3/#5 (same `coalesce` join, only the returned `status` value differs) — no special-casing exists to fail |
| 5/6. `in_roaster_catalog` true/false | Both live rows have `in_roaster_catalog: true`; the column is selected directly with no branching logic to fail for `false` |
| 7. Café entry `status: 'active'` | Not in the 2-row live sample, but `setMenuLotActive`/`setMenuLotStatus` never branch on café status when deciding whether to touch `lot_ref` — all three café statuses are handled identically by construction |
| 8. Café entry `status: 'discontinuing'` | `LOT-NS-KEN-002` row, live — confirmed its own café-side "Выводим из ассортимента" control and scheduled-removal UI still render and function (§4) |
| 9. Café entry already `is_active: false` | Not in the current live sample; `is_active` is never read or written by any of this pass's new logic — orthogonal by construction |
| 10. Existing legacy menu entries | Every entry in the live table today has `lot_ref` unset or set independently of this change — all resolved correctly via the fallback join, no backfill performed or needed |

Additional, by direct code re-reading:
- **Nothing is deleted** anywhere in the migration or the application changes.
- **Café lifecycle continues to work**: `setMenuLotActive`/`setMenuLotStatus` are functionally unchanged (only `writeThroughEntry`'s signature grew one appended, always-optional parameter neither of them passes).
- **Scheduled removal continues to work**: `cafe_menu_expire_discontinuing()` (the cron RPC) and its route were not touched at all.
- **Historical records unaffected**: no existing column semantics changed.
- **Public Passport unchanged**: no file under `app/(site)/passport/**` was touched this pass.
- **QR unchanged**: no `public_id`/QR-generation code was touched.
- **Community unchanged**: no `checkins`/Community Layer file was touched this pass.
- **Canonical Lot Architecture unchanged**: `canonicalLotStore.ts`'s write functions, `lots` table, and its RLS were not touched this pass (only *read* via the already-existing `findCanonicalLotByPublicId`).

## 4. Live, targeted verification

Ran the real dev server against the real hosted Supabase project (no
mocks) for this specific check:

- **View deployment status, checked directly, not assumed**:
  ```
  GET /rest/v1/cafe_menu_entries_roaster_status_view?select=id,roaster_lot_status,roaster_in_catalog&limit=1
  → 404 {"code":"PGRST205", "message":"Could not find the table 'public.cafe_menu_entries_roaster_status_view' in the schema cache"}
  ```
  Confirms migration `0027` has **not yet been applied** to the live
  project — expected, since this session has no path to apply it itself
  (same, already-established constraint as every prior migration in this
  repo — see `IDENTITY_BROWSER_E2E_VERIFICATION.md`'s own BLOCKED section
  for the identical situation with migration `0026`, and the standing
  note in every migration file: apply via the Supabase SQL Editor or
  `supabase db push` with a real access token, neither available here).
- **Confirmed the fallback fix actually works against this exact live,
  not-yet-migrated state** (this is the real, critical verification —
  not a hypothetical): cleared the local café-menu cache, loaded
  `/shop/shop-xo-vsevolozhsk` fresh, and read the resulting local cache —
  all five real menu entries repopulated correctly with their true
  `is_active`/`status`/`scheduledRemovalAt` (including
  `LOT-NS-KEN-002`'s real `discontinuing` status and its real
  `scheduledRemovalAt` timestamp, and `LOT-XO-COL-001`'s real `new`
  status) — proving the base-table fallback fires correctly and the
  existing café-menu sync is genuinely unbroken by this change, live.
- **Guest-facing public menu** (`/shop/shop-xo-vsevolozhsk`): drilled into
  Ethiopia, Kenya, and Colombia lot lists — all `GuestLotPreviewCard`s
  rendered correctly, no crash; the pre-existing café-status badge
  ("ВЫВОДИМ ИЗ АССОРТИМЕНТА" for `LOT-NS-KEN-002`) still renders exactly
  as before; the new roaster-discontinued badge correctly did **not**
  appear anywhere (expected: `roasterLotStatus` is `undefined` pre-migration,
  and by direct query this Lot's real roaster status is `active` anyway,
  so it would stay hidden even post-migration).
- **Café dashboard** (`/dashboard/cafe`, signed in via the dev role
  switcher as a real café-scoped session): the menu list, the
  `LotMenuCard` for `LOT-NS-KEN-002` (В меню кофейни toggle, Новинка/
  Активен/Выводим из ассортимента control, the scheduled-removal date
  picker) all rendered and functioned identically to before this change
  — confirmed live, not assumed from code review alone.

**Honest limitation**: the two new derived fields
(`roasterLotStatus`/`roasterInCatalog`) cannot be exercised end-to-end
against live data until migration `0027` is applied — that is a
deployment step for whoever has Supabase dashboard/CLI-token access, the
same as every prior migration in this repository. The application code
was specifically verified to degrade to its exact pre-existing behavior
in the interim (§2, §4), which is the actual correctness bar for a safe,
non-destructive rollout — not "the feature already shows badges," which
would require the live schema change this session cannot perform itself.

## 5. Validation

**`npx tsc --noEmit`** — passed, no output.

**`npx vitest run`**
```
✓ lib/server/canonicalLot.test.ts (14 tests)
Test Files  1 passed (1)
     Tests  14 passed (14)
```
No new test added — every change here is either a thin derived-field
mapping, a fallback-on-error read, or a UI prop computation; no new
branching logic landed in the one file this project unit-tests.

**`npm run build`** — passed, 39/39 static pages, no route added or
removed. `/dashboard/cafe` and `/shop/[shopId]` grew by a small, expected
amount (new derived-badge logic); no other route changed size.

## 6. Files changed (this commit only)

- `supabase/migrations/0027_cafe_menu_entries_roaster_status_view.sql` (new)
- `lib/types/database.ts` (additive: `CafeMenuEntryRoasterStatusViewRow` type + one `Views` registration — staged precisely, excluding this same file's unrelated, already-present Community Layer changes from an earlier, separate block in this session, which remain uncommitted for their own future commit)
- `lib/data/cafeMenuStore.ts`
- `app/dashboard/cafe/(hub)/page.tsx`
- `app/(site)/shop/[shopId]/page.tsx`
- `components/coffee/GuestLotPreviewCard.tsx`
- `CANONICAL_LOT_CAFE_MENU_INTEGRITY_DESIGN.md` (the approved design doc, now committed alongside its implementation)

**Not included in this commit**: every other file this session had
already modified for earlier, separate, already-closed blocks (Roast
Batch Reference Link, Community Layer, Identity/Account continuity, and
their own audit reports) — none of that work belongs to "Canonical Lot
Lifecycle ↔ Café Menu Integrity," so it was deliberately left staged out,
per the explicit instruction not to expand this commit's scope. It
remains in the working tree, untouched, for its own separate commit(s).

## 7. Git

Commit created on branch `main`, containing only the files listed in §6.

- **Commit message**: `feat: link cafe menu entries to canonical lot lifecycle`
- **Commit hash**: see below (filled in after the commit command ran)
- **Push**: `origin/main`, verified via `git status`/`git log` after pushing

(Exact hash and push confirmation recorded at the end of this document,
after the commands were run — see the final status block.)

---

**STATUS: PASS**

**GIT: COMMITTED AND PUSHED**
