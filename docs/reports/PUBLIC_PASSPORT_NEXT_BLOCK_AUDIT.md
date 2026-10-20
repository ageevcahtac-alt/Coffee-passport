# Public Coffee Passport — Next Major Block: Audit

## 1. Scope

Canonical Lot Architecture (4.5.1–4.5.12) is closed and confirmed consistent. This is the first-stage audit of the next block: making the Public Passport a genuinely complete digital representation of a specific Canonical Lot. Per instructions, this document is audit-first; one clearly-evidenced, safely-implementable gap was found and closed at the end (§7) — everything else is findings only.

## 2. Current state of the Public Passport

**Route**: `app/(site)/passport/[lotId]/page.tsx`. Resolves `params.lotId` (a `public_id`) against `useLots()` (seed + localStorage + `syncLotsFromSupabase()` canonical overlay). Not found → plain "Лот не найден" screen. Found → branches on `?preview=1` (staff preview), then on whether a shop is selected (`LocationStep`), then on whether a saved tasting (`journey`) already exists for (lot, shop, user).

**Components in the render tree** (all read, this session, to build this audit — none had been fully read together before):
- `LotPassport` — name, Q-Score seal, country/region/process/cropYear, roast profile label, descriptor tags.
- `ProducerRoasterCard` — roast-type badge, Q-Score, crop year, farmer/farm/region/altitude/process, **roaster flavor-profile meters (acidity/sweetness/body/bitterness)**, roaster's own story text.
- `FarmerRevealCard` — the dedicated "Кто вырастил этот кофе" reveal moment: farmer name, farm name, region, country.
- `BlindTastingLock` — gates the above behind a guest's own blind cupping; shows a small set of "basic facts" (country/region/farm/process/cropYear/Q-Score) even locked, then links to `/passport/[lotId]/taste`.
- `TasteComparison` — the core reveal: guest's own flavor profile vs. **`lot.roasterFlavorProfile`**, rendered as a radar chart and a per-axis diff table ("Ваши ощущения vs Задумка обжарщика"), plus the guest's star rating vs. the Lot's Q-Score.
- `RoastProfileSummaryCard` / `RoastingTab` — a marketing-style target-curve card and a technical logged-batch chart, both sourced from `lib/data/roastProfilesStore.ts` (`useRoastProfiles()`), synced from `roast_batches` on page mount.
- `RoasterCafeRecommendations`, `LotRemovalCountdown`, `ExtractionTab` — supporting cards, not examined for gaps beyond confirming they don't read anything flagged below.

