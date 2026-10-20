# Phase 4.5.12 — Canonical Lot Final Architecture Audit

## 1. Objective

Not a feature phase — a final consistency audit of the entire Canonical Lot block built across Phases 4.5.1–4.5.11. Central question: does any create/read/update/display/Café/Passport/QR/tasting-history flow still treat legacy `localStorage`/`lotsStore` as the source of truth where it should already be Supabase? Fix only real, evidenced gaps; leave everything else — including legitimate local cache/UI mechanisms and legacy remnants that need a separate design decision — alone.

## 2. Method

Grepped every reference to `useLots()`, `lotsStore`, `saveLot(`, `getLotById`, `localStorage` (via `lotsStore.ts`), `canonicalLotStore`, and any `updateLot`/`deleteLot`-shaped function across the whole repository (46 files matched at least one term; `saveLot(` itself has exactly 4 real call sites, checked individually below). Cross-referenced every write path against Supabase's RLS policies (`0025_canonical_lot_rls.sql`) to distinguish "not yet wired" from "structurally cannot be wired without a bigger decision."

## 3. Flow-by-flow map

| # | Flow | Current source of truth | Should be | Gap? |
|---|---|---|---|---|
| 1 | Roaster creation (`new/page.tsx`) | `createCoffee`/`createGreenLot`/`createCanonicalLot` write Supabase directly; `saveLot()` runs only *after* `createCanonicalLot` succeeds, as an ordered local-display cache | Supabase | **None.** Canonical write is authoritative and first; local write is a correctly-ordered cache, category B. |
| 2 | Roaster Dashboard list (`roaster/page.tsx`) | `useLots()` hybrid cache for display fields (name/country/region/qGrade/...); separate `listCanonicalLotsForRoaster()` fetch for the status badge | Supabase for gating-relevant fields, cache acceptable for pure display | **None new.** Already audited in Phase 4.5.11 (§3.5 of that report) — swapping the list source would drop fields/integrations (`CatalogHierarchy`, `LotGuestAnalytics`, etc.) not carried by `CanonicalLot`; a wholesale swap is explicitly out of this phase's scope too ("не делай migration всего legacy-кода"). Category B/C, not touched again. |
| 3 | Roaster detail (`CanonicalLotChain`) | Direct Supabase reads (`findCanonicalLotByPublicId` → `getGreenLotById` → `getCoffeeById`) | Supabase | **None.** Already fully canonical since Phase 4.5.3, re-confirmed unchanged. |
| 4 | Roaster edit (`[lotId]/edit/page.tsx`) | **Found the real gap** — see §4 | Supabase for every Canonical-Lot-own field the form collects | **Yes — fixed this phase.** |
| 5 | Café ordering (`add-lot/page.tsx`) | `useLots()` for display + `inRoasterCatalog`; separate `listAllCanonicalLotStatuses()` fetch for `status` gating | Supabase for both gating fields | **None new.** `inRoasterCatalog`'s write side was the Phase 4.5.11 gap, already fixed there; `status` was always read fresh from Supabase (never cached). Re-confirmed unchanged this phase. |
| 6 | Public Passport (`passport/[lotId]/page.tsx`) | `useLots()` overlaid with canonical Coffee (4.5.8) and canonical status (4.5.7), both fetched fresh per page load | Supabase for provenance/status, cache acceptable for the rest | **None new** — and the §4 fix directly benefits this flow: `name`/`qGrade`/`roastType`/`roastProfileLabel`/`descriptors` are already read canonically here via `rowToLot`'s Supabase mapping (`lib/data/lotsStore.ts`), so once editing them actually persists (§4), the Passport reflects roaster corrections without any change to this file. |
| 7 | QR flow (`downloadLotQrPdf`, `handleCopyLink`) | Encodes `${origin}/passport/${lot.id}` — `public_id`, immutable | `public_id` | **None.** Structurally correct by construction — no gap possible since `public_id` cannot change. |
| 8 | Blind tasting (`passport/[lotId]/taste/page.tsx`) | Reads `useLots()` for display; writes to `journey` (guest-local, intentional) | `journey`/`checkins` remain local/Supabase-guest-scoped by design, `lot` fields read-only | **None.** `journey` is not Canonical Lot data — it's guest session state, correctly local. |
| 9 | Journey/checkins/history | Keyed by `lot.id` (`public_id`, immutable) | `public_id` | **None.** Re-confirmed structurally protected (Phase 4.5.7 finding still holds — no `.delete()` on `lots` anywhere, checked again). |
| 10 | Public lot lookup (`/scan`, manual code entry) | Exact-match against `useLots()` by `public_id` | `public_id` | **None.** |
| 11 | PDF/QR generation | Same as #7 | `public_id` | **None.** |
| 12 | Catalog visibility logic (Café gate, Dashboard tabs, Passport draft-gate) | `inRoasterCatalog` (now write-synced, 4.5.11) + `status` (always read fresh from Supabase, every gate) | Supabase | **None new.** |
| — | Café's own Lot edit (`cafe/[lotId]/edit/page.tsx`) | `saveLot()` only, **no** canonical sync at all | N/A — see §5 | **Found, not fixed — category C, explained in §5.** |

