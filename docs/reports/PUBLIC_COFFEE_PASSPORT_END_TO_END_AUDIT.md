# Public Coffee Passport — End-to-End Product Audit

Scope: not a table-by-table audit (that ground is covered by
`ROAST_BATCH_PUBLIC_PASSPORT_AUDIT.md`, `REFERENCE_ROAST_PROFILE_IMPLEMENTATION.md`,
`PUBLIC_ROAST_INTENT_VS_FACT.md`, `ROAST_BATCH_REFERENCE_LINK.md`, and the
Phase 4.5.x series). This pass walks the product as a guest would actually
experience it, end to end, and asks one question at every step: does this
work as one coherent system, or does it quietly fall back to something
untrustworthy?

## 1. Full user journey

QR → Public Passport → identity → provenance → producer → roaster → roast
intent → roast fact → taste intent → Blind Tasting → Guest Tasting →
comparison → Personal History → re-opening the Passport later.

## 2. Step-by-step: current implementation, source of truth, failure modes

### 2.1 QR → landing

- **Current UX**: the physical/printed QR encodes `${origin}/passport/${lot.id}` directly (`lot.id` = `public_id`, immutable) — a phone's native camera goes straight to `/passport/[lotId]`, never through `/scan`. The in-app `/scan` page (camera or manual code entry) is a secondary entry point for guests already inside the app.
- **Data source**: `public_id`, generated server-side (`generatePublicLotId`, `createCanonicalLot`) against the full existing set, not a per-browser guess.
- **Source of truth**: Supabase `lots.public_id` — immutable, never reassigned.
- **Failure mode found (Category A, fixed)**: `/scan`'s `resolveAndNavigate` validated the scanned/typed code against `useLots()` (seed + localStorage only) — it never called `syncLotsFromSupabase()`. Every real Canonical Lot exists only in Supabase, not in the hardcoded seed demo lots, so a guest using the in-app scanner for a real Lot got a hard, non-recoverable "Лот с таким кодом не найден," never navigating anywhere. See §5.
- **Product value**: this is the literal front door — everything downstream depends on it resolving correctly.

### 2.2 Public Passport lands — "What is this coffee?" (IDENTITY)

- **Current UX**: page resolves `params.lotId` against `useLots()`, shows `lot.name` immediately.
- **Data source**: `useLots()` = seed + localStorage override + `syncLotsFromSupabase()` canonical overlay (async, fired on mount).
- **Source of truth**: Supabase `lots` (name, `q_grade`, `roast_type`, `roast_profile_label`, `descriptors` — all canonically write-synced as of Phase 4.5.12).
- **Failure mode found (Category A, fixed)**: the not-found decision only waited for client hydration (`mounted`), not for `syncLotsFromSupabase()` to actually resolve. For any Lot not in the hardcoded seed array (i.e. every real production Lot), the very first render showed "Лот не найден" — a false negative — before self-correcting a moment later once the fetch resolved. This is the exact first screen of the exact journey this audit was asked to check, breaking on the exact Lots the whole Canonical Lot block exists to serve. See §5.
- **Product value**: guest must trust, on the very first screen, that this is a real, specific product — not a broken link.

### 2.3 "Откуда кофе? Кто производитель?" (PROVENANCE)

- **Current UX**: `LotPassport`, `ProducerRoasterCard`, `FarmerRevealCard` render country/region/process/cropYear/producer.
- **Data source**: `withCanonicalCoffeeOverlay(lot, canonicalCoffee)` → `displayLot` — prefers the canonical `coffees` row (fetched via `findCanonicalLotByPublicId` → `getGreenLotById` → `getCoffeeById`), falling back to the local `Lot`'s own value only where Coffee has nothing recorded.
- **Source of truth**: Supabase `coffees`, correctly overlaid — confirmed by direct read of `withCanonicalCoffeeOverlay` and its three call sites (`LotPassport`, `ProducerRoasterCard`, `FarmerRevealCard` all receive `displayLot`).
- **Failure mode found (Category A, fixed)**: `BlindTastingLock` — the screen shown to a guest who has NOT yet tasted, i.e. their very first substantive look at the coffee's origin, before `ProducerRoasterCard`/`FarmerRevealCard` are even reachable — was passed raw `lot`, not `displayLot`. Its own "Базовые данные" card (country/region, farm, process, crop year) read the un-overlaid local fields. A guest could see one set of origin data before their blind tasting and a *different* (canonically-corrected) set after — the exact "did this come from canonical Coffee or did it accidentally come from localStorage" question this audit was told to check for, concretely confirmed. See §5.
- **Product value**: provenance is the product's core trust claim; it must be identical before and after tasting, always canonical.

