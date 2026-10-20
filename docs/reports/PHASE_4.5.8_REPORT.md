# Phase 4.5.8 — Public Passport / Canonical Lot Integration

## 1. Objective

Audit whether the Public Passport (`app/(site)/passport/[lotId]/page.tsx`) correctly represents a specific *Canonical Lot* — with Coffee as identity/description, Green Lot as internal purchase provenance never guest-facing, and Canonical Lot as the specific release — and fix only a concrete, proven gap, without a redesign.

## 2. Audit — actual current state (before any change)

### 2.1 How the Passport resolves a Lot from `public_id`

`params.lotId` is matched by exact string equality: `lots.find(candidate => candidate.id === params.lotId)`, where `lots` comes from `useLots()` (seed + localStorage + `syncLotsFromSupabase()` Supabase overlay) and `lot.id` is the `public_id` (`rowToLot`, `lib/data/lotsStore.ts`, sets `id: row.public_id`). **This is unambiguous and correct** — `public_id` is unique (enforced by a DB constraint, `0022_canonical_lot_core.sql`), so this lookup can never resolve to the wrong Lot (audit question #1/#2 — no evidence of any cross-Lot mixing anywhere in this lookup path).

### 2.2 Which fields already come from where

Traced every guest-visible field, component by component:

| Component | Fields read | Actual source today |
|---|---|---|
| `LotPassport` | `name`, `qGrade`, `country`, `region`, `process`, `cropYear`, `roastProfile`, `descriptors` | `name`/`qGrade`/`roastProfile`(`roast_profile_label`)/`descriptors` — **canonical**, via `rowToLot`. `country`/`region`/`process`/`cropYear` — **local Lot object only**, never canonical, before this phase. |
| `ProducerRoasterCard` | `roastType`, `qGrade`, `cropYear`, `producer.farmerName`, `producer.farmName`, `region`, `producer.altitude`, `process`, `roasterFlavorProfile`, `producer.story` | `roastType`/`qGrade`/`roasterFlavorProfile` (via active `reference_taste_profiles`) — **canonical**. `producer.*`, `region`, `process` — **local Lot object only**, before this phase. |
| `FarmerRevealCard` | `producer.farmerName`, `producer.farmName`, `region`, `country` | **Local Lot object only**, before this phase. |
| `RoastProfileSummaryCard`, `RoastingTab`, `ExtractionTab`, `TasteComparison`, `RoasterCafeRecommendations`, `BlindTastingLock` | `roastType`, `qGrade`, `descriptors`, `roasterFlavorProfile`, `id`, `name`, `roasterId` | All already **canonical** (`rowToLot`-mapped) or identity fields (`id`/`roasterId`) — no gap. |

**Finding**: the only guest-facing fields NOT already sourced from canonical Supabase data are exactly the Coffee-identity fields — `country`, `region`, `process`, `cropYear`, and the producer sub-object (`farmerName`, `farmName`, `altitude`; `story` has no Coffee equivalent at all).

### 2.3 Why this is a real gap, not a stylistic one

Traced the write path that produces these fields. In `app/dashboard/roaster/new/page.tsx`'s creation wizard, `LotBuilderForm` is rendered with **no `initialLot`**: `<LotBuilderForm roaster={roaster} onSave={handleLotSave} onCancel={...} />`. Its own `toFormState(undefined)` starts every field — including the entire "Происхождение" step (country, region, farmerName, farmName, altitude) — **blank**, even though the roaster already picked or created the real `Coffee` (with its own `country`/`region`/`farm`/`producer`/`altitude`/`processing`/`harvestYear`) one or two steps earlier in the *same* wizard session. Nothing carries that data forward; the roaster re-types origin information from scratch, disconnected from the Coffee row the resulting Canonical Lot is structurally linked to via `green_lot_id → coffee_id`.

Consequence: two different Canonical Lots sharing one Green Lot (and therefore the same real Coffee) can display **different** origin/producer text on their public Passports, because each Lot's local override carries its own independently-typed copy rather than reading the one shared Coffee row. This is exactly what "Coffee = идентичность и описание самого кофе" is supposed to prevent — the identity should be singular and drawn from the one Coffee record, not duplicated per Lot.

### 2.4 Green Lot fields — never guest-facing (confirmed)

Grepped every component reachable from the Passport page for `purchasedKg`, `purchaseDate`, `contractReference`, or Green-Lot `notes` — **zero matches anywhere in the guest-facing tree**. Audit question #6 (Green Lot fields that must not reach the guest) — already correctly true; nothing needed changing here.

### 2.5 `in_roaster_catalog` dependency check

Re-confirmed (already established in Phases 4.5.6/4.5.7, re-verified here): no component in the Passport render tree reads `inRoasterCatalog` at all. Audit question #9 — already correct, untouched.

### 2.6 `legacy lotsStore` usage where canonical data was already available

This *is* the gap (§2.2/§2.3) — `useLots()`/`lotsStore.ts` was the exclusive source for Coffee-identity fields even though `lib/data/canonicalLotStore.ts` already had every function needed to fetch the real Coffee row (`getGreenLotById`, `getCoffeeById`, both built in Phase 4.5.3) — they were simply never called from this page.

### 2.7 Persistence/history (Phase 4.5.7) — not at risk

The fix scoped here only changes *which values* populate three already-existing, always-rendered components' props for three components — it does not touch the `!lot` not-found branch, the `canonicalStatus === 'draft'` gate, or the `latestTasting` lookup/branch at all. Re-verified after implementation: `git diff` shows zero lines removed from any of those three branches.

## 3. Rule adopted

> **For the guest-facing Passport display only, a Canonical Lot's Coffee-identity fields (country, region, processing, harvest year, producer name, farm name, altitude) are read from the actual `coffees` row this Lot's Green Lot belongs to, when that row exists and has the field set. The local Lot object's own copy of the same field is used only as a fallback — for a field the Coffee row has left blank, or for a Lot with no canonical chain at all (pre-canonical/local-only).**

This mirrors the exact "canonical wins when present, local is the fallback" convention `rowToLot` already established for `name`/`roast_type`/`q_grade`/`descriptors` — extended here to the fields it never covered. `producer.story` is explicitly excluded (no Coffee equivalent exists; it remains the roaster's own local narrative text, unchanged).

## 4. What was implemented

**`app/(site)/passport/[lotId]/page.tsx`**:
- `withCanonicalCoffeeOverlay(lot, coffee)` — a small, page-local, pure function: spreads the local `Lot`, then overwrites `country`/`region`/`process`/`cropYear`/`producer.{farmerName,farmName,altitude}` with the matching Coffee field whenever that field is non-empty. Not exported — needed by exactly one file, so it stays there rather than becoming a new shared abstraction (per the task's own "don't build new architecture until proven needed").
- The existing Phase 4.5.7 effect (which already calls `findCanonicalLotByPublicId(lot.id)` to get `canonicalStatus`) was extended — not duplicated — to also resolve `getGreenLotById(found.greenLotId)` → `getCoffeeById(greenLot.coffeeId)` in the same round trip, storing the result in a new `canonicalCoffee` state.
- `const displayLot = withCanonicalCoffeeOverlay(lot, canonicalCoffee);`, computed once, right after the existing `!lot` not-found guard (so `lot` is already narrowed to non-null by TypeScript at that point).
- `displayLot` replaces `lot` at exactly the 5 call sites of the 3 components that actually read Coffee-identity fields: `LotPassport` (×2 — preview and normal render), `ProducerRoasterCard` (×2), `FarmerRevealCard` (×1). Every other component on the page (`RoastProfileSummaryCard`, `RoastingTab`, `ExtractionTab`, `TasteComparison`, `RoasterCafeRecommendations`, `BlindTastingLock`, `LocationStep`) still receives the original `lot`, unmodified — confirmed by grep, only those 5 lines changed.

No new data-access function was needed — `getGreenLotById` and `getCoffeeById` already existed (Phase 4.5.3), unmodified.

## 5. Source of truth after this change

| Field group | Source of truth |
|---|---|
| `public_id`, `name`, `status`, `in_roaster_catalog`, `roast_type`, `roast_profile_label`, `q_grade`, `descriptors`, `roasterFlavorProfile` | Canonical `lots`/`reference_taste_profiles` (unchanged — already true before this phase) |
| `country`, `region`, `process`/`processing`, `cropYear`/`harvestYear`, `producer.farmerName`(`coffee.producer`), `producer.farmName`(`coffee.farm`), `producer.altitude` | **Canonical `coffees` row when present and non-empty** (new this phase); local Lot override as fallback |
| `producer.story` | Local Lot object only — no canonical equivalent exists |
| Green Lot fields (`purchasedKg`, `purchaseDate`, `contractReference`, `notes`) | Never surfaced to a guest, on any surface — confirmed, unchanged |

## 6. What was deliberately NOT changed

- **The creation wizard's data-entry UX** (`app/dashboard/roaster/new/page.tsx`, `components/roaster/LotBuilderForm.tsx`) — the *root cause* of the divergence (`LotBuilderForm` never gets prefilled from the Coffee the roaster just picked) was not touched. This phase's scope, per its own instructions, is the Passport's read/display side; fixing the wizard's redundant data-entry step is a separate concern (would mean either passing partial initial values into `LotBuilderForm` or restructuring its origin step — exactly the kind of redesign this phase was told not to do). Flagged as a residual limitation (§9), not fixed here.
- **`Café gating` (Phase 4.5.6)** and **`draft` new-tasting gating (Phase 4.5.7)** — zero diff to `app/dashboard/cafe/add-lot/page.tsx`; the `canonicalStatus === 'draft'` branch in the Passport page is untouched, confirmed by `git diff` showing no removed lines in that section.
- **Persistence/history** — the not-found branch and the `latestTasting`-found branch (full history rendering) are untouched in structure; `displayLot` only changes *values* passed to 3 already-rendered components, never *whether* they render.
- **`public_id`, `green_lot_id`, Coffee/Green Lot schema** — no migration, no schema change; `getGreenLotById`/`getCoffeeById` are pre-existing, unmodified functions.
- **`lotsStore.ts`/`useLots()`** — not touched. The task explicitly warned against replacing working localStorage/history mechanics "for the sake of a nicer architecture" without proof; the fix here is additive (an overlay computed at render time), not a replacement of the existing cache/sync mechanism.

## 7. Exact changed files

- `app/(site)/passport/[lotId]/page.tsx` — modified (+106 / −5 lines net for this phase relative to the end of Phase 4.5.7)

**Not touched this phase** (confirmed via `git diff --stat` showing identical byte counts to the end of Phase 4.5.7): `lib/data/canonicalLotStore.ts`, `app/dashboard/cafe/add-lot/page.tsx`, `app/dashboard/roaster/page.tsx`, `app/dashboard/roaster/[lotId]/edit/page.tsx`, `app/dashboard/roaster/new/page.tsx`, `components/roaster/LotBuilderForm.tsx`, `components/coffee/BlindTastingLock.tsx`, `app/(site)/passport/[lotId]/taste/page.tsx`, `components/roaster/CanonicalLotChain.tsx`, `components/roaster/CanonicalLotStatusControl.tsx`, any migration, `coffees`/`green_lots` schema.

## 8. Validation

**`npx tsc --noEmit`** — passed. No output, no errors. (One real type issue was caught and fixed during implementation: `displayLot` was initially computed before the `!lot` narrowing guard, which left its static type as `Lot | undefined`, incompatible with `LotPassport`'s `lot: Lot` prop. Moved the computation to after the guard; `tsc` then passed clean.)

**`npx vitest run`** — passed.
```
✓ lib/server/canonicalLot.test.ts (14 tests) 20ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```
No new test added — `withCanonicalCoffeeOverlay` is a small, page-local, deterministic pure function, but it lives inside a `'use client'` page file, not a candidate module for this project's existing pure-logic test file (`lib/server/canonicalLot.test.ts`, which only covers server-side domain logic per its own header comment). Adding a new test harness for a single page-local helper was judged disproportionate.

**`npm run build`** — passed.
```
✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Generating static pages (39/39)
   Finalizing page optimization ...
   Collecting build traces ...
```
`/passport/[lotId]` grew from 10.9 kB to 11.1 kB (207 kB First Load JS, was 206 kB) — the new overlay logic and extra fetch. No route added or removed.

## 9. Regression

- **Creation wizard, `public_id` generation, `green_lot_id`, reuse of one Green Lot**: `lib/data/canonicalLotStore.ts` and `app/dashboard/roaster/new/page.tsx` — zero diff this phase (confirmed, §7).
- **Roaster Dashboard (4.5.5)**: zero diff.
- **Detail/edit (4.5.3/4.5.4)**: zero diff.
- **Café ordering (4.5.6)**: zero diff to `add-lot/page.tsx`; its rule is unaffected.
- **Public Passport structure**: not-found screen, preview mode, location-step gate — untouched. The `draft`-gate branch (4.5.7) — untouched, confirmed no removed lines in that section of the diff.
- **Existing tasting history**: the `latestTasting`-found branch's structure (which components render, in what order, under what conditions) is completely unchanged — only 5 prop values (`lot` → `displayLot`) were swapped within it; `TasteComparison`, `RoasterCafeRecommendations`, `ExtractionTab` (all reading `roasterFlavorProfile`/`descriptors`/identity fields, never Coffee-identity fields) are untouched.
- **Coffee and Green Lot never change**: `getGreenLotById`/`getCoffeeById` are pure `select`s, unmodified since Phase 4.5.3; this phase adds no `insert`/`update`/`delete` anywhere.
- No direct Supabase writes were performed by this phase — only existing, unmodified read functions. No curl/REST inserts, no service-role key, no test data created.

## 10. Residual limitations / architectural questions

- **Root cause not fixed at the source.** `LotBuilderForm`'s Origin step still starts blank and disconnected from the Coffee the roaster already selected/created in the same wizard session — a roaster can still type origin text for a new Lot that doesn't match its real Coffee row. This phase makes the **Passport display** correct regardless (canonical Coffee wins when present), but a roaster could still, in principle, see their own dashboard/edit-form fields diverge from what a guest actually sees on the Passport, since `LotBuilderForm`'s own fields are never overlaid the same way (`CanonicalLotChain`, Phase 4.5.3, already shows the real Coffee separately on the roaster's own detail view, which partially mitigates this — a roaster editing a Lot already sees both the canonical Coffee chain card and their own form's fields side by side). Fixing `LotBuilderForm` to prefill from Coffee is the natural next step, flagged as a candidate for a future phase, not started here.
- **`variety`** (present on `CanonicalCoffee`, captured at Coffee-creation) is not displayed anywhere on the Passport at all, by either the local Lot or the overlay — confirmed neither `LotPassport` nor `ProducerRoasterCard` render it. Not a regression (it was never shown before this phase either), just noted as an existing, unrelated gap this phase didn't need to touch.
- Carried forward, unchanged from prior reports: `app/dashboard/roaster/new/page.tsx`'s Phase 4.5.2 wizard remains uncommitted in the working tree (last real commit is still `74fdbef`); this phase added no commits.

## Stopping point

Phase 4.5.8 (Public Passport / Canonical Lot Integration) is implemented and validated: a concrete, proven divergence between guest-facing Coffee-identity fields and the actual canonical `coffees` row was found and closed at the display layer, using only pre-existing data-access functions. The creation-wizard root cause remains open, explicitly flagged. **Phase 4.5.9 has not been started.**