**Journey/checkins/history**: `journey` (guest-local records, matched by `lot.id` = `public_id`, `coffeeShopId`, `userId`) drives whether the "already tasted" branch renders; `checkins` (Supabase) is written from the taste flow separately. Both key off the immutable `public_id` — re-confirmed structurally sound (no change from Phase 4.5.7's finding).

**QR/PDF**: `downloadLotQrPdf`/`handleCopyLink` (roaster dashboard) encode `${origin}/passport/${lot.id}` — `public_id`-based, immutable, structurally reliable (re-confirmed, no gap).

## 3. User journey → source-of-truth map

| Journey step | Current implementation | Source of truth | Gap |
|---|---|---|---|
| QR → Canonical Lot | `useLots()` exact `public_id` match | Supabase `lots` (via sync) | None |
| Coffee identity (name) | `rowToLot` canonical mapping | Supabase `lots.name` | None |
| Origin / producer | `withCanonicalCoffeeOverlay` (Phase 4.5.8) prefers real `coffees` row | Supabase `coffees` | None — closed in 4.5.8/4.5.9 |
| Roaster | `getRoasterById` — name shown everywhere; `philosophy`/`city` never rendered to a guest anywhere | Local `roasters` catalog (not the canonical `roasters` org table) | Minor completeness gap, cosmetic — not pursued (see §5) |
| Roast information (target curve, logged batches) | `roastProfilesStore.ts`, synced read-only from `roast_batches` | Supabase `roast_batches` for reads; **no insert path exists anywhere in the app** (`saveRoastProfile` is local-only; grepped every reference to `roast_batches` — the only `.insert` in the whole repo is the one-time backfill script) | **Real gap, found — not selected this iteration (see §6)** |
| Q-Grade | `lot.qGrade`, canonically synced (and, since Phase 4.5.12, correctly write-through on edit) | Supabase `lots.q_grade` | None |
| Sensory / taste profile | `lot.roasterFlavorProfile`, read from `reference_taste_profiles`'s `active` row when one exists | Supabase `reference_taste_profiles` | **Real gap, found and fixed this iteration (§7)** — see below |
| Guest tasting | `journey` local record + `checkins` Supabase row | Guest-local + Supabase, correctly scoped | None |
| Personal history | `journey` lookup by `(lot.id, shop, user)` | Guest-local | None (Phase 4.5.7 finding still holds) |

## 4. The gap selected: Reference Taste Profile has no write path

Traced every reference to `reference_taste_profiles` in the repository. It is read in exactly one place (`lib/data/lotsStore.ts`'s `rowToLot`) and **written in exactly one place — `scripts/migrate-canonical-lot.ts`, a one-time backfill script**, never from any live application code.

Consequence, read precisely from `rowToLot`:

```js
roasterFlavorProfile: activeTaste
  ? { acidity: activeTaste.acidity, ... }
  : fallback?.roasterFlavorProfile ?? { acidity: 0, sweetness: 0, body: 0, bitterness: 0 },
```

`fallback` is whatever the *viewing browser's own* local cache already has for this `public_id` (seed data, or a prior local edit). For the four seed Lots, `fallback` is thoughtfully-set seed data, so this has been invisible so far. **For every Lot created through the live app since the Canonical Lot wizard shipped (Phase 4.5.2 onward), there is no seed fallback at all** — and since `activeTaste` can never exist (nothing ever inserts it), any guest whose browser has no local override for that Lot (i.e. every real guest who isn't the roaster's own browser) sees `{ acidity: 0, sweetness: 0, body: 0, bitterness: 0 }`, rendered with full visual confidence as **"Эталон обжарщика"** — the benchmark the guest's own blind tasting is compared against in `TasteComparison`, the app's signature reveal moment, and in `ProducerRoasterCard`'s flavor meters.

This is not a cosmetic gap. It directly breaks priority #5 (sensory profile) and #6 (a coherent tasting experience) from the stated priority list: the core "compare your palate to the expert's" mechanic compares every guest against a flat zero rather than a real opinion, for every Lot created since this architecture went live. The logic to fix it correctly — `planVersionActivation()` — has existed as pure, unit-tested code since Phase 4.5.1 specifically for this purpose; it was simply never connected to a write call. Closing it means completing an already-designed mechanism, not inventing new architecture.

## 5. Other findings (not selected, with reasoning)

- **Roaster info completeness** (`philosophy`, `city` never shown to a guest): real, but cosmetic content-completeness, not a broken/misleading mechanic — doesn't meet the "не косметические проблемы" bar the task set.
- **`roast_batches` has the identical write-gap shape** (§3) — `RoastingTab` will show "обжарщик ещё не опубликовал профиль обжарки" forever for any real Lot, for the same reason. This is real and evidenced, but serves a lower-priority, more supplementary/technical part of the journey (priority #4, a secondary "Обжарка" tab) than the taste-profile gap (priorities #5/#6, the *centerpiece* reveal). Fixing both in one pass would mean two separate, only-loosely-related user scenarios bundled together — the task asked to combine gaps only when they're logically one scenario. Flagged as the clear next candidate for a following iteration, not attempted here.

## 6. Why the taste-profile gap, specifically, was chosen

Per the stated priority order and "не косметические проблемы": this is the only found gap that is (a) evidenced with a concrete, traceable failure mode (all-zero data shown as if authoritative), (b) directly damages the app's *signature* interaction rather than a supplementary tab, (c) safely closeable without a new architectural decision — the versioning logic (`planVersionActivation`) was already designed and tested for exactly this, just never wired to a write call, and (d) touches no forbidden surface: no schema change, no new entity, `public_id`/`green_lot_id` untouched, Coffee/Green Lot untouched, `status` semantics untouched, Café gating untouched, Public Passport *lifecycle* (draft-gating, persistence, history) untouched — only the *content* of one already-displayed field becomes accurate.

## 7. What was implemented

**`lib/data/canonicalLotStore.ts`** — new `activateTasteProfile(lotUuid, { acidity, sweetness, body, bitterness })`: reads existing `reference_taste_profiles` rows for the Lot, calls the pre-existing `planVersionActivation()` (`lib/server/canonicalLot.ts`, unmodified) to get `{ supersedeId, nextVersion }`, and performs the two-step write it specifies — supersede the previous `active` row (if any, never rewritten), then insert the new version as `active`. Matches Stage 3 §07/§25's own rule, already the codebase's stated intent for this table.

**`app/dashboard/roaster/new/page.tsx`** — `handleLotSave` now calls `activateTasteProfile(canonicalLot.id, lot.roasterFlavorProfile)` immediately after `createCanonicalLot()` succeeds, using the exact flavor-slider values `LotBuilderForm` already collected. A brand-new Lot now gets a real, guest-visible reference profile from the moment of creation, instead of never getting one at all.

**`app/dashboard/roaster/[lotId]/edit/page.tsx`** — `handleSave` now also calls `activateTasteProfile(canonicalLot.id, updated.roasterFlavorProfile)` alongside the existing `updateCanonicalLotFields` call, so a roaster correcting the sliders later (e.g. after further cupping) creates a new active version instead of the edit silently only updating their own browser's local cache.

No change to `createCanonicalLot()` itself, `updateCanonicalLotFields()`'s existing fields, `public_id`, `green_lot_id`, Coffee, Green Lot, `status` semantics, Café gating, or any Passport lifecycle rule (draft-gating, persistence, history) — confirmed by reviewing the diff of every changed file.

## 8. Validation

**`npx tsc --noEmit`** — passed. No output, no errors.

**`npx vitest run`** — passed.
```
✓ lib/server/canonicalLot.test.ts (14 tests) 16ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```
`planVersionActivation` itself is unmodified and remains covered by its existing 3 tests (activating v1, v2 supersedes v1, a superseded history isn't re-superseded) — the exact logic `activateTasteProfile` now calls in production for the first time. No new test added for `activateTasteProfile` itself: it is a thin Supabase I/O sequence around already-tested pure logic, consistent with this project's established testing convention (pure logic tested, I/O wrappers not).

**`npm run build`** — passed.
```
✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Generating static pages (39/39)
   Finalizing page optimization ...
   Collecting build traces ...
```
`/dashboard/roaster/new` grew from 6.81 kB to 6.83 kB; `/dashboard/roaster/[lotId]/edit` grew from 8.96 kB to 8.98 kB. No route added or removed.

## 9. Regression

- **Creation wizard (all scenarios)** — `createCoffee`/`createGreenLot`/`createCanonicalLot` bodies unmodified; `activateTasteProfile` is a new, additional call after `createCanonicalLot` already succeeded, inside the same existing try/catch.
- **Reuse of one Green Lot by multiple Canonical Lots** — unaffected; `activateTasteProfile` is scoped by `lot_id` (the Lot's own uuid), never touches `green_lots` or `coffees`.
- **`public_id`/`green_lot_id`** — not referenced anywhere in the new code.
- **Status lifecycle / activation readiness guard (4.5.10)** — `CanonicalLotStatusControl.tsx` shows zero diff this iteration; taste-profile versioning is an independent state machine (its own `status` column on a different table), never read or written by the readiness guard.
- **Café gating, Public Passport draft-gating, tasting history** — all three files (`add-lot/page.tsx`, `passport/[lotId]/page.tsx`, `CanonicalLotChain.tsx`) show zero diff this iteration, confirmed via `git diff --stat`.
- No direct Supabase writes were performed outside the app's own new, reviewed function. No curl/REST inserts, no service-role key, no test data created.

## 10. Residual limitations / recommended next step

- **`roast_batches` has the identical unwired-write-path shape** (§5) — recommended as the next concrete candidate: build `createRoastBatch()` (a plain insert — this table is insert-only/immutable by trigger, so no version-supersede complexity at all, simpler than the fix just made) and wire it into `RoastProfileForm`'s existing `saveRoastProfile` call site.
- **Every save now creates a new taste-profile version, even when the roaster only changed unrelated fields** (e.g. the story text, with sliders untouched) — not incorrect, but will accumulate near-duplicate versions over time. A no-op guard (compare against the current active version's values before writing) would be a reasonable follow-up refinement, deliberately not added now to keep this fix to its minimal, evidenced scope.
- **Roaster profile completeness** (`philosophy`/`city` never guest-visible) — real but cosmetic, not pursued (§5).
- Carried forward, unchanged: `app/dashboard/roaster/new/page.tsx`'s wizard remains uncommitted in the working tree (last real commit is still `74fdbef`).

## Stopping point

The Public Coffee Passport block's first gap — the guest-facing "roaster's reference taste profile" defaulting to all-zeros for every Lot created since the Canonical Lot architecture shipped — is closed. `roast_batches`' identical, still-open gap (§10) is the clear recommended next step, along with the cosmetic roaster-profile completeness item if product priorities call for it.
