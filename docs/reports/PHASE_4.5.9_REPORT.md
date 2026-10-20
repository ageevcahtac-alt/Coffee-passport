# Phase 4.5.9 — Coffee Data into Canonical Lot Creation

## 1. Objective

Phase 4.5.8 found the root cause of Coffee/Canonical-Lot origin data divergence: the creation wizard's `LotBuilderForm` never receives the Coffee the roaster already picked or created. This phase fixes that root cause — prefilling the Origin step from the real Coffee row — without turning Coffee into a read-only source for all Lot fields, without a new entity, and without breaking Green-Lot reuse or per-Lot independence.

## 2. Audit (before any change)

### 2.1 `LotBuilderForm.tsx`

- `toFormState(lot?: Lot)`: with no `lot`, every field starts `''`/default (confirmed by full read). With a `lot`, every field is read from it.
- `initialLot?: Lot` is the *only* existing prefill mechanism, and it does far more than seed field values: `isCreating = !initialLot` also controls whether the 4-step wizard UI renders (vs. a single-screen edit form), whether Origin-step fields are `required`, the submit button's label, and — critically — `lotId` computation: `initialLot ? initialLot.id : generateLotId(roaster, form.country)`. **Passing a synthetic/partial `Lot` as `initialLot` would have broken `isCreating` and reused a fake `id` instead of generating a real one** — this rules out reusing `initialLot` directly for this purpose, confirming the task's own suspicion needed to be checked (and was) before assuming the existing mechanism "just works."
- Exactly 3 call sites exist: `app/dashboard/roaster/[lotId]/edit/page.tsx` and `app/dashboard/cafe/[lotId]/edit/page.tsx` (both always pass a real `initialLot`), and `app/dashboard/roaster/new/page.tsx` (the only creation call site, previously passing neither `initialLot` nor anything else).

### 2.2 `app/dashboard/roaster/new/page.tsx`

The wizard resolves/creates `coffee: CanonicalCoffee` and `greenLot: CanonicalGreenLot` in the `coffee`/`greenLot` stages, then renders `<LotBuilderForm roaster={roaster} onSave={handleLotSave} onCancel={...} />` with no reference to either. `coffee` is always the real, round-tripped Supabase row — `selectCoffee` sets it from `listCoffeesForRoaster`'s result, `submitNewCoffee` sets it from `createCoffee`'s own return value (`setCoffee(created)`) — never a locally-fabricated guess, in either the "existing Coffee" or "new Coffee" path.

### 2.3 `createCanonicalLot()`

