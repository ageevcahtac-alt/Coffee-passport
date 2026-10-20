# Public Coffee Passport — Roast Intent vs. Fact

## 1. Current UX (before this pass)

Guest scrolls through the Passport and sees, in order: `ProducerRoasterCard` → `RoastProfileSummaryCard` → a page-level "Обжарка" label → `RoastingTab`. **Both** `RoastProfileSummaryCard` and `RoastingTab` are fed by the same source: `latestRoastProfile`, the newest entry from `useRoastProfiles()` (`lib/data/roastProfilesStore.ts`), which is synced read-only from `roast_batches` — an **actual, real roasting event**. `RoastProfileSummaryCard`'s own header comment already calls itself "a friendlier, marketing-style summary of the roaster's REFERENCE/target profile" — but its data has never actually been a declared target; it has always been "whatever the most recent real roast measured." The guest has no way to tell the two cards apart conceptually — both silently present "fact" data, one of them mislabeled (in its own source comment, not in guest-visible text) as "reference."

**Nothing on the Passport read `reference_roast_profiles` at all before this pass** — confirmed by the prior iteration's own audit (zero application reads existed).

## 2. Current data flow (before this pass)

| | Feeds | Source |
|---|---|---|
| `RoastProfileSummaryCard` | `profile: RoastProfile \| null` | `roast_batches`, newest by `created_at` |
| `RoastingTab` | `useRoastProfiles()`, all entries | `roast_batches`, all rows for the Lot |
| *(nothing)* | — | `reference_roast_profiles` — write path exists (prior iteration), no reader anywhere |

## 3. Reference Roast Profile — recap (unmodified this pass)

Versioned (`draft`/`active`/`superseded`), exactly one `active` row per Lot enforced by a DB partial unique index (`idx_ref_roast_profiles_one_active`). Columns: `machine_model`, `target_curve` (full point array `{timeSec, bt, et, ror}[]`), `agtron_target`, `notes`, `effective_from`. **No `charge_temp`/`drop_temp`/`first_crack_time_sec`/`total_time_sec`/`dtr_percent` columns exist on this table at all.**

## 4. Roast Batch — recap (unmodified this pass)

