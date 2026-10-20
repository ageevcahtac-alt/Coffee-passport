# Phase 4.5.3 — Canonical Lot Read / Detail Flow

## 1. Objective

Give a roaster admin a way to see a Canonical Lot as a self-contained entity while keeping the real relational chain visible:

```
Coffee → Green Lot → Canonical Lot   (forward)
Green Lot → other Canonical Lots     (reverse, proves 1 Green Lot : N Lots reuse)
```

No new entities, no duplicated data, no migration.

## 2. Initial audit findings

Read-only pass over the actual repo state before any change:

1. **Where Canonical Lot lives**: `public.lots` (Supabase), see `supabase/migrations/0022_canonical_lot_core.sql`. Typed as `LotRow` in `lib/types/database.ts`, wrapped as `CanonicalLot` in `lib/data/canonicalLotStore.ts`.
2. **Lot ↔ Green Lot**: `lots.green_lot_id` (not null FK → `green_lots.id`) — exactly one Green Lot per Lot, enforced at the schema level.
3. **Green Lot ↔ Coffee**: `green_lots.coffee_id` (not null FK → `coffees.id`) — one Coffee, many Green Lots.
4. **Listing Canonical Lots today**: no dedicated "list canonical lots" UI. The roaster dashboard (`app/dashboard/roaster/page.tsx`) lists `Lot` (the local/seed+localStorage shape from `lib/data/lotsStore.ts`) via `useLots()`, which is overlaid — not replaced — by `syncLotsFromSupabase()`. `canonicalLotStore.ts` itself only exposes `findCanonicalLotByPublicId` for single-row lookup by `public_id`, plus per-Coffee/per-roaster list functions for the creation wizard.
5. **Detail page**: none. `app/dashboard/roaster/[lotId]/edit/page.tsx` exists but is edit-only (`LotBuilderForm` in edit mode) and never queries `coffees`/`green_lots` — it only shows fields already denormalized onto the local `Lot` override.
6. **Edit page**: `app/dashboard/roaster/[lotId]/edit/page.tsx`, reachable from the dashboard list's "Редактировать" link — this is the natural, already-linked landing page for "click into a Lot."
7. **Reusable pieces**: `canonicalLotStore.ts`'s `rowToCoffee`/`rowToGreenLot`/`rowToCanonicalLot` mappers and its `.maybeSingle()`/`.eq()` query idiom (already used by `resolveRoasterUuid`, `findCanonicalLotByPublicId`); the creation wizard's `describeCoffee`/`describeGreenLot` one-line summary formatters (previously private to `new/page.tsx`).

Search across `green_lot_id` / `public_id` / `canonicalLot` / `greenLot` / `coffee_id` confirmed no other read/detail surface already existed for this chain (the public `/passport/[lotId]` page and `/dashboard/cafe/add-lot` only ever touch the flattened `Lot` shape, never `coffees`/`green_lots` directly).

