# Phase 4.5.11 — Roaster Canonical Lot Catalog Management

## 1. Objective

Audit `app/dashboard/roaster/page.tsx` as the roaster's working catalog of Canonical Lots. Central question: can a roaster manage several Canonical Lots from this dashboard while quickly understanding which are active/testing/draft/archived, which Lot to open, and which are in the catalog — without assuming search/filters/tabs/sorting/redesign are needed in advance. Fix only a real, evidenced gap, prioritizing correct data over UX polish.

## 2. Dashboard state before this phase

- List source: `useLots()` (seed + localStorage override + `syncLotsFromSupabase()` overlay), filtered to `lot.roasterId === roasterId`.
- Two tabs, driven by `in_roaster_catalog`: "Активные лоты" / "Архив / Сняты с обжарки" — not by `status`.
- Status badge (Phase 4.5.5): a small pill per row, populated from a *separate* `listCanonicalLotsForRoaster()` fetch into a `Map<publicId, LotStatus>`, shown only when `status !== 'active'`.
- Navigation: a 3-level `CatalogHierarchy` drill-down (Country → Roast Type → Lots), each leaf rendering `LotRow` with name, country/region, `public_id`, Q-grade, roast-type badge, catalog-status badge, the "in catalog" toggle switch, and links to edit/preview/QR.
- Each row already links directly to `/dashboard/roaster/${lot.id}/edit` ("Редактировать") — a single, unambiguous click to reach detail/edit for any specific Lot.

## 3. Audit findings

### 3.1 Is the data correct? (priority #1) — **No — a real bug found**

Traced `toggleCatalog(lot)` (the dashboard's quick "Снять с обжарки" switch) end to end: it called **only** `saveLot({ ...lot, inRoasterCatalog: !lot.inRoasterCatalog })` — the local-override cache write (`lib/data/lotsStore.ts`). It never called `updateCanonicalLotFields()`, the function Phase 4.5.4 already built and already uses for the exact same field from the full edit-page form.

Consequence: flipping this switch never touched the actual Supabase `lots.in_roaster_catalog` column. Within a single browser (same `localStorage`), this was invisible — `useLots()` is a shared external store, so every reader in that browser (this dashboard, `app/dashboard/cafe/add-lot/page.tsx`'s café gate) saw the same overridden value. But it is a genuine divergence between the legacy cache and the canonical source of truth: a second device/browser reading the real `lots` row directly (exactly what this same dashboard's own `canonicalStatuses` fetch already does via `listCanonicalLotsForRoaster`, and exactly the kind of reader the task told this phase to check for) would see the *actual*, unchanged value — silently out of sync with what the roaster believes they just set. This is precisely "canonical data mixed with legacy lotsStore as source of truth," found by tracing the actual write path rather than assuming.

### 3.2 Can the roaster tell which Lots are active/testing/draft/archived quickly?

The status badge (4.5.5) already answers this per-row, but only for rows that are actually visible — reaching them requires drilling through Country → Roast Type first. Considered whether this drill-down is itself a gap: it is pre-existing, deliberate UX (shared across roaster/cafe/guest catalogs, per its own header comment) built for a larger multi-country catalog, and every row it eventually shows already carries a clear status badge. Restructuring or flattening it would be a redesign the task explicitly said not to assume necessary, and no concrete evidence (e.g. an actual usability complaint, or a broken/misleading state) was found beyond "one more click than a flat list would need" — not promoted to a fix.

### 3.3 Can the roaster tell which specific Lot to open?

Yes — each row already shows a distinct name, country/region, and its own `public_id`, with a direct "Редактировать" link. No gap found.

### 3.4 Is `in_roaster_catalog` state clearly shown?

Yes — an explicit on/off switch with explanatory text per row, unchanged by this phase except for the fix in §3.1 and the error line added alongside it.

### 3.5 Legacy/localStorage mixing

Beyond §3.1's write-path bug, the *read* side (`useLots()` as the list source, with `canonicalStatuses` as a read-only overlay for the status badge) is the same pattern already used and left in place since Phase 4.5.5 — evaluated again here per the task's explicit instruction to check "can reads be safely swapped to canonical without changing behavior." Swapping the list source itself to `listCanonicalLotsForRoaster()` would drop every field that function doesn't carry (`country`, `region`, `producer`, checkin-derived analytics keyed by the local `Lot` shape, `CatalogHierarchy`'s own country/roast-type grouping) — not a safe drop-in replacement without a larger rework of what feeds `LotRow`/`CatalogHierarchy`. Left as-is, per the task's explicit "не делай migration всего legacy-кода ради чистоты."

## 4. What is actually necessary for catalog management (per the task's own priority order)

1. **Correct data** — the one real gap (§3.1). Fixed.
2. **Clear Lot state** — already adequate (status badge + catalog toggle + explanatory text), unchanged.
3. **Fast path to detail/edit** — already adequate (direct "Редактировать" link per row), unchanged.
4. **No legacy/localStorage as source of truth** — the *write* path for `in_roaster_catalog` no longer silently diverges (fixed); the *read* path remains the existing hybrid cache, evaluated and left as-is (§3.5) since replacing it isn't a safe, behavior-preserving swap.
5. **UX improvements** — not undertaken; no evidenced need for tabs/filters/sorting/search was found (§3.2), matching the task's explicit instruction not to assume these are needed.

## 5. What was implemented