Confirmed unmodified need: its `CreateCanonicalLotInput` only takes `country` (a plain string, used solely for `generatePublicLotId`'s country-code segment) plus Lot-own fields (`name`, `descriptors`, `qGrade`, `roastType`, `roastProfileLabel`, `status`, `inRoasterCatalog`, `greenLotId`). It never reads or writes `coffees` at all — confirmed by re-reading the full function body. No change needed or made here.

### 2.4 Canonical `coffees` structure vs. local `Lot` structure — the exact field overlap

| `CanonicalCoffee` field | Local `LotFormState` field | Same concept? |
|---|---|---|
| `country` | `country` | Yes |
| `region` | `region` | Yes |
| `variety` | `variety` | Yes |
| `processing` | `process` | Yes |
| `harvestYear` | `cropYear` | Yes (both hold e.g. `"2025/2026"` — `CoffeeRow.harvest_year`'s own doc comment already says "matches Lot.cropYear convention") |
| `producer` | `farmerName` | Yes (`ProducerProfile.farmerName`'s own type comment: "farmer or cooperative name" — matches `Coffee.producer`'s intent) |
| `farm` | `farmName` | Yes |
| `altitude` | `altitude` | Yes |
| — (no equivalent) | `story` | No — `story` is the roaster's own narrative text about *this release*; Coffee has no such field |

This is exactly the task's own "COFFEE-LEVEL DATA" list — confirmed field-for-field against the actual schema, not assumed.

### 2.5 Fields that remain Canonical-Lot-only (confirmed, unchanged)

`qGrade` (`q_grade` lives on `lots`, not `coffees` — a Q-grading is a property of this specific batch/release, not the coffee's identity), `roastType`, `roastProfileLabel`, `descriptors`, `roasterFlavorProfile` (`acidity`/`sweetness`/`body`/`bitterness` — this roaster's own sensory read on this release), `status`, `inRoasterCatalog`, `name`. None of these have a Coffee-side counterpart at all — confirmed by re-reading `CanonicalCoffee`'s full field list. **None of them are touched by this phase's change.**

### 2.6 How the form currently submits

`handleSubmit` in `LotBuilderForm` builds one `Lot` object from `form` state and calls `onSave(lot)` — `new/page.tsx`'s `handleLotSave` then calls `createCanonicalLot({ ...lot fields... })` (never Coffee fields) and `saveLot({ ...lot, id: canonicalLot.publicId })` (the local override cache, keyed by this Lot's own `public_id`). Confirmed: no code path from this submit ever writes back to `coffees` or to another Lot's local override.

## 3. Field-ownership boundary adopted

**COFFEE-LEVEL** (prefilled from the selected/created Coffee, remaining freely editable): `country`, `region`, `variety`, `process`/`processing`, `cropYear`/`harvestYear`, `farmerName`/`producer`, `farmName`/`farm`, `altitude`.

**CANONICAL-LOT-LEVEL** (never touched by Coffee, unchanged): `name`, `qGrade`, `roastType`, `roastProfileLabel`, `descriptors`, `roasterFlavorProfile` (acidity/sweetness/body/bitterness), `status`, `inRoasterCatalog`, `story` (no Coffee equivalent exists).

This matches the task's own boundary exactly, verified against the real schema rather than assumed.

## 4. What was implemented

**`components/roaster/LotBuilderForm.tsx`**:
- New exported type `LotOriginDefaults` — an all-optional `Pick`-like shape covering exactly the 8 Coffee-level fields from §3.
- `toFormState(lot?, originDefaults?)` — the `!lot` (blank/creating) branch now seeds each Coffee-level field from `originDefaults?.<field> ?? ''` instead of a hardcoded `''`. The `lot` (editing) branch is **completely unchanged** — `originDefaults` is never consulted once a real `initialLot` exists.
- `LotBuilderForm`'s props gained one new optional prop, `initialOrigin?: LotOriginDefaults`, threaded into the single `useState(() => toFormState(initialLot, initialOrigin))` initializer. Omitting it (as both edit-page call sites still do) reproduces the exact prior behavior.

**`app/dashboard/roaster/new/page.tsx`**:
- New page-local helper `buildOriginDefaults(coffee: CanonicalCoffee): LotOriginDefaults`, a pure 8-field mapping matching §3's table exactly.
- The `lotDetails` stage's `<LotBuilderForm>` call now also passes `initialOrigin={buildOriginDefaults(coffee)}` — `coffee` here is the same wizard state already used one paragraph above for the "Кофе: …" summary line, always the real selected/created row (§2.2).

No change to `createCanonicalLot()`, `generatePublicLotId`, `public_id`, `green_lot_id`, or any migration.

## 5. Why this does not create a new desynchronization

- **This only changes the *starting* value of a `useState` initializer, computed once at mount.** Every Origin-step input remains a normal, editable `<input>` — the roaster can still type over any prefilled value before submitting (per the task's own "не запрещай изменение поля без доказанной необходимости," re-confirmed by reading the actual JSX: no `disabled`/`readOnly` was added to any field).
- **No write path exists from this prefill back to `coffees`.** `createCanonicalLot()` still only ever receives `country` as a plain string (for `public_id` generation) — it does not persist any Origin-step field to the `coffees` table, unmodified from before this phase (confirmed by full re-read, §2.3). Editing a prefilled field before submit therefore can never mutate the real Coffee row.
- **No write path exists between two different Lots' local overrides.** `saveLot()` keys by this Lot's own `public_id`; `LotBuilderForm`'s `form` state is local component state, torn down and freshly re-initialized every time the wizard re-enters the `lotDetails` stage (React unmounts the whole conditional block when `stage !== 'lotDetails'`, so there is no stale/shared instance across two different Lot-creation attempts, even for the same Coffee). Concretely: **Coffee A → Canonical Lot 1** and **Coffee A → Canonical Lot 2** each get their own, independent `LotBuilderForm` mount, each independently seeded from the *same* `coffee` object at the moment each is created — editing Lot 2's prefilled origin text (a "roast-specific" divergence, e.g. correcting a typo the roaster notices only on this release) changes only Lot 2's own local override and its own `createCanonicalLot()` call; it cannot reach Coffee A's row or Lot 1's already-saved override, both of which live in entirely separate storage (a distinct localStorage key, a distinct already-committed Supabase row).
- **Public Passport provenance (Phase 4.5.8) is unaffected and still the actual safety net.** Even if a roaster's post-prefill edits still manage to diverge Lot 2's local text from Coffee A, the guest-facing Passport already prefers the real `coffees` row over the local Lot object (`withCanonicalCoffeeOverlay`, unmodified this phase) — so this phase closes the *common case* (a roaster who accepts the sensible defaults no longer has to retype them, and no longer accidentally diverges by omission), while 4.5.8's overlay remains the correctness guarantee for the rarer case where a roaster deliberately types something different.

## 6. Exact changed files

- `components/roaster/LotBuilderForm.tsx` — modified (+46 lines net: new type, new optional param/prop, blank-branch defaults changed from `''` to `originDefaults?.x ?? ''`)
- `app/dashboard/roaster/new/page.tsx` — modified (+33 lines net relative to the end of Phase 4.5.8: new helper function, one new prop at one call site)

**Not touched this phase** (confirmed via `git diff --stat` showing byte-identical output to the end of Phase 4.5.8): `lib/data/canonicalLotStore.ts` (zero removed lines across all of Phases 4.5.3–4.5.9 combined — confirmed again), `app/(site)/passport/[lotId]/page.tsx`, `app/dashboard/cafe/add-lot/page.tsx`, `app/dashboard/roaster/page.tsx`, `app/dashboard/roaster/[lotId]/edit/page.tsx`, `app/dashboard/cafe/[lotId]/edit/page.tsx` (zero diff — confirmed by its absence from the diff-stat output entirely), `components/roaster/CanonicalLotChain.tsx`, `components/roaster/CanonicalLotStatusControl.tsx`, any migration, Coffee/Green Lot schema.

## 7. Validation

**`npx tsc --noEmit`** — passed. No output, no errors.

**`npx vitest run`** — passed.
```
✓ lib/server/canonicalLot.test.ts (14 tests) 19ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```
No new test added — `buildOriginDefaults` is an 8-field pure mapping with no branching, and `toFormState`'s change is a `?? ''` default substitution with no new logic paths; both are covered in spirit by this project's existing convention of unit-testing only genuinely branchy domain logic (`lib/server/canonicalLot.test.ts`'s own header comment).

**`npm run build`** — passed.
```
✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Generating static pages (39/39)
   Finalizing page optimization ...
   Collecting build traces ...
```
`/dashboard/roaster/new` grew from 6.75 kB to 6.81 kB. No route added or removed.

## 8. Regression (all 12 required checks)

1. **Existing Coffee → Existing Green Lot → Canonical Lot** — unaffected: `selectCoffee`/`selectGreenLot`/`handleLotSave` logic untouched; the only addition is `initialOrigin` on the already-existing `LotBuilderForm` call.
2. **Existing Coffee → New Green Lot → Canonical Lot** — unaffected, same reasoning (Green Lot creation path untouched, `coffee` state — the input to `buildOriginDefaults` — is identical regardless of which Green-Lot path was taken).
3. **New Coffee → New Green Lot → Canonical Lot** — unaffected; `submitNewCoffee`'s `setCoffee(created)` still feeds the same `coffee` state `buildOriginDefaults` reads from, using the real `createCoffee()` return value.
4. **One Green Lot → two Canonical Lots** — unaffected: nothing in this phase touches `green_lot_id` selection/reuse logic; both Lots still independently call `createCanonicalLot` with whatever `greenLot.id` was already resolved.
5. **Editing a Canonical Lot never changes Coffee** — confirmed structurally (§5): `createCanonicalLot()` unmodified, no write path to `coffees` exists anywhere in this phase's new code.
6. **Editing a Canonical Lot never changes another Canonical Lot** — confirmed structurally (§5): separate component mounts, separate `public_id`-keyed local overrides, separate Supabase rows.
7. **`public_id`** — `generatePublicLotId` untouched; its 14 covering tests still pass.
8. **`green_lot_id`** — not referenced anywhere in this phase's new code (`buildOriginDefaults` only reads `CanonicalCoffee` fields).
9. **Public Passport provenance (Phase 4.5.8)** — `app/(site)/passport/[lotId]/page.tsx` shows zero diff this phase; `withCanonicalCoffeeOverlay` and its 5 call sites are untouched.
10. **Café gating (Phase 4.5.6)** — `app/dashboard/cafe/add-lot/page.tsx` shows zero diff this phase.
11. **`draft` gating of new tastings (Phase 4.5.7)** — untouched (part of the same unmodified passport-page file).
12. **Existing tasting history** — untouched (same file, same unmodified branch).

No direct Supabase writes were performed by this phase — no curl/REST inserts, no service-role key, no test data created. The change is purely client-side form-state seeding.

## 9. Residual limitations

- **The Origin step is still a separately-editable copy, not a live-bound reference to Coffee.** This phase makes the *starting* value correct; it does not prevent a roaster from typing something different afterward (by design — the task explicitly forbade turning Coffee into a read-only source, and required not restricting a field's editability without proven necessity). Phase 4.5.8's Passport-side overlay remains the actual correctness guarantee for the guest-facing surface if a roaster does diverge.
- **`variety` is prefilled but still never displayed on the Passport** (confirmed again — neither `LotPassport` nor `ProducerRoasterCard` render it; noted as a pre-existing, unrelated gap in the Phase 4.5.8 report too, not this phase's concern to fix).
- **The roaster's own edit page (`[lotId]/edit`) still doesn't get an origin prefill mechanism** — by design: it always has a real `initialLot` from the moment the Lot exists, so `originDefaults` is structurally irrelevant there (§2.1) — but it also means a roaster fixing up an *already-created* Lot's origin fields still has no one-click "reset to Coffee's current values" affordance. Out of scope for "creation," which is what this phase targeted; `CanonicalLotChain` (Phase 4.5.3) already shows the real Coffee alongside the edit form for comparison, which partially covers this.
- Carried forward, unchanged: `app/dashboard/roaster/new/page.tsx`'s Phase 4.5.2 wizard remains uncommitted in the working tree (last real commit is still `74fdbef`); this phase added no commits.

## Stopping point

Phase 4.5.9 (Coffee Data into Canonical Lot Creation) is implemented and validated: the creation wizard's `LotBuilderForm` now starts with the real, selected/created Coffee's identity fields instead of blank inputs, using the existing `initial*`-style prop convention, without turning Coffee read-only, without a new entity, and without weakening per-Lot independence. **Phase 4.5.10 has not been started.**