**Also noted (pre-existing, unrelated to this phase's scope):** `app/dashboard/roaster/new/page.tsx`'s full Phase 4.5.2 creation wizard was present in the working tree but had never been committed — `git log` shows the last commit (`74fdbef`) still has the old one-step `LotBuilderForm`-only version of that file. This report does not commit it; noted under Caveats.

**Live data check (read-only, anon key, no writes performed by this phase):** the user's manual A–D walkthrough from Phase 4.5.2 is confirmed present in Supabase — `LOT-XO-ETH-003` and `LOT-XO-ETH-004` both reference `green_lot_id = 09ac6120-…` (Scenario D: two Canonical Lots sharing one Green Lot), which this phase's detail view now surfaces directly via the "Другие лоты из этой партии" list.

## 3. Exact changed files

- `lib/data/canonicalLotStore.ts` — modified (additive)
- `app/dashboard/roaster/new/page.tsx` — modified (slug/id fix carried from the 4.5.2 close-out session + helper-import rename, see §7)
- `app/dashboard/roaster/[lotId]/edit/page.tsx` — modified (6 lines: one import, one render block)
- `components/roaster/CanonicalLotChain.tsx` — new file

## 4. Implementation

**`lib/data/canonicalLotStore.ts`** — added four read functions and two exported helpers, all following the file's existing patterns exactly (same `.maybeSingle()`/`.eq()`/`.order()` idiom, same not-found-returns-`null` contract as `findCanonicalLotByPublicId`):

- `getCoffeeById(coffeeId)` → `CanonicalCoffee | null`
- `getGreenLotById(greenLotId)` → `CanonicalGreenLot | null`
- `listCanonicalLotsForGreenLot(greenLotId)` → `CanonicalLot[]` — every Lot sharing one Green Lot, newest first (mirrors `listGreenLotsForCoffee`'s shape)
- `describeCanonicalCoffee` / `describeCanonicalGreenLot` — the one-line summary formatters, relocated here (byte-identical logic) from `new/page.tsx` so both the creation wizard and the new detail view describe a Coffee/Green Lot the same way, from one place.

**`components/roaster/CanonicalLotChain.tsx`** — new read-only component, `<CanonicalLotChain publicId={lot.id} />`. On mount: `findCanonicalLotByPublicId` → (if found) `getGreenLotById` + `listCanonicalLotsForGreenLot` in parallel → `getCoffeeById`. Renders three sections (Canonical Lot / Green Lot / Coffee) using only fields that exist in the schema today, plus a "Другие лоты из этой партии" list of sibling Lots (links to their own `/dashboard/roaster/{publicId}/edit`). A Lot with no canonical row yet renders a quiet dashed-border note instead of fabricating a chain; a partial failure (e.g. Green Lot fetch fails) degrades to a "не удалось загрузить" line per section rather than hiding the whole card.

**`app/dashboard/roaster/[lotId]/edit/page.tsx`** — one import added, one `<div className="mb-8"><CanonicalLotChain publicId={lot.id} /></div>` inserted directly above the existing `<LotBuilderForm>`. Nothing else on this page changed — `LotBuilderForm`, `RoastProfileForm`, `BenchmarkRecipeForm` and all their handlers are untouched.

## 5. Architecture decisions

- **Improved the existing edit page instead of adding a parallel route.** The dashboard list already links every Lot to `/dashboard/roaster/[lotId]/edit`; that is the natural "click a Canonical Lot" destination per the task's own instruction to prefer improving an existing suitable page over creating a new one.
- **No new entity, no duplicated storage.** The chain view reads `coffees`/`green_lots`/`lots` directly through three new thin queries; it does not cache, copy, or denormalize any of that data into `Lot`, `lotsStore.ts`, or localStorage.
- **Reverse structure (Coffee → Green Lots → Canonical Lots) is shown scoped to the Lot being viewed**, not as a separate full-catalog browser: the sibling-Lots list under "Другие лоты из этой партии" is the minimal proof that reuse works, without building a new browsing UI the task didn't ask for.
- **Helpers relocated, not duplicated.** `describeCoffee`/`describeGreenLot` existed only inside `new/page.tsx`; moving them (unchanged) into `canonicalLotStore.ts` as `describeCanonicalCoffee`/`describeCanonicalGreenLot` let the detail view reuse the exact same formatting instead of writing a second, potentially-diverging copy. `new/page.tsx`'s own call sites were updated to the new names; its behavior is unchanged (verified by `tsc`/`build`).
- **No fields invented.** "Farmer" is `coffee.producer`, "farm/station" is `coffee.farm` — the schema doesn't split these further, and the detail view doesn't pretend it does.

## 6. Intentionally unchanged files

- `lib/data/lotsStore.ts` — not touched. Its `syncLotsFromSupabase`/`saveLot`/`generateLotId` and its now-slightly-stale header comment ("Lot CREATE/EDIT still writes to localStorage only, not Supabase") are Phase 4.5.2 territory, not 4.5.3's.
- `components/roaster/LotBuilderForm.tsx` — not touched.
- `lib/server/canonicalLot.ts` — not touched (pure domain logic, no new rules needed for a read path).
- Phase 4.5.2's creation flow (`resolveRoasterUuid`, `createCoffee`, `createGreenLot`, `createCanonicalLot`, the wizard stages in `new/page.tsx`) — not redesigned; only the two describe-helper import sites changed, confirmed by direct grep (§ Regression below) and by `tsc`/`vitest`/`build` all passing.

## 7. Validation

**`npx tsc --noEmit`** — passed. No output, no errors.

**`npx vitest run`** — passed.
```
✓ lib/server/canonicalLot.test.ts (14 tests) 22ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```
(No new test file was added — the new code is thin Supabase I/O with no new pure domain logic; the existing 14 tests in `lib/server/canonicalLot.test.ts` cover `generatePublicLotId`, `resolveLegacyLotIds`, `detectPublicIdConflicts`, `partitionSeedLotsByExisting`, `planVersionActivation`, none of which this phase touched.)

**`npm run build`** — passed.
```
✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
 ✓ Generating static pages (39/39)
   Finalizing page optimization ...
   Collecting build traces ...
```
`/dashboard/roaster/[lotId]/edit` built at 9.61 kB / 190 kB First Load JS; `/dashboard/roaster/new` unaffected in shape (8.1 kB / 171 kB). No new route added, no route removed.

## 8. Regression verification

- `createCanonicalLot()` body (in `canonicalLotStore.ts`) — untouched; `git diff` shows only additions before/after it, no lines inside it changed.
- `green_lot_id` insert — untouched (`.insert({ ..., green_lot_id: input.greenLotId, ... })` unchanged).
- `public_id` generation — untouched (`generatePublicLotId` call and its import unchanged; all 14 existing unit tests covering it still pass).
- Green Lot reuse (Scenario B/D) — untouched at the write path; additionally now *visible* at the read path via `listCanonicalLotsForGreenLot`, and confirmed against live data (see §2, `LOT-XO-ETH-003`/`LOT-XO-ETH-004` sharing one `green_lot_id`).
- `new/page.tsx`'s wizard stages (`coffee` → `greenLot` → `lotDetails`), `submitNewCoffee`, `submitNewGreenLot`, `handleLotSave` — logic unchanged; only the two formatter names were renamed at their call sites to import from the shared location.
- No direct Supabase writes were performed by this phase — only read-only `select` queries (via the anon key, matching the app's own RLS-gated public-read policy) to confirm the current live chain state for this report.

## 9. Caveats / technical debt

- `app/dashboard/roaster/new/page.tsx`'s entire Phase 4.5.2 creation wizard, and the `resolveRoasterUuid(roaster.slug) → resolveRoasterUuid(roaster.id)` fix from the 4.5.2 close-out, remain **uncommitted** in the working tree (last real commit is `74fdbef`, which predates the wizard). This phase did not commit anything, per no standing instruction to do so — flagging so it isn't lost.
- `lib/data/lotsStore.ts`'s header comment on `saveLot` is now out of date (it still says Lot create/edit "is NOT switched to Supabase in this pass"), since Phase 4.5.2's `handleLotSave` already calls `createCanonicalLot`. Not fixed here — out of this phase's scope (comment-only, no behavioral bug).
- The Canonical Lot detail view sits *above* `LotBuilderForm` on the same page rather than as a fully separate `/dashboard/roaster/[lotId]` read route. This was the deliberate minimal choice (§5); if a future phase wants a distinct non-editable detail URL (e.g. for sharing or for a cafe-facing view), that would be a new, separate route decision, not a fix to this one.
- `CanonicalLotChain` has no automated test — it's a thin composition of already-covered store functions and JSX; adding a component test would require introducing a testing-library dependency this project doesn't currently have, which felt disproportionate to the size of this change.

## 10. Blockers / risks

None encountered. All three validation commands passed on the first run after implementation.

## 11. Stopping point

Phase 4.5.3 (Canonical Lot Read / Detail Flow) is implemented and validated. **Phase 4.5.4 has not been started.**