**`app/dashboard/roaster/page.tsx`**:
- `toggleCatalog(lot)` is now `async`: it still calls `saveLot()` first and unconditionally (local-first UX unchanged, even if the step below fails), then resolves the canonical row via `findCanonicalLotByPublicId(lot.id)` (unmodified, Phase 4.5.1) and, if found, calls `updateCanonicalLotFields(canonicalLot.id, { inRoasterCatalog: nextValue })` (unmodified, Phase 4.5.1/4.5.4) — the exact same function the full edit-page save already uses for this field.
- `LotRow`'s `onToggleCatalog` prop type changed from `() => void` to `() => Promise<void>`; a new local `handleToggleCatalog` wrapper `await`s it and, on failure, sets a small inline `catalogSyncError` message next to the switch (mirroring this file's own existing error-message style) — the switch's `onClick` now points at this wrapper instead of the raw prop.
- The toggle's markup was reindented one level (wrapped in an inner `div`) purely to make room for the conditional error line underneath it; no other structural change.

No new component, no new table, no new state-management system, no tabs/filters/sorting were added.

## 6. Legacy mechanisms that remain, and why

- **`useLots()` remains the list source** for this dashboard (§3.5) — replacing it would drop fields (`country`, `region`, `producer`) and integrations (`CatalogHierarchy`, `LotGuestAnalytics`, `CommunityHighlights`, `RoasterSupplyMapWidget`) that all key off the local `Lot` shape, not `CanonicalLot`. Migrating all of them is a materially larger effort than this phase's evidenced scope, and the task explicitly asked not to do a wholesale legacy migration "for cleanliness."
- **`canonicalStatuses` remains a separate overlay fetch**, not merged into `useLots()`'s cache — unchanged from Phase 4.5.5, still the correct minimal pattern (read-only, display-only, never the gating source of truth for anything).
- **The 3-level `CatalogHierarchy` drill-down remains** — no evidenced need to flatten or restructure it (§3.2).

## 7. Validation

**`npx tsc --noEmit`** — passed. No output, no errors.

**`npx vitest run`** — passed.
```
✓ lib/server/canonicalLot.test.ts (14 tests) 24ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```
No new test added — the change is a thin async wrapper around two already-unmodified, already-untested (by design, per this project's pure-logic-only testing convention) Supabase I/O functions.

**`npm run build`** — passed.
```
✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Generating static pages (39/39)
   Finalizing page optimization ...
   Collecting build traces ...
```
`/dashboard/roaster` grew from 6.64 kB to 6.78 kB. No route added or removed.

## 8. Regression (all 13 required checks)

1. **Creation wizard** — `app/dashboard/roaster/new/page.tsx` shows zero diff this phase.
2. **Existing Coffee → Green Lot → Canonical Lot** — unaffected, same reasoning.
3. **Reuse of one Green Lot** — unaffected; this phase touches only the dashboard's catalog-flag toggle, never Green Lot selection/creation.
4. **Detail** — `CanonicalLotChain.tsx` shows zero diff this phase.
5. **Edit/update** — `[lotId]/edit/page.tsx` and `LotBuilderForm.tsx` show zero diff this phase.
6. **Status lifecycle** — `CanonicalLotStatusControl.tsx` unmodified this phase (re-verified by direct read, matching its Phase 4.5.10 content exactly).
7. **Active readiness guard** — unaffected; the guard lives in `CanonicalLotStatusControl`, untouched.
8. **`public_id`** — not referenced by this phase's change.
9. **`green_lot_id`** — not referenced by this phase's change.
10. **Café gating** — `app/dashboard/cafe/add-lot/page.tsx` shows zero diff this phase; its rule is unaffected — if anything, this fix makes the `in_roaster_catalog` value that gate (indirectly, via the shared `useLots()` cache) already relied on more likely to match Supabase's real column over time, never less.
11. **Public Passport** — `app/(site)/passport/[lotId]/page.tsx` shows zero diff this phase.
12. **Draft new-tasting gate** — untouched (same unmodified file).
13. **Existing tasting history** — untouched (same unmodified file).

No direct Supabase writes were performed by this phase outside the app's own existing, unmodified functions (`findCanonicalLotByPublicId`, `updateCanonicalLotFields`). No curl/REST inserts, no service-role key, no test data created.

## 9. Residual limitations

- **The list source itself (`useLots()`) is still the local-first hybrid cache**, not a direct canonical read — this phase fixed the *write* divergence (§3.1) but did not migrate the *read* side, per §3.5's reasoning. A roaster on a second device would now at least have their toggle intent correctly reach Supabase; whether they *see* another device's change promptly still depends on `syncLotsFromSupabase()`'s own refresh timing (unchanged, out of this phase's scope).
- **No status-based grouping/tabs were added** — a roaster with many draft/testing Lots mixed into "Активные лоты" (by catalog flag) still relies on the per-row badge, buried behind the Country → Roast Type drill-down, to notice them. Not fixed here, since no concrete evidence of this being a practical problem (vs. a hypothetical one) was found — flagged as a candidate for a future phase if real usage shows it's needed.
- Carried forward, unchanged: `app/dashboard/roaster/new/page.tsx`'s Phase 4.5.2 wizard remains uncommitted in the working tree (last real commit is still `74fdbef`); this phase added no commits.

## Stopping point

Phase 4.5.11 (Roaster Canonical Lot Catalog Management) is complete: the dashboard was audited as a working catalog, no UX restructuring was found necessary, and the one real data-correctness gap — the quick catalog-toggle never persisting to the canonical `lots.in_roaster_catalog` column — was fixed with the existing, unmodified `updateCanonicalLotFields()` function. **Phase 4.5.12 has not been started.**
