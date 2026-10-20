# Phase 4.5.5 — Roaster Catalog / Status Visibility Gap

## 1. Objective

After CREATE → DETAIL → EDIT/UPDATE (Phases 4.5.1–4.5.4), find the next real gap standing between Canonical Lot and it being genuinely usable in the Roaster Catalog / Coffee Passport — without inventing a new entity, without a big new block, and without touching Coffee/Green Lot architecture.

## 2. Audit (read-only, before any change)

Answering the task's seven questions against the actual current code:

1. **How a Canonical Lot reaches the roaster's catalog today**: `app/dashboard/roaster/page.tsx` calls `useLots()` (local seed+localStorage cache) and, on mount, `syncLotsFromSupabase()` — which overlays the real `public.lots` rows onto that same cache via `rowToLot()` (`lib/data/lotsStore.ts:100`). A Canonical Lot created through the Phase 4.5.2 wizard already appears here, because `handleLotSave` (in `new/page.tsx`) writes a local override in the same call that creates the canonical row.
2. **How `in_roaster_catalog` works**: it is the *only* field gating anything today. Confirmed by direct grep:
   - `app/dashboard/roaster/page.tsx`: drives the Active/Archived dashboard tabs (`activeLots`/`archivedLots` filter on `lot.inRoasterCatalog`).
   - `app/dashboard/cafe/add-lot/page.tsx`: gates whether a café can add a Lot to its menu (`available = lots.filter(lot => ... && lot.inRoasterCatalog)`, plus the same check in the manual-code path).
   - `app/(site)/passport/[lotId]/page.tsx`: grepped for both `status` and `inRoasterCatalog` — **zero matches for either**. The public passport page is reachable and renders regardless of both fields, by design for `inRoasterCatalog` (its own doc comment: turning it off "must NOT cascade into hiding the lot from a coffee shop that already stocked it") — but this means it was never designed to consider `status` at all.
3. **Is there already a full Canonical Lot / Roaster Catalog list, or only separate pages?** `app/dashboard/roaster/page.tsx` *is* the existing catalog list — already grouping/tabbing by `inRoasterCatalog`. No second, competing catalog page exists. This is not a gap; it's the thing to extend, not replace.
4. **How should the roaster see active/draft/archived Canonical Lots?** Today they can't, for `status` specifically — the dashboard list only tells them `inRoasterCatalog` (via the "В архиве" badge and the two tabs). `status` (`draft`/`testing`/`active`/`archived`, editable since Phase 4.5.4) has no visibility anywhere in this list. `lib/types/coffee.ts`'s `Lot` interface has no `status` field at all — confirmed by reading it in full.
5. **Reusable existing logic?** `listCoffeesForRoaster(roasterUuid)` (Phase 4.5.1) is the exact pattern needed for "list every Canonical Lot this roaster owns" — same shape, just against `lots` instead of `coffees`. `resolveRoasterUuid(roasterId)` (Phase 4.5.1, fixed in the 4.5.2 close-out to take the text id, not the cosmetic slug) is already the correct way to get the uuid this needs.
6. **Is there a gap between edit/detail and the catalog?** Yes — this is the actual finding. Phase 4.5.3 (`CanonicalLotChain`) and Phase 4.5.4 (`CanonicalLotStatusControl`) both surface `status` prominently on the single-Lot detail/edit page, but a roaster scanning their whole catalog list has no way to tell which Lots are still `draft`/`testing` versus fully `active` without opening each one individually. Editing status (4.5.4) closed the write side; nothing closed the corresponding read side at the list level.
7. **Legacy/localStorage mechanisms still interfering**: `lib/data/lotsStore.ts`'s override-shadowing merge (`syncLotsFromSupabase`) means a Lot with any local override entirely replaces the canonical-mapped object in the cache — including for fields the canonical row now carries. This is why `status` cannot be safely added *into* that merged `Lot` object for this phase: doing so would mean either (a) making `status` required on `Lot`, breaking every existing object-literal construction site (`LotBuilderForm`, seed data), or (b) making it optional and accepting that a local override — which never sets it — silently reverts a Lot's displayed status to "unknown" the moment the roaster edits anything else about it via `LotBuilderForm`. Both are worse than not touching the shared type at all.

**Conclusion**: the concrete, safely-scoped gap is *"the roaster catalog list cannot show `status`, so operators can't tell a draft Lot from a published one without opening it."* Fixing café-orderability or public-passport-visibility gating by `status` is a **separate, larger decision** (see §9) — not attempted this phase.