### 2.4 "Кто обжарщик?"

- **Current UX**: `roaster = getRoasterById(lot.roasterId)`.
- **Data source/source of truth**: `lot.roasterId` is the roaster's `slug` (`rowToLot`: `row.roasters?.slug ?? fallback?.roasterId`), stable and canonical once synced.
- **Failure mode**: none found. `getRoasterById` lookup is a simple, unconditional keyed lookup; roaster identity never depends on tasting state or lifecycle status.
- **Product value**: attribution/accountability for the declared profile and the actual roast.

### 2.5 "Что обжарщик задумал?" (Roast Intent)

- **Current UX**: `RoastIntentCard`, rendered only when a declared profile has content.
- **Data source**: as of `ROAST_BATCH_REFERENCE_LINK.md` (this block's immediately preceding pass): prefers the exact `reference_roast_profiles` version the latest actual `roast_batches` row recorded following (via the now-populated `reference_roast_profile_id` FK); falls back to "whatever is `active` now" for batches that predate that link.
- **Source of truth**: Supabase `reference_roast_profiles`.
- **Failure mode**: none found this pass — already closed by the immediately preceding gap.
- **Product value**: the roaster's stated intent, shown before the guest's own blind judgement, framed as "Задумано" rather than fact.

### 2.6 "Как кофе был обжарен на практике?" (Roast Fact)

- **Current UX**: `RoastProfileSummaryCard` + `RoastingTab`, fed by `latestRoastProfile` (newest `roast_batches` row for this Lot).
- **Data source/source of truth**: Supabase `roast_batches`, immutable, insert-only, real write path (`ROAST_BATCH_PUBLIC_PASSPORT_AUDIT.md`).
- **Failure mode**: none found. These two components deliberately read raw `lot`/batch data, not `displayLot` — correct, since neither renders any Coffee-overlay field (machine/curve/temps/Agtron/notes are all `roast_batches`-owned, already canonical).
- **Product value**: the actual, unfalsifiable event log — what really happened at the roaster, immune to later editing.

### 2.7 "Какой вкус ожидался?" (Taste Intent)

- **Current UX**: `lot.roasterFlavorProfile`, read by `ProducerRoasterCard` and (post-reveal) `TasteComparison`.
- **Data source**: `rowToLot`'s `activeTaste` (the `active`-status row from `reference_taste_profiles`), synced by `syncLotsFromSupabase()`.
- **Source of truth**: Supabase `reference_taste_profiles`, versioned, one active per Lot (DB partial unique index) — write path (`activateTasteProfile`) closed and live, called from the same roaster edit-page save action as everything else.
- **Failure mode considered, not found to be product-breaking**: `reference_taste_profiles` has no per-guest-tasting historical link the way `roast_batches` now does (§2.5's fix has no taste-side analogue) — a guest is always compared against "whatever taste profile is active now," never "the exact version active when they tasted." Flagged as Category C (§7.3) — a real asymmetry, but not evidenced as harmful: unlike a roast recipe, a roaster rarely re-declares taste intent for an already-shipped Lot, and there is no `reference_taste_profile_id` column on `checkins` to link to even if this were wired up (a schema change, out of this pass's "no new architecture" constraint).
- **Product value**: this is the entire premise of the product — "does what I tasted match what was promised."

### 2.8 Blind Tasting

- **Current UX**: `BlindTastingLock` (spoiler-free basic facts + lock message) → `/passport/[lotId]/taste` (location → drink → blind taste form → barista/brew details) → `FarmerPinningModal` reward moment → back to Passport, now unlocked.
- **What's hidden pre-reveal**: descriptors/flavor diagram/roaster's detailed read (per `BlindTastingLock`'s own comment) — the blind taste form itself (`TastingForm`) collects the guest's judgement before any roaster reference values are shown on this screen, preserving the blind read.
- **What's saved**: `addTastingRecord()` — local-first (always succeeds, instant), then a best-effort Supabase `checkins` insert.
- **On reload**: `latestTasting` is recomputed from `journey` (local cache, or synced from Supabase for a signed-in guest) filtered by `(lot.id, coffeeShopId, userId)` — the saved comparison reappears unconditionally.
- **On revisit**: same computation, same result — `journey` persists in `localStorage` regardless of navigation.
- **Failure mode**: none found beyond §2.3's provenance leak (now fixed) and §2.7's confirmed intent behavior.
- **Product value**: the core mechanic — an honest, unbiased first impression, captured before any priming.

### 2.9 Result / comparison → Personal History

- **Current UX**: `TasteComparison` (guest vs. roaster flavor radar + Q-Score + descriptor diff table) on the Passport itself; `/journey` for the guest's full cross-Lot history.
- **Data source/source of truth**: `journey` (`lib/journey/store.ts`) — writes instantly to `localStorage`, best-effort mirrors to Supabase `checkins` (`owner_user_id uuid references auth.users(id)`) **only for a signed-in guest** — an anonymous per-browser id cannot satisfy that FK, so the Supabase write is rejected and silently kept local-only (caught, logged, non-fatal).
- **Failure mode considered, not found to be a bug**: an anonymous guest's history is device-local only — clearing browser storage or switching devices loses it permanently, by explicit design (`store.ts`'s own header comment). This is a real product limitation, not a defect — flagged Category B (§7.1).
- **Immutability check**: `checkins.lot_id` is `text`, **no FK** to `lots` — confirmed structurally impossible for a Lot's lifecycle change (or, hypothetically, deletion — never actually done anywhere in the codebase) to cascade-delete or orphan-break a guest's saved tasting.
- **Lifecycle check**: `latestTasting`'s own lookup and the final comparison render branch have **zero dependency on `canonicalStatus`** — confirmed by direct code read; an already-saved tasting renders identically regardless of the Lot's current `draft`/`testing`/`active`/`archived` status. Only the *new*-tasting gate (`BlindTastingLock` vs. the "обжарщик ещё готовит паспорт" message) checks `status`, and only for `draft`.
- **Product value**: the guest's own coffee journey, the thing that turns a one-off scan into a repeat-engagement habit.

## 3. Source-of-truth map (as of this pass)

| Data | Source of truth | Notes |
|---|---|---|
| `Coffee` (country, region, farm, producer, variety, altitude, processing, harvestYear) | Supabase `coffees` | Correctly overlaid via `displayLot` everywhere it's rendered, including — as of this pass — `BlindTastingLock` |
| `Canonical Lot` (name, status, catalog flag, qGrade, roastType, roastProfileLabel, descriptors) | Supabase `lots` | Write-synced since Phase 4.5.4/4.5.12 |
| `Reference Roast Profile` | Supabase `reference_roast_profiles` | Versioned, write path closed |
| `Roast Batch` | Supabase `roast_batches` | Immutable, insert-only, now FK-linked to the exact profile version it followed |
| `Reference Taste Profile` | Supabase `reference_taste_profiles` | Versioned, write path closed; no per-tasting historical link (§2.7) |
| `public_id` / `green_lot_id` | Supabase `lots` | Immutable by construction, never in any mutable-fields list |
| Guest tasting (`journey`/`checkins`) | Local-first; Supabase-backed only for signed-in guests | Correctly guest-scoped, not Canonical Lot data |
| Café's own edit of a roaster's Lot (`cafe/[lotId]/edit`) | **Still local-only** (pre-existing, `PHASE_4.5.12_REPORT.md` §5) | Structural RLS wall (café staff isn't roaster staff for that Lot) — re-confirmed unchanged, still Category C, not touched |

**Local-override interaction, checked precisely**: `syncLotsFromSupabase()` lets a `localStorage` override win outright over a fresh canonical row for that same Lot id, permanently, in whichever browser holds that override. Traced every writer of that override cache: the roaster's own edit/create flows always pair the local write with the same-data Supabase write in the same action (self-consistent, no divergence); the café edit page is local-only (already flagged, above). For a genuinely new guest device — the journey this audit is centered on — there is no pre-existing override at all, so the canonical Supabase row governs fully. No new gap found here beyond the already-flagged café case.

## 4. Public/private boundary audit

Checked every guest-facing component under `components/coffee/` for the specific internal fields named in the task, by direct grep — zero matches for `purchased_kg`, `purchaseDate`/`purchase_date`, `contractReference`/`contract_reference`, `created_by`, `batch_number`/`batchNumber`, `roasted_at`, `green_kg`. Cross-checked against the already-closed audits for `roast_batches`/`reference_roast_profiles` (both confirmed: `notes` is deliberately shown, by product design; `roasted_at`/`batch_number`/`created_by`/`effective_from` are deliberately never rendered — re-confirmed unchanged this pass). `green_lots`' own operational fields (`purchased_kg`, `purchase_date`, `contract_reference`) are fetched on the Passport page only to resolve `coffeeId` — the `greenLot` object itself is never rendered, only `.coffeeId` is read from it.

**Conclusion: no public/private boundary violation found.**

## 5. Category A — found and fixed

All three are minimal, single-purpose, evidenced fixes to the exact journey steps audited — no redesign, no new components, no new architecture.

1. **`/scan` never synced the canonical catalog** (§2.1) — `app/(site)/scan/page.tsx`: added the same `syncLotsFromSupabase()` on-mount call already used at three other `useLots()` consumer sites (`roaster/page.tsx`, `cafe/add-lot/page.tsx`, `passport/[lotId]/page.tsx`).
2. **False "not found" flash on first load of any real Lot** (§2.2) — `app/(site)/passport/[lotId]/page.tsx`: added a `lotsSynced` state, set once `syncLotsFromSupabase()` settles (it never throws or hangs — internal try/catch, always resolves); the not-found branch now waits on it the same way it already waits on `mounted`.
3. **`BlindTastingLock` read raw `lot` instead of the canonically-overlaid `displayLot`** (§2.3) — one-line prop swap at its single call site in `app/(site)/passport/[lotId]/page.tsx`.

## 6. Category B — real improvement, not implemented now

1. **Anonymous guest history is device-local only** (§2.9) — by explicit design, not a defect, but worth eventually nudging a guest toward signing in specifically to preserve their coffee journey across devices. No change made.
2. **Taste Intent has no per-tasting historical link**, unlike the roast side (§2.7) — the asymmetry is real but unevidenced as currently harmful (roasters rarely re-declare intent mid-Lot-life the way they re-roast), and would need a new `checkins` column to fix properly. No change made.
3. **Café's own Lot-edit screen is still local-only**, structurally blocked by RLS (already found and correctly deferred in `PHASE_4.5.12_REPORT.md` §5) — re-confirmed unchanged this pass, still needs a real product decision (café-scoped overlay vs. some other mechanism) this audit has no standing to make. No change made.

## 7. Category C — future major block, not implemented

1. A guest-facing "roast history" view now that batches carry their exact followed profile version (flagged already in `ROAST_BATCH_REFERENCE_LINK.md` §10) — genuinely new UX, out of scope here.
2. A café-scoped annotation/override layer for Lot data, if the product ever wants cafés to correct/adapt a roaster's Lot presentation without RLS conflicts (§6.3) — a new entity, explicitly out of this pass's bounds.
3. Cross-device guest identity (real accounts, not anonymous per-browser ids) as the default rather than an opt-in improvement (§6.1) — an auth/product decision, not a mechanical fix.

## 8. What was fixed

See §5 — three files touched:

- `app/(site)/scan/page.tsx`
- `app/(site)/passport/[lotId]/page.tsx`

No migration, RLS, component redesign, or new file was created. No visual/layout change — `BlindTastingLock`'s markup, `RoastIntentCard`, `TasteComparison`, and every other guest-facing card are byte-identical; only which data feeds one existing prop, and how long two pages wait before declaring "not found," changed.

## 9. What was consciously NOT fixed

- The café Lot-edit local-only gap (§3, §6.3) — pre-existing, already correctly flagged as needing a real product decision, not re-litigated.
- The Taste Intent historical-link asymmetry (§2.7, §6.2) — unevidenced as harmful, would require a schema change.
- Anonymous guest history being device-local (§2.9, §6.1) — explicit existing design, not a defect.

## 10. Validation

**`npx tsc --noEmit`** — passed, no output.

**`npx vitest run`**
```
✓ lib/server/canonicalLot.test.ts (14 tests)
Test Files  1 passed (1)
     Tests  14 passed (14)
```
No new test added — all three fixes are either a one-line data-source swap (`BlindTastingLock`'s prop) or a state-gated render-timing fix (`lotsSynced`) with no new branching logic; none touch `planVersionActivation` or any other pure-logic function this project's test file covers.

**`npm run build`** — passed.
```
✓ Compiled successfully
 ✓ Generating static pages (39/39)
```
`/passport/[lotId]`: 11.4 kB → 11.5 kB. `/scan`: 6.17 kB → 6.18 kB. No route added or removed.

## 11. Regression

- **Canonical Lot creation/edit** — `new/page.tsx`, `[lotId]/edit/page.tsx`: zero diff this pass.
- **Coffee / Green Lot** — `createCoffee`/`createGreenLot`/`getCoffeeById`/`getGreenLotById`: zero diff.
- **Reference Roast Profile / Roast Batch** — write paths and the newly-closed FK link (`ROAST_BATCH_REFERENCE_LINK.md`) untouched this pass.
- **Reference Taste Profile** — `activateTasteProfile`/`rowToLot`'s `activeTaste` mapping: zero diff.
- **Public Passport** — the two edits are additive/corrective only: `lotsSynced` adds one more condition (ANDed) to an existing early-return gate, never removes the `mounted` check; `displayLot` was already computed and already used by every sibling card — `BlindTastingLock` is the only call site that changed.
- **Blind Tasting / Guest Tasting** — `/passport/[lotId]/taste`, `TastingForm`, `addTastingRecord`: zero diff.
- **History** — `journey`/`checkins` reads/writes: zero diff; re-confirmed structurally immune to Lot lifecycle changes (§2.9).
- **QR** — `downloadLotQrPdf`/`handleCopyLink`: zero diff; both still encode `public_id` directly, unaffected by the `/scan` fix (a separate, secondary entry point).
- **Existing Lots** — seed demo Lots are unaffected by either fix (`lot` already resolves on first render for them, so the added gating conditions never engage); Lots created since Canonical Lot shipped now resolve correctly on first load instead of flashing "not found."
- **Lifecycle statuses** — `canonicalStatus === 'draft'` gate: unchanged, still the only status-conditioned branch, still only gates *new* tastings.

## 12. Core Journey status

**PUBLIC COFFEE PASSPORT — CORE JOURNEY COMPLETE**, with three real first-load/provenance defects found and fixed this pass.

**What already works, confirmed by direct trace, not assumption**:
- Identity (Coffee/Lot/Roaster) is unambiguous once the canonical sync completes (now correctly awaited).
- Provenance is canonical everywhere it's rendered, including pre-reveal (now fixed).
- Roast Intent vs. Roast Fact are distinct, correctly sourced, and — per the immediately preceding pass — historically exact where the data exists.
- Taste Intent flows correctly from the versioned reference table into the guest comparison.
- Blind Tasting genuinely hides taste-relevant content until the guest commits their own read.
- History survives reload, revisit, and any Lot lifecycle status change — structurally, not just by convention (`checkins.lot_id` carries no FK to cascade).
- QR encodes the immutable `public_id` directly; draft Lots can still be QR'd/previewed by their own roaster without affecting guest gating rules.
- No internal/operational field leaks onto any guest-facing surface.

**What remains, deliberately not built now**: §6/§7 above.

## 13. Next major product block

Two real, evidenced candidates, neither attempted here:

1. **Café-scoped Lot data ownership** (§6.3/§7.2) — the one structurally-blocked gap in the whole traced system, needing an actual product decision (should a café be able to annotate/adapt a roaster's Lot at all, and through what mechanism) before any code can close it correctly.
2. **A guest-facing roast/taste history view** (§7.1) — now that `roast_batches` carries its exact followed profile version, and taste has none, a coherent "history" feature would need to decide whether/how to close that same gap for taste before presenting itself as a complete history, not just a roast-side one.

Recommendation: (1) is the smaller, more load-bearing fix (an already-known structural wall); (2) is the larger, more product-facing feature. Both require real decisions this audit is not positioned to make unilaterally.