## 4. The real gap (Category A) — found and fixed

**`updateCanonicalLotFields()`'s mutable surface was narrower than what `LotBuilderForm` actually lets a roaster edit.** Since Phase 4.5.1, `MutableCanonicalLotFields` only covered `name`/`status`/`inRoasterCatalog`. But `LotBuilderForm` — reused unchanged by the roaster's edit page — has always let a roaster freely edit `qGrade`, `roastType`, `roastProfileLabel`(`roastProfile`), and `descriptors` too. All four are plain columns on `lots` itself (`q_grade`, `roast_type`, `roast_profile_label`, `descriptors` — confirmed against `LotRow`), **not** Coffee or Green Lot fields (cross-checked against Phase 4.5.9's own field-ownership table — none of these four appear there). Editing any of them on the edit screen looked like it saved (`saveLot()` succeeded, the page navigated away normally) but **silently never reached Supabase** — `[lotId]/edit/page.tsx`'s `handleSave` only ever sent `{ name, inRoasterCatalog }` to `updateCanonicalLotFields`.

Consequence, concretely: a roaster corrects a Q-Score after cupping (a completely ordinary, expected workflow) — their own browser's local cache shows the correction, but the canonical `lots.q_grade` row keeps the value from creation time forever. Every other reader — a different device, a guest's Public Passport, the Phase 4.5.10 activation-readiness guard re-checking `qGrade` on a later status change — keeps seeing the stale, uncorrected value. This is exactly the "Dashboard: localStorage → UI → Supabase, а другие части: Supabase → UI" divergence this phase was asked to check for, and it directly undermines Phase 4.5.10's own activation guard: a Lot blocked from `active` for `qGrade <= 0` would have stayed blocked **forever**, even after the roaster "fixed" it, because the fix never reached the row the guard actually checks.

**Fix**: widened `MutableCanonicalLotFields` and `updateCanonicalLotFields()`'s patch-building to also accept `qGrade`, `roastType`, `roastProfileLabel`, `descriptors`; updated `[lotId]/edit/page.tsx`'s `handleSave` to send all four alongside the existing two. Origin fields (`country`/`region`/`variety`/`process`/`cropYear`/`producer.*`/`story`) remain explicitly excluded — they belong to Coffee, not this Lot (per Phase 4.5.9's boundary), and this phase does not touch that. Versioned taste/roast reference-profile data (`roasterFlavorProfile`, backed by `reference_taste_profiles`, a separate versioned table with no write path built at all yet — `planVersionActivation` in `lib/server/canonicalLot.ts` is pure logic, never wired) remains explicitly excluded too — building that write path is a materially larger feature, not a field-list widening, and is flagged as a residual limitation (§8), not attempted.

## 5. Category C finding — flagged, not fixed

**`app/dashboard/cafe/[lotId]/edit/page.tsx`** reuses the full `LotBuilderForm` (minus only the catalog-flag toggle, via `canEditCatalogFlag={false}`) to let a **coffee shop** edit a **roaster's** Canonical Lot fields — `name`, origin fields, `qGrade`, `roastType`, `descriptors`, `roasterFlavorProfile`, `story` — and its `handleSave` calls only `saveLot()`, with zero canonical sync, the identical local-only pattern found and fixed for the roaster's own edit page in §4.

This was **not** fixed, for a structural reason discovered during the audit, not a scoping preference: `0025_canonical_lot_rls.sql`'s write policy for `lots` is `is_roaster_staff_for(roaster_id)` — a signed-in `cafe_admin` fails this check for a roaster's `lots` row. **Even if `updateCanonicalLotFields()` calls were added to this page, every save would fail with an RLS rejection.** Whatever this screen is for, it cannot become a canonical-Lot-writing flow by simply adding the same sync calls used elsewhere — that would just replace "silently local-only" with "visibly broken." Properly resolving this requires an actual product decision this audit has no basis to make unilaterally: should a café be able to edit a roaster's product data at all? If yes, through what mechanism (a café-scoped annotation/override layer, distinct from the roaster's own canonical fields, is one plausible shape — but that is a new entity, explicitly forbidden this phase)? This is squarely category C — flagged precisely, left alone, recommended as a candidate for its own future phase with real product input.

**Also noted, category C, dead code**: `lib/data/lots.ts` exports a `getLotById()` (seed-array-only lookup) with **zero import sites anywhere in the codebase** — confirmed by grep. Not a gap (nothing reads through it, so it cannot diverge from anything), just unused legacy code. Safe removal is a separate, trivial cleanup phase, not attempted here per the same "no wholesale legacy migration" instruction.

## 6. Final source-of-truth map (after this phase)

| Data | Source of truth | Local cache role |
|---|---|---|
| `Coffee` (country, region, farm, producer, variety, altitude, processing, harvestYear) | Supabase `coffees` | Never cached/written locally for editing; Passport overlay (4.5.8) prefers it, creation-time prefill (4.5.9) reads it |
| `Green Lot` | Supabase `green_lots` | Read-only display only (`CanonicalLotChain`) |
| `Canonical Lot` — `public_id`, `green_lot_id`, `roaster_id` | Supabase `lots` | Immutable; never written after creation |
| `Canonical Lot` — `name`, `status`, `inRoasterCatalog`, `qGrade`, `roastType`, `roastProfileLabel`, `descriptors` | **Supabase `lots`** (as of this phase, all seven) | `saveLot()` local override remains an ordered, subordinate display cache — always written *after* (creation) or *alongside, non-blocking-if-it-fails* (edit) the canonical write |
| `Canonical Lot` — `roasterFlavorProfile` | **Not yet fully wired** — mapped read-only from `reference_taste_profiles` (versioned) when synced; no write path exists anywhere | Local-only for now; flagged residual limitation, not this phase's to build |
| `Lot.producer.story` | No canonical equivalent — local-only by design | Local-only, permanently (no `coffees`/`lots` column carries it) |
| `journey` (guest tastings) | Guest-local (+ `checkins` in Supabase, keyed by immutable `public_id`) | Correctly local/guest-scoped — not Canonical Lot data |
| Café's own edit of a roaster's Lot (`cafe/[lotId]/edit`) | **Still local-only** — flagged, not fixed (§5), structurally cannot be trivially fixed |

## 7. Exact changed files

- `lib/data/canonicalLotStore.ts` — modified (`MutableCanonicalLotFields` and `updateCanonicalLotFields` widened; comment rewritten to state the new, evidenced scope and what remains permanently excluded and why)
- `app/dashboard/roaster/[lotId]/edit/page.tsx` — modified (`handleSave` now sends `qGrade`/`roastType`/`roastProfileLabel`/`descriptors` alongside the existing `name`/`inRoasterCatalog`; comment updated to match)

**Not touched this phase** (confirmed via `git diff --stat` showing byte-identical output to the end of Phase 4.5.11 for every other previously-touched file): `app/dashboard/roaster/page.tsx`, `app/dashboard/roaster/new/page.tsx`, `components/roaster/LotBuilderForm.tsx`, `app/(site)/passport/[lotId]/page.tsx`, `app/dashboard/cafe/add-lot/page.tsx`, `components/roaster/CanonicalLotChain.tsx`, `components/roaster/CanonicalLotStatusControl.tsx`, `app/dashboard/cafe/[lotId]/edit/page.tsx` (flagged, not modified), `lib/data/lots.ts` (flagged, not modified), any migration, Coffee/Green Lot schema, `public_id`/`green_lot_id` generation, Café gating rule, Public Passport lifecycle rule, `status` semantics.

## 8. Validation

**`npx tsc --noEmit`** — passed. No output, no errors.

**`npx vitest run`** — passed.
```
✓ lib/server/canonicalLot.test.ts (14 tests) 28ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```
No new test added — the change widens an existing patch-building function's field list using the same conditional-spread pattern it already had; no new branching logic was introduced, consistent with this project's established pure-logic-only testing convention.

**`npm run build`** — passed.
```
✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Generating static pages (39/39)
   Finalizing page optimization ...
   Collecting build traces ...
```
`/dashboard/roaster/[lotId]/edit` grew from 8.93 kB to 8.96 kB. No route added or removed.

## 9. Regression (all 16 required checks)

1. **Create Coffee** — `createCoffee()` unmodified.
2. **Create Green Lot** — `createGreenLot()` unmodified.
3. **Reuse Green Lot** — `listGreenLotsForCoffee`/wizard selection logic unmodified.
4. **Create multiple Canonical Lots from the same Green Lot** — `createCanonicalLot()` unmodified; `listCanonicalLotsForGreenLot` unmodified.
5. **Edit Canonical Lot** — `LotBuilderForm` itself unmodified (zero diff); only the *consumer* of its output (`handleSave`) sends more fields onward now.
6. **Change status** — `CanonicalLotStatusControl.tsx` unmodified this phase (re-verified: not in the changed-files list, and its own `updateCanonicalLotFields(canonicalLot.id, { status })` call already only ever sent `status`, still does).
7. **Change `in_roaster_catalog`** — Phase 4.5.11's fix in `roaster/page.tsx` unmodified this phase.
8. **Read Dashboard** — `roaster/page.tsx` unmodified this phase.
9. **Read detail** — `CanonicalLotChain.tsx` unmodified this phase.
10. **Café ordering** — `add-lot/page.tsx` unmodified this phase.
11. **Public Passport** — unmodified this phase; benefits from §4's fix without any change of its own.
12. **QR flow** — unaffected; nothing touched `public_id` or QR generation.
13. **New tasting** — draft-gate logic (`passport/[lotId]/page.tsx`) unmodified this phase.
14. **Existing tasting history** — unaffected; `journey`/`checkins` lookups untouched.
15. **`public_id` remains immutable** — `updateCanonicalLotFields`'s patch never includes `public_id` (not part of `MutableCanonicalLotFields`, confirmed by the `Pick<>` type listing); the widening added four fields, none of them `public_id`.
16. **`green_lot_id` remains immutable** — same reasoning; `green_lot_id` was never and is still not part of `MutableCanonicalLotFields`.

No direct Supabase writes were performed by this phase outside the app's own existing, now-widened `updateCanonicalLotFields()` — no curl/REST inserts, no service-role key, no test data created.

## 10. Residual limitations

- **`roasterFlavorProfile` (acidity/sweetness/body/bitterness) still has no write path to Supabase at all.** It's backed by a separate, versioned table (`reference_taste_profiles`) whose activation-planning logic (`planVersionActivation`) has existed as pure, tested logic since Phase 4.5.1 but was never wired to any data-access function or UI. Building that write path is a genuinely separate, larger feature (designing the version-supersede flow, not just a field list), correctly out of this audit phase's scope.
- **Origin fields (Coffee-level) edited on the Lot form still don't persist anywhere** beyond the local cache — unchanged, deliberately, per Phase 4.5.9's boundary (editing Coffee identity belongs to Coffee's own flow, not a side-channel through the Lot edit form).
- **The café's own Lot-edit screen remains fully local-only and architecturally can't be trivially fixed** (§5) — flagged as the most significant open finding of this audit, needing a real product/RLS-model decision, not a mechanical sync fix.
- **`lib/data/lots.ts`'s unused `getLotById()`** — dead code, harmless, not removed (no wholesale cleanup this phase).
- Carried forward, unchanged: `app/dashboard/roaster/new/page.tsx`'s Phase 4.5.2 wizard remains uncommitted in the working tree (last real commit is still `74fdbef`); this phase added no commits.

## 11. Recommendation

**Yes — the Canonical Lot architecture (Coffee → Green Lot → Canonical Lot, lifecycle, gating, Passport, Dashboard) is consistent enough to consider this block ready for the next major area of work.** Every one of the 12 required flows was traced end to end; the one genuine Category-A divergence found (§4) is now closed, and its fix directly strengthens two earlier phases' own guarantees (Phase 4.5.10's activation guard now actually unblocks after a real correction; Phase 4.5.8's Passport provenance overlay now has a correctly-synced upstream to read from). The two remaining findings (§5's café-edit RLS wall, §10's unbuilt taste-profile write path) are both real, precisely identified, and — critically — both require actual product/architecture decisions this audit has no standing to make unilaterally, exactly the kind of finding this phase's own instructions said to flag rather than force-fix.

## Stopping point

Phase 4.5.12 (Canonical Lot Final Architecture Audit) is complete. **Phase 4.5.13 has not been started.**