Immutable event log (DB trigger rejects UPDATE/DELETE). Carries the full actual-measurement set: `charge_temp`, `drop_temp`, `first_crack_time_sec`, `total_time_sec`, `dtr_percent`, `agtron_number`, `curve`, `machine_model`, `notes`, plus `batch_number`/`roasted_at` (never guest-facing, by the client type's own documented design) and a nullable `reference_roast_profile_id` FK.

## 5. Existing relation — the architectural question (Step 3)

Checked precisely, not assumed:

- **`roast_batches.reference_roast_profile_id`** is a real FK column into `reference_roast_profiles(id)` — the schema's own designed link for "this exact batch followed this exact declared version." **It is not populated by any write path built so far** (the prior two iterations' `createRoastBatch()` and `activateReferenceRoastProfile()` were called independently, in sequence, neither passing the other's resulting id). Populating it correctly (batch → the specific profile version active *at the moment of that roast*) would require reordering those two writes and threading the new profile row's id into the batch insert — a real, buildable connection, but **not needed for the scenario this pass addresses** (see below), and not built here to avoid touching the already-closed write-path work.
- **What this pass actually needs**: "what does the roaster currently intend" vs. "what most recently, actually happened" — both **unambiguously resolvable per Lot** without that FK at all: the active reference profile is unique per Lot by DB constraint (§3), and "most recent batch" is already exactly what `latestRoastProfile` already computes (§1, unchanged). Both queries are scoped by the same `lot_id` — that shared scope *is* the unambiguous connection this scenario requires. No new relationship was invented; the existing, already-enforced one-per-Lot uniqueness on each side was used directly.

**Conclusion**: the *simple* current-intent-vs-most-recent-fact pairing needed here is unambiguous today. The more precise *historical* pairing (which exact profile version a specific past batch followed) is a real, separate, larger feature — flagged in §12, not attempted.

## 6. Architectural decision made

Show "Задумано обжарщиком" (declared intent, from the active `reference_roast_profiles` row) as its own small card, positioned **before** the existing fact-based cards (`RoastProfileSummaryCard`, `RoastingTab`), which are left completely unmodified in their own data source and internal rendering. The distinction is made through:
1. A new, minimal, purpose-built component (`RoastIntentCard`) rather than rewriting `RoastProfileSummaryCard`.
2. Plain-language section labels only — no mention of "reference_roast_profiles," "database," "version," or "event" anywhere in guest-visible text (Step 6's requirement).

## 7. Curve rendering (Step 5)

Audited precisely before touching anything:

- **Stored format**: `reference_roast_profiles.target_curve` — `jsonb`, an array of `{timeSec, bt, et, ror}` points. Identical shape to `roast_batches.curve` and the client `RoastCurvePoint` type.
- **What `RoastProfileSummaryCard.TargetCurve` expects**: **not a curve array at all** — two plain numbers (`chargeTemp`, `dropTemp`), used to draw an illustrative two-point interpolated shape. This only makes sense for `roast_batches`-shaped data (which has those two columns); `reference_roast_profiles` doesn't.
- **What `RoastingTab`'s `RoastCurveChart` expects**: `points: RoastCurvePoint[]` — the *actual* point-array shape, already an exact match for `target_curve`.

**Decision**: reuse `RoastCurveChart` (already built for exactly this point shape, already live in `RoastingTab`), rather than silently repurposing `RoastProfileSummaryCard`'s incompatible two-number interpolation, and rather than building a second, parallel charting component from scratch.

`RoastCurveChart`'s `chargeTemp`/`dropTemp`/`firstCrackTimeSec`/`totalTimeSec` props were made **optional** (backward-compatible: `RoastingTab`'s existing call site still passes all four, unchanged, so its rendering is byte-identical — confirmed via `git diff`, zero lines touched in `RoastingTab.tsx`). When absent, the two endpoint dots and the DTR shaded region simply don't render — no value was invented or derived to fill columns that genuinely don't exist on `reference_roast_profiles`.

## 8. What the guest sees (Step 4/6)

New card, "Задумано обжарщиком," rendered only when the Lot has an active reference profile with *some* content (machine model, curve, target Agtron, or notes — an empty/never-set profile renders nothing, same not-fabricating-content convention as every other card on this page):

- The declared curve shape (via `RoastCurveChart`, BT/ET/RoR lines only — no endpoint dots, no DTR shading, since those are batch-specific facts this table doesn't record).
- Machine model.
- Target roast degree (Agtron), as plain text — deliberately not the fancier gauge visual `RoastProfileSummaryCard` uses internally for the *actual* Agtron reading, to avoid touching or duplicating that component's private sub-component.
- The roaster's notes for this declared profile.

Immediately below it, unchanged: `RoastProfileSummaryCard`, then a page-level label (see below) and `RoastingTab` — together now legible as "what actually happened."

**Text change, page-level only**: the label above `RoastingTab` changed from "Обжарка" to **"Как прошло на практике"** ("How it actually went") — a one-line change in `app/(site)/passport/[lotId]/page.tsx` itself, not inside `RoastProfileSummaryCard` or `RoastingTab`. This, paired with the new card's own "Задумано обжарщиком" header, gives the guest the plain-language before/after framing Step 6 asked for, without touching either protected component's internals.

## 9. Fields deliberately never shown

Same set the prior iteration already established, re-confirmed unchanged: `roasted_at`, `batch_number` (`roast_batches`), `created_by`, `effective_from` (both tables) — none of these are read by `getActiveReferenceRoastProfile()` at all (the `select` only requests `machine_model, target_curve, agtron_target, notes`), let alone rendered. No purchasing/production-internal data exists on either table to begin with.

## 10. Exact changed files

- `lib/data/canonicalLotStore.ts` — modified (new `getActiveReferenceRoastProfile` + `ActiveReferenceRoastProfile` type, additive only)
- `components/coffee/RoastCurveChart.tsx` — modified (four props made optional, backward-compatible; existing call site in `RoastingTab.tsx` unaffected)
- `components/coffee/RoastIntentCard.tsx` — new file
- `app/(site)/passport/[lotId]/page.tsx` — modified (new fetch alongside the existing chain lookup, two new render blocks, one relabeled `<p>` text)

**Not touched this pass** (confirmed via `git diff --stat` showing byte-identical output to before this pass): `components/coffee/RoastProfileSummaryCard.tsx`, `components/coffee/RoastingTab.tsx`, `app/dashboard/roaster/[lotId]/edit/page.tsx`, `app/dashboard/roaster/new/page.tsx`, `app/dashboard/roaster/page.tsx`, `app/dashboard/cafe/add-lot/page.tsx`, `components/roaster/LotBuilderForm.tsx`, `components/roaster/RoastProfileForm.tsx`, `lib/data/roastProfilesStore.ts`, any migration, RLS, `public_id`, `green_lot_id`, Coffee, Green Lot, Canonical Lot lifecycle, Café gating, tasting history, `reference_taste_profiles`, the `activateReferenceRoastProfile`/`createRoastBatch` write paths themselves.

## 11. Validation

**`npx tsc --noEmit`** — passed. No output, no errors.

**`npx vitest run`** — passed.
```
✓ lib/server/canonicalLot.test.ts (14 tests) 18ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```
No new test added — `getActiveReferenceRoastProfile` is an unbranched read (a single `select ... eq ... eq ... maybeSingle`), and `RoastIntentCard` is a presentational component; neither is a candidate for this project's pure-logic-only test file (`lib/server/canonicalLot.test.ts`'s own header comment).

**`npm run build`** — passed.
```
✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Generating static pages (39/39)
   Finalizing page optimization ...
   Collecting build traces ...
```
`/passport/[lotId]` grew from 11.1 kB to 11.4 kB. No route added or removed.

## 12. Regression

- **Canonical Lot creation/edit** — `new/page.tsx`, `[lotId]/edit/page.tsx`: zero diff this pass.
- **Reference Taste Profile** — `activateTasteProfile` unmodified, unaffected; not referenced by anything changed this pass.
- **Reference Roast Profile write-path** — `activateReferenceRoastProfile` unmodified this pass; only a new, separate *read* function was added alongside it.
- **`roast_batches`** — `createRoastBatch` unmodified; `RoastingTab`'s read of it is byte-identical (confirmed: its `RoastCurveChart` call site still passes all four props explicitly, so the optional-prop change has zero effect on its rendering).
- **Public Passport structure** — not-found screen, preview-mode gate, location-step gate, `draft` new-tasting gate, the `latestTasting`-found branch's overall structure: all unchanged; only two new conditionally-rendered blocks were inserted and one label's text was changed.
- **Tasting/history** — `journey`/`checkins` untouched; `TasteComparison` untouched.
- **QR** — untouched; no `public_id` involvement anywhere in this pass.
- **Existing Lots** — no backfill performed; a Lot with no active reference profile row renders no new card (`RoastIntentCard` returns nothing when `profile` is absent — the page's own `{roastIntent && ...}` guard), so nothing changes visually for any Lot that hasn't had a roast profile published under the new write path yet.

No direct Supabase writes were performed by this pass — only new, reviewed `select` queries. No curl/REST inserts, no service-role key, no test data created.

## 13. Next real product gap

**Precisely linking a specific `roast_batches` row to the specific `reference_roast_profiles` version it followed** (populating the already-existing `reference_roast_profile_id` FK, §5) — this would let the Passport eventually show not just "the current plan" vs. "the most recent result," but a true historical trace: "this batch, logged on such-and-such visit, followed the plan that was active at the time" (useful once a Lot has been re-roasted multiple times against an evolving declared approach). This requires reordering and threading the two existing write calls together (a real but well-scoped follow-up, not a redesign) and was correctly left out of this pass, which only needed the simpler, already-unambiguous current-vs-most-recent pairing.