## 3. Exact changed files

- `lib/data/canonicalLotStore.ts` — modified (additive only: one new function, `+16` lines, `0` lines removed — confirmed by `git diff | grep '^-'` producing no output across all of Phases 4.5.3–4.5.5 combined)
- `app/dashboard/roaster/page.tsx` — modified (+50 lines: new imports, a local `STATUS_LABELS` map, a new read-only status fetch, one new `LotRow` prop, one new badge)

**Not touched**: `lib/data/canonicalLotStore.ts`'s `createCanonicalLot`, `generatePublicLotId` usage, and every existing exported function (verified: zero removed lines anywhere in the file, confirmed above); `components/roaster/LotBuilderForm.tsx` (zero diff, confirmed via `git diff` producing no output); `lib/types/coffee.ts` (untouched — `Lot` interface unchanged, no `status` field added); `app/dashboard/cafe/add-lot/page.tsx`; `app/(site)/passport/[lotId]/page.tsx`; `components/roaster/CanonicalLotChain.tsx`; `components/roaster/CanonicalLotStatusControl.tsx`; `app/dashboard/roaster/new/page.tsx`; `app/dashboard/roaster/[lotId]/edit/page.tsx`.

## 4. Implementation

**`lib/data/canonicalLotStore.ts`** — added `listCanonicalLotsForRoaster(roasterUuid)`, structurally identical to the existing `listCoffeesForRoaster` (same `.eq()`/`.order('created_at', {ascending:false})` shape, same not-throwing-null-tolerant... actually throwing-on-error convention matching that function exactly), just against `lots` scoped by `roaster_id` instead of `coffees`.

**`app/dashboard/roaster/page.tsx`**:
- New state: `canonicalStatuses: Map<publicId, LotStatus>`, populated once on mount (and whenever `roasterId` changes) via `resolveRoasterUuid(roasterId)` → `listCanonicalLotsForRoaster(uuid)`. This is a plain component-level `useState`/`useEffect` — it is never written into `lotsStore`'s cache, never touches `localStorage`, and has no effect on `useLots()`, `syncLotsFromSupabase`, the Active/Archived tab split, or any other consumer of the `Lot` type.
- `LotRow` gained one new prop, `canonicalStatus: LotStatus | null`, and renders a small pill badge — "Статус: {label}" — next to the existing "В архиве" badge, but **only when the status is not `'active'`** (an `active` Lot needs no extra badge; that's the expected/default state the "Активные лоты" tab name already implies). A Lot with no canonical row yet (`canonicalStatus === null`, e.g. a purely local/seed Lot never migrated) renders no badge, same tolerance as `CanonicalLotChain`'s own "not connected" state.

## 5. Architecture decisions

- **Read-only, additive, out-of-band from `lotsStore`'s cache.** Rather than teaching the local `Lot` type or its localStorage-override merge about `status` (which §2.7 shows would be actively harmful — a local edit would silently blank out the displayed status), the dashboard fetches canonical statuses into a separate, purely-presentational `Map` that only a status badge reads. No existing data flow was altered.
- **`listCanonicalLotsForRoaster` mirrors an existing function instead of inventing a new query shape.** Matches the task's "используй существующие data-access функции там, где они подходят" instruction as closely as possible — it's a one-column-different copy of `listCoffeesForRoaster`.
- **No gating changed.** `app/dashboard/cafe/add-lot/page.tsx` and `app/(site)/passport/[lotId]/page.tsx` are untouched. `status` remains purely informational everywhere except the roaster's own detail/edit page (4.5.3/4.5.4) and, as of this phase, the roaster's own catalog list — it still has zero effect on what a café can order or what a public passport shows. That is a deliberate scope boundary, not an oversight (see §9).
- **Badge suppressed for `active`.** Keeps the existing, already-working "В архиве" badge and tab system the primary signal; the new badge only adds information for the two statuses (`draft`, `testing`) — and, redundantly but harmlessly, `archived` — that the existing UI had no way to express at all.

## 6. Intentionally unchanged

- `createCanonicalLot()`, `generatePublicLotId` usage, `green_lot_id` handling — zero diff, confirmed by `git diff` showing no removed lines anywhere in `canonicalLotStore.ts` across this phase.
- `components/roaster/LotBuilderForm.tsx` — zero diff.
- `lib/types/coffee.ts`'s `Lot` interface — no `status` field added, per §2.7's reasoning.
- `app/dashboard/cafe/add-lot/page.tsx`, `app/(site)/passport/[lotId]/page.tsx` — café-ordering and public-passport gating remain `inRoasterCatalog`-only, unchanged.
- Coffee/Green Lot creation, reuse, and the multi-Lot-per-Green-Lot relationship — untouched at every level (schema, data-access, UI).
- Phases 4.5.3/4.5.4's own files (`CanonicalLotChain.tsx`, `CanonicalLotStatusControl.tsx`, the `[lotId]/edit` page) — zero diff this phase.

## 7. Validation

**`npx tsc --noEmit`** — passed. No output, no errors.

**`npx vitest run`** — passed.
```
✓ lib/server/canonicalLot.test.ts (14 tests) 19ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```
No new test added — `listCanonicalLotsForRoaster` is a thin Supabase I/O wrapper with no new branching logic (identical shape to the already-untested `listCoffeesForRoaster`), consistent with this project's existing convention of only unit-testing pure domain logic (stated in `canonicalLot.test.ts`'s own header comment).

