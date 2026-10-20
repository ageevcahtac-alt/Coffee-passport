# Phase 4.5.10 — Canonical Lot Readiness / Activation Audit

## 1. Objective

Audit whether a Canonical Lot can reach `status='active'` while remaining so empty that Café ordering or the Public Passport receive an incomplete/meaningless profile. Classify every candidate field as REQUIRED / RECOMMENDED / OPTIONAL for activation, based on actual rendering and actual existing validation — not on "the field exists." Implement a guard only if a real, evidenced gap is found, and only at the draft/testing → `active` transition boundary.

## 2. Field-level audit (before any change)

Traced every field's actual write path (what a roaster can leave blank, and what the code does with a blank value) and actual read path (what a guest/café literally sees if it's blank), rather than assuming from the schema alone.

### 2.1 Coffee-level fields

| Field | Can it be blank today? | What renders if blank | Verdict |
|---|---|---|---|
| `country` | **No** — `NewCoffeeForm` has `required` on the input and an explicit `if (!country.trim()) return;` guard in its submit handler. Structurally guaranteed non-empty for every `coffees` row that can ever exist. | N/A — cannot happen | **REQUIRED**, already enforced (at Coffee creation, not something this phase needs to (re-)check at the Lot-activation boundary) |
| `region` | Yes — no `required`, defaults to `''` in `createCoffee`. | `LotPassport`'s "Регион" row renders empty; `FarmerRevealCard`'s subtitle shows `", {country}"` with a leading comma-space gap. Visually incomplete, not broken. | RECOMMENDED |
| `variety` | Yes | **Not rendered anywhere on the Passport at all** (confirmed again in Phase 4.5.8's audit — neither `LotPassport` nor `ProducerRoasterCard` show it). Its absence has zero guest-visible effect today. | OPTIONAL |
| `processing` | Yes | `LotPassport`'s "Обработка" row and `ProducerRoasterCard`'s "Обработка" row render empty. | RECOMMENDED |
| `harvestYear` | Yes | `LotPassport`'s "Урожай" row renders empty. | RECOMMENDED |
| `producer` (farmer/co-op name) | Yes | `ProducerRoasterCard`'s "Фермер" row and `FarmerRevealCard`'s `<h2>` (the reveal card's own headline) render empty — the most visually prominent blank of this group, since `FarmerRevealCard` is a dedicated full-width "Кто вырастил этот кофе" reveal moment. | RECOMMENDED (see §5 — closest to REQUIRED, but not promoted; reasoning below) |
| `farm` | Yes | "Ферма" row renders empty. | RECOMMENDED |
| `altitude` | Yes | "Высота" row renders empty. | RECOMMENDED |

### 2.2 Canonical-Lot-level fields

| Field | Can it be blank/default today? | What renders if blank/default | Verdict |
|---|---|---|---|
| `name` | **No** — `LotBuilderForm`'s `canSave = Boolean(lotId && form.name.trim() && form.country.trim())` gates the submit button for *every* save, creating and editing alike. Structurally guaranteed non-empty for any Lot that has ever been saved. | N/A — cannot happen | **REQUIRED**, already enforced |
| `qGrade` | **Yes, effectively.** `canSave` does **not** check it. The creation wizard's step progression (`canLeaveMetricsStep = form.qGrade.trim() !== ''`) only loosely requires *some* non-empty text to advance past the Metrics step, and accepts e.g. `"0"`. Once past creation, editing an existing Lot shows all fields on one screen with no per-field gate at all — a roaster can clear Q-Score back to blank and save. Either way, `handleSubmit` computes `qGrade: Number(form.qGrade) || 0` — **blank and "really 0" are indistinguishable** in the saved value. | `components/coffee/QGrade.tsx` renders `value.toFixed(1)` as a decorative "seal" — the literal visual centerpiece at the top of `LotPassport`, directly under the Lot's own name, with explanatory text underneath ("Q-grade — профессиональная оценка качества, присвоенная этому лоту"). A `0.0` here reads as broken/unfinished, not as "not yet set." | **REQUIRED** — the one field where "empty" produces a distinct, prominent, wrong-looking artifact rather than a graceful blank. This is the gap. |
| `roastType` | No — a radio-button-style control (`ROAST_TYPES` fixed list) defaulting to `'filter'`; there is no way to submit it blank or invalid. | N/A — cannot happen | OPTIONAL (already safe by construction) |
| `roastProfileLabel` (`roastProfile`) | **No**, for a newly created Lot — `handleSubmit`: `roastProfile: initialLot?.roastProfile ?? 'Pure Roast®'`. A brand-new Lot always gets `'Pure Roast®'`, never blank. (An *edited* Lot could theoretically have this field cleared if `LotBuilderForm` exposed an editable input for it back to empty — it does not: this field has no form input at all, it is only ever set by the create-time default and never re-derived from a blank input.) | N/A — effectively cannot happen | OPTIONAL (already safe) |
| `descriptors` | Yes — a blank "Дескрипторы вкуса" input produces `[]`. | `DescriptorTags` with an empty array renders an empty `<ul>` — no visual artifact, no broken-looking element, just fewer tags. | RECOMMENDED |
| `roasterFlavorProfile` (acidity/sweetness/body/bitterness) | No — `toFormState`'s blank branch defaults every axis to `3` (mid-scale); the `FlavorSlider` control cannot produce `undefined`. `3/5` reads as a plausible, if generic, real value — not a broken sentinel. | Renders as a normal, if middling, meter reading. | OPTIONAL (already safe) |
| `story` | Yes | `ProducerRoasterCard`'s "История" section renders an empty paragraph. Mildly awkward, not broken. | RECOMMENDED |
| `status` | N/A — this is the mechanism being gated, not content. | — | — |
| `inRoasterCatalog` | No — boolean, defaults `true`. | — | — |

## 3. Conclusion — is there a real gap?

**Yes, exactly one**: `qGrade` can reach `0` (via a blank/cleared input) with no gate anywhere between that and `status='active'`, and `0.0` renders as a prominent, distinctly wrong-looking visual artifact — not a graceful "incomplete" state like every other checked field. `name` is the only other field the audit found genuinely necessary for a non-broken passport, and it is **already** enforced everywhere a Lot can be saved (`LotBuilderForm`'s `canSave`) — no new code was needed for it, only inclusion in the readiness check for completeness/defense-in-depth.

Every Coffee-level field except `country` (already enforced at Coffee creation) degrades gracefully when blank — an empty table row or a missing subtitle segment, never a broken-looking number or icon. Per the task's own instruction not to require a field "just because it exists," none of them are promoted to REQUIRED.

`producer` (farmer name) was the closest call — its absence is the most *visually prominent* blank (an empty `<h2>` on `FarmerRevealCard`'s dedicated reveal moment) — but it still degrades to "blank text," not a nonsensical value, and unlike `qGrade` there is no analogous existing enforcement pattern (no `canSave`-style gate ever considered it) to extend by analogy. Kept as RECOMMENDED, not promoted, per the task's explicit instruction to only gate what's *proven* necessary.

## 4. Summary table

| Tier | Fields |
|---|---|
| **A. REQUIRED FOR ACTIVE** | `name` (already enforced elsewhere), `qGrade` (the actual gap) |
| **B. RECOMMENDED** | `region`, `processing`, `harvestYear`, `producer`/farmer, `farm`, `altitude`, `descriptors`, `story` |
| **C. OPTIONAL** | `variety`, `roastType`, `roastProfileLabel`, `roasterFlavorProfile` |
| (mechanism, not content) | `status`, `inRoasterCatalog`, `country` (already structurally guaranteed) |

## 5. What was implemented

**`components/roaster/CanonicalLotStatusControl.tsx`**:
- New local function `isReadyForActive(lot: CanonicalLot): boolean` — `Boolean(lot.name.trim()) && lot.qGrade != null && lot.qGrade > 0`.
- `selectStatus(status)` gained one new check, placed immediately after the existing no-op guard (`!canonicalLot || status === canonicalLot.status || saving`) and before anything else: if the target `status === 'active'` and `!isReadyForActive(canonicalLot)`, set an explanatory inline error and return — **no Supabase call is made**, exactly as this component's existing error paths already behave.
- The check runs **only** when the target status is `'active'`. Selecting `'draft'`, `'testing'`, or `'archived'` — from any current status, including from `'active'` back down — is completely unaffected; the existing unconditional `updateCanonicalLotFields` call still runs exactly as before for all three.

No other file was touched. `updateCanonicalLotFields()` itself is unmodified — the gate lives entirely in the one UI call site that lets a roaster choose `'active'`, per the task's explicit preference for a boundary-level guard over a data-access-level one.

## 6. Why this is the minimal, correctly-scoped fix

- **Only the transition into `active` is gated.** Confirmed by re-reading the new code: the `if` only fires when `status === 'active'`. A roaster can still save a completely empty-except-name-and-country draft (`LotBuilderForm`'s own `canSave` is unchanged), and can still flip between `draft`/`testing` freely.
- **Testing does not auto-promote.** Nothing in this codebase, before or after this change, transitions a Lot's status automatically — every transition is an explicit roaster click on `CanonicalLotStatusControl`, unchanged.
- **No DB schema change, no new entity.** The check is a plain boolean function reading two fields already present on the already-fetched `CanonicalLot` object; `q_grade`'s nullable column and `status`'s check constraint are both untouched.
- **`public_id`, `green_lot_id`, Coffee, Green Lot, Café gating, Public Passport lifecycle, tasting history** — none of these are referenced by this change at all.

## 7. Exact changed files

- `components/roaster/CanonicalLotStatusControl.tsx` — modified (one new function, one new early-return check inside `selectStatus`)

**Not touched this phase** (confirmed via `git diff --stat` showing byte-identical output to the end of Phase 4.5.9 for every previously-touched file): `lib/data/canonicalLotStore.ts` (including `updateCanonicalLotFields` itself, `createCanonicalLot`, `generatePublicLotId`), `components/roaster/LotBuilderForm.tsx`, `app/dashboard/roaster/new/page.tsx`, `app/dashboard/roaster/[lotId]/edit/page.tsx`, `app/dashboard/roaster/page.tsx`, `app/(site)/passport/[lotId]/page.tsx`, `app/dashboard/cafe/add-lot/page.tsx`, `components/roaster/CanonicalLotChain.tsx`, any migration, Coffee/Green Lot schema.

## 8. Validation

**`npx tsc --noEmit`** — passed. No output, no errors.

**`npx vitest run`** — passed.
```
✓ lib/server/canonicalLot.test.ts (14 tests) 17ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```
No new test added — `isReadyForActive` is a 2-condition pure boolean check inside a `'use client'` component file, not a candidate for `lib/server/canonicalLot.test.ts` (server-side domain logic only, per that file's own header comment). Given its small size and single call site, a new test harness was judged disproportionate, consistent with this project's established testing convention through Phases 4.5.1–4.5.9.

**`npm run build`** — passed.
```
✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Generating static pages (39/39)
   Finalizing page optimization ...
   Collecting build traces ...
```
`/dashboard/roaster/[lotId]/edit` grew from 8.82 kB to 8.93 kB. No route added or removed.

## 9. Regression (all 10 required checks)

1. **New Coffee → New Green Lot → Canonical Lot** — unaffected: creation always defaults `status` to `'draft'` (confirmed again: `new/page.tsx`'s `createCanonicalLot()` call never passes `status` at all), so this new check — which only fires on a transition *to* `'active'` — never runs during creation.
2. **Existing Coffee → Existing Green Lot → Canonical Lot** — unaffected, same reasoning.
3. **One Green Lot → several Canonical Lots** — unaffected; the check reads only the one Lot being transitioned (`canonicalLot.name`/`canonicalLot.qGrade`, scoped by its own `id`), never anything Green-Lot- or Coffee-level.
4. **Draft can be saved incomplete** — confirmed: `LotBuilderForm`'s `canSave` (the only gate on saving as draft/testing) is completely unmodified; this phase adds no new field requirements to saving at all, only to the separate act of flipping status to `active`.
5. **Editing an existing Lot works** — `LotBuilderForm` itself, its props, and its submit logic are all untouched (zero diff, confirmed).
6. **`public_id` immutable** — untouched; not referenced by this change.
7. **`green_lot_id` immutable** — untouched; not referenced by this change.
8. **Public Passport works** — `app/(site)/passport/[lotId]/page.tsx` shows zero diff this phase.
9. **Café gating works** — `app/dashboard/cafe/add-lot/page.tsx` shows zero diff this phase; its rule (`in_roaster_catalog=true AND status='active'`) is unaffected — this phase only makes reaching `status='active'` slightly harder for a genuinely empty Lot, it doesn't touch the gating rule itself.
10. **Existing tasting history preserved** — the Passport page's `latestTasting` branch is untouched (zero diff to that file).

No direct Supabase writes were performed by this phase — the new check, when it fires, explicitly *prevents* a Supabase call rather than making one. No curl/REST inserts, no service-role key, no test data created.

## 10. Residual limitations

- **`qGrade` can still be a small-but-nonzero number** (e.g. a roaster types `0.1` to get past the gate without a real score) — this phase closes the exact-zero/blank sentinel case with evidence (`0.0` as a visually broken seal), not a full data-quality validator. Tightening further (e.g. requiring a minimum plausible Q-score like 60+) would be a product judgment call this phase's evidence doesn't support making unilaterally.
- **RECOMMENDED-tier fields remain fully unenforced**, by design — a Lot can go `active` with a real name and Q-Score but blank region/farm/altitude/descriptors/story. This matches the audit's finding that these degrade gracefully rather than looking broken, and the task's explicit instruction not to require a field without proof.
- **`producer` (farmer name) was the closest call for promotion to REQUIRED** (§3) but was not promoted — flagged here explicitly in case a future phase, with product input, decides `FarmerRevealCard`'s reveal moment is important enough to warrant it.
- Carried forward, unchanged: `app/dashboard/roaster/new/page.tsx`'s Phase 4.5.2 wizard remains uncommitted in the working tree (last real commit is still `74fdbef`); this phase added no commits.

## Stopping point

Phase 4.5.10 (Canonical Lot Readiness / Activation Audit) is complete: a full field-level audit was performed, classifying every candidate field by actual evidenced behavior rather than assumption, and exactly one real gap (`qGrade` collapsing to an indistinguishable `0` with no gate before `active`) was closed with a minimal, transition-boundary-only guard. **Phase 4.5.11 has not been started.**