**`npm run build`** — passed.
```
✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Generating static pages (39/39)
   Finalizing page optimization ...
   Collecting build traces ...
```
`/dashboard/roaster` grew from 6.42 kB to 8.17 kB (327 kB First Load JS, was 325 kB) — the new fetch + badge logic. No route added or removed.

## 8. Regression

- **Canonical Lot creation** (`new/page.tsx`'s wizard, all 4 scenarios): zero diff to `new/page.tsx` or to `createCoffee`/`createGreenLot`/`createCanonicalLot` this phase.
- **`public_id`**: `generatePublicLotId` and its 14 covering tests unmodified, still pass.
- **`green_lot_id`**: not referenced anywhere in this phase's new code (`listCanonicalLotsForRoaster` selects `*` and maps through the existing, unchanged `rowToCanonicalLot`, same as every other list function in this file).
- **Reuse of one Green Lot by multiple Canonical Lots**: unaffected — `listCanonicalLotsForGreenLot` (4.5.3) and the creation wizard's Green-Lot-selection step (4.5.2) are untouched.
- **Detail/read flow (4.5.3)** and **edit/update flow (4.5.4)**: `CanonicalLotChain.tsx`, `CanonicalLotStatusControl.tsx`, and `[lotId]/edit/page.tsx` all show zero diff this phase.
- **Coffee and Green Lot never change from any Canonical Lot operation**: `listCanonicalLotsForRoaster` is a pure `select`, touches no other table, and this phase added no new `update`/`insert` calls anywhere.
- No direct Supabase writes were performed by this phase — `listCanonicalLotsForRoaster` and the dashboard's new fetch are read-only `select` queries via the existing anon-key client, matching the app's public-read RLS policy (`0025_canonical_lot_rls.sql`). No curl/REST inserts, no service-role key, no test data created.

## 9. Residual limitations / recommended next step (not started)

The following was identified but **deliberately not implemented**, per the task's instruction to flag rather than unilaterally start a step that needs its own architectural decision:

**`status` still has zero effect on café-orderability or public-passport visibility.** A Lot in `draft` or `testing` status is, today, exactly as orderable by a café and exactly as reachable via its public passport URL/QR as one in `active` status — the only thing gating either surface is `inRoasterCatalog`, which defaults to `true` at creation. Closing this would require answering several product questions this phase should not decide unilaterally:

- Should `testing` behave differently from `draft` (e.g. café-visible-but-flagged vs. fully hidden)?
- Should a `draft`/`testing` Lot's public passport 404, show a "coming soon" state, or render normally?
- Should this gating cascade to Lots already added to a café's menu before their status changed (mirroring the existing `inRoasterCatalog` non-cascade rule), or behave differently?

Recommended next phase (**candidate Phase 4.5.6**): design and implement `status`-based gating for `app/dashboard/cafe/add-lot/page.tsx` and/or `app/(site)/passport/[lotId]/page.tsx`, once those product questions are answered — not attempted here.

Also carried forward, unchanged from prior reports: `app/dashboard/roaster/new/page.tsx`'s Phase 4.5.2 wizard and the `resolveRoasterUuid` slug/id fix remain uncommitted in the working tree (last real commit is still `74fdbef`); this phase added no commits either.

## 10. Blockers / risks

None encountered. All three validation commands passed on the first run after implementation. No Supabase writes (test or otherwise) were made this phase.

## Stopping point

Phase 4.5.5 (Roaster Catalog status-visibility gap) is implemented and validated. **Phase 4.5.6 has not been started** — §9 above is a finding and recommendation only, not a plan committed to code.
