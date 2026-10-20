# Roast Batch — Public Passport Audit

## 1. What `roast_batches` actually is in this system

Two distinct concepts exist in the canonical schema (`supabase/migrations/0023_canonical_lot_profiles.sql`), and its own header comment is explicit about the split:

- **`reference_roast_profiles`** — the roaster's *declared target approach* for a Lot: versioned (draft/active/superseded, exactly one active at a time, same `planVersionActivation()` mechanism as taste profiles), `target_curve` is an intended shape. **Zero application code references this table anywhere** — confirmed by grep: it appears only in the migration and in `lib/types/database.ts`'s type definitions. No store, no read, no write, no UI.
- **`roast_batches`** — one real, immutable roasting **event**: `batch_number`, `roasted_at`, actual measured `charge_temp`/`drop_temp`/`first_crack_time_sec`/`total_time_sec`/`dtr_percent`/`agtron_number`, an actual logged `curve` (BT/ET/RoR points), `notes`, and an optional `reference_roast_profile_id` link. A DB trigger (`prevent_roast_batch_mutation`) rejects any `UPDATE`/`DELETE` unconditionally — this is a genuine, deliberate append-only event log, not an editable record.

The migration's own comment states the client-side `RoastProfile` type (`lib/types/coffee.ts`) "already conflates" these two concepts and was deliberately mapped onto `roast_batches` (not `reference_roast_profiles`) — i.e., **the app's existing "Профиль обжарки" feature (form, cards, tabs) is `roast_batches` wearing a "reference profile" name**, by a pre-existing, pre-Canonical-Lot-work design decision, not something this audit is free to redesign.

## 2. Current data flow

| | Details |
|---|---|
| **Data model (client)** | `RoastProfile` (`lib/types/coffee.ts`): `machineModel`, `chargeTemp`, `dropTemp`, `firstCrackTimeSec`, `totalTimeSec`, `dtrPercent`, `agtronNumber`, `curve`, `notes`, plus `createdAt` — whose own comment says: *"internal record-keeping only; never shown on the guest-facing roast profile card (no roast dates/batch numbers there, by design)."* |
| **Current write path** | `saveRoastProfile()` (`lib/data/roastProfilesStore.ts`) — **local `localStorage` cache only**. Grepped every reference to `roast_batches` in the whole repo: the only `.insert()` call anywhere is in `scripts/migrate-canonical-lot.ts`, a one-time backfill script. `RoastProfileForm.tsx`'s submit button says **"Опубликовать профиль обжарки"** ("Publish roast profile") and the Agtron field has its own in-form comment: **"Показывается гостям на визуальной шкале «светлая ↔ тёмная»"** ("Shown to guests..."). The product's own copy already asserts this is published/public — it silently never was. |
| **Current read path** | `syncRoastProfilesFromSupabase(roasterId)`, called on Public Passport page mount, pulls every `roast_batches` row (public read, no auth) and overlays it onto the same local cache — this read side was already fully built and live before this audit (pre-dates the Canonical Lot phases). |
| **Source of truth** | Should be Supabase `roast_batches` (read side already is); was local `localStorage` only for writes, until this fix. |

## 3. User scenario and public value

`RoastProfileSummaryCard` (a marketing-style target-curve card, explicitly "no dates or batch numbers... by design" per its own comment) and `RoastingTab` (a technical BT/ET/RoR chart with Charge/Drop/total time/DTR/machine model/notes) are both **already live, already rendered on the guest-facing Public Passport**, in the main tasting-reveal flow. `RoastProfileSummaryCard` also feeds the light↔dark Agtron gauge shown to a guest.

**Every single field the roaster's form collects is already displayed to guests by these existing, unmodified components.** This audit did not need to decide *whether* to make roast data public — that decision was already made, shipped, and communicated to the roaster via the form's own "Publish"/"Shown to guests" copy. The only open question was whether the write path existed. It didn't.

## 4. Answers to the audit's specific questions

1. **Canonical Lot → roast_batch relationship**: 1-to-many by design (`lot_id` FK, no uniqueness constraint) — the schema and `RoastingTab`'s "newest first" list rendering both already anticipate multiple batches per Lot over its life.
2. **At Canonical Lot creation**: nothing — `roast_batches` rows are created separately, from the "Профиль обжарки" section of the edit page, whenever the roaster chooses to log one (before or after creating the Lot itself).
3. **At Canonical Lot editing**: same — independent of `LotBuilderForm`'s own save; `RoastProfileForm` is a separate sub-section with its own save action.
4. **Relationship to roast profile / Taste Profile / Lot status**: `roast_batches` is independent of `lots.status` (a `draft` Lot can already have logged batches — useful during its `testing` stage, per the migration's own comment) and independent of `reference_taste_profiles` (a completely separate table/mechanism, closed in the prior iteration). It has a *nullable* link to `reference_roast_profiles`, which this audit confirms has no application code at all — so that link is always null in practice, and building it out is explicitly not part of this fix (see §7).

## 5. Data classification (A / B / C)

Checked every field the roaster's form actually collects against what the guest-facing components actually render, rather than the full DB schema:

| Field | Currently rendered to guests? | Classification |
|---|---|---|
| `machine_model` | Yes (`RoastingTab`: "Машина: …") | **C. Public Passport data** |
| `charge_temp`, `drop_temp` | Yes (both cards) | **C. Public Passport data** |
| `total_time_sec`, `first_crack_time_sec` (via DTR) | Yes | **C. Public Passport data** |
| `dtr_percent` | Yes (both cards) | **C. Public Passport data** |
| `agtron_number` | Yes — explicitly, per the form's own "shown to guests" comment | **C. Public Passport data** |
| `curve` (BT/ET/RoR points) | Yes (`RoastCurveChart` in `RoastingTab`) | **C. Public Passport data** |
| `notes` | Yes (both cards, when present) | **C. Public Passport data** |
| `roasted_at` / `batch_number` | **No** — `RoastProfile.createdAt`'s own comment confirms this is deliberate: "never shown... by design" | **A/B. Internal/roaster-facing only** — not touched, not exposed, matches existing design |
| `reference_roast_profile_id` | N/A — no client code sets or reads it | Not applicable — no UI exists for the concept it links to |

**No field was added to guest visibility by this fix.** Every field written now was already being rendered by pre-existing, unmodified components; the fix only makes what they render **true** (a real published value) instead of **empty** (the "not yet published" placeholder shown for every real Lot until now).

## 6. Gap and category

**Category A — real product gap, fixed.** The write path was completely absent (zero non-backfill inserts anywhere), for a feature the product's own UI copy already declares public ("Опубликовать", "Показывается гостям"), already has fully-built guest-facing display components (pre-dating this audit), and already has a live, working read-sync. This is the identical shape and severity as the `reference_taste_profiles` gap closed in the prior iteration: a "Publish" action that silently published nothing, for every Lot created since this Canonical Lot architecture(and, in this case, likely for longer — this feature pre-dates Phase 4.5.1 entirely).

## 7. Solution

**Insert-only**, matching the schema's own immutability decision exactly — this was the one real design question this audit had to resolve, not invent: the client UI offers an "edit" action on an already-logged profile (overwrite the same local record in place), but `roast_batches` structurally cannot be updated (the DB trigger rejects it unconditionally). Rather than fight that constraint or attempt a workaround, every save — new profile *or* "Редактировать" on an existing one — now creates one new, real, permanent batch event. This is not a redesign: it is the schema's own stated intent ("Roast Batch is a separate, immutable event log," "a new roast does NOT create a new Reference Roast Profile version" — i.e., logging is expected to happen repeatedly over a Lot's life), which the local-only cache had simply never had to honor because it never reached the real, immutability-enforced table. `RoastingTab`'s existing "newest first" list rendering already displays multiple batches correctly with no changes needed.

`reference_roast_profile_id` is left `null` on every insert — building the separate Reference Roast Profile concept (versioned target-curve declaration, its own UI, its own store) is a distinct, larger feature with zero existing application code to extend, unlike `reference_taste_profiles` (which had `planVersionActivation()` already built and tested). Flagged as a residual limitation (§11), not attempted.

## 8. What was implemented

**`lib/data/canonicalLotStore.ts`** — new `createRoastBatch(lotUuid, values)`: a single `insert` into `roast_batches` (`reference_roast_profile_id: null`, `batch_number: ''`, `roasted_at: now()`, everything else from the roaster's already-collected form values). No update, no versioning logic — matches the table's own immutable-log nature exactly.

**`app/dashboard/roaster/[lotId]/edit/page.tsx`** — new `handleRoastProfileSave`, replacing the inline `onSave={(profile) => { saveRoastProfile(profile); setEditingProfile(undefined); }}` handler: still saves the local cache first and unconditionally (so the roaster's own browser display is unaffected even if the Supabase write fails), then resolves the canonical Lot uuid via `findCanonicalLotByPublicId` (unmodified) and calls `createRoastBatch`. A new, section-local `roastProfileSaveError` state surfaces a failure inline next to the "Профиль обжарки" section, without touching `LotBuilderForm`'s own separate `canonicalSaveError`.

No change to `RoastProfileForm.tsx`, `RoastingTab.tsx`, `RoastProfileSummaryCard.tsx`, `roastProfilesStore.ts`'s read/sync side, `public_id`, `green_lot_id`, Coffee, Green Lot, Canonical Lot lifecycle/status semantics, Café gating, or `reference_taste_profiles` (the prior iteration's closed gap).

## 9. Validation

**`npx tsc --noEmit`** — passed. No output, no errors.

**`npx vitest run`** — passed.
```
✓ lib/server/canonicalLot.test.ts (14 tests) 27ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```
No new test added — `createRoastBatch` is a single, straight-line insert with no branching logic (unlike `activateTasteProfile`, it doesn't even call `planVersionActivation`, since `roast_batches` has no version/supersede concept at all), consistent with this project's pure-logic-only testing convention.

**`npm run build`** — passed.
```
✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Generating static pages (39/39)
   Finalizing page optimization ...
   Collecting build traces ...
```
`/dashboard/roaster/[lotId]/edit` grew from 8.98 kB to 9.06 kB. No route added or removed.

## 10. Regression

- **Canonical Lot creation** — `createCanonicalLot()`, `new/page.tsx`'s creation flow: zero diff this iteration (confirmed via `git diff --stat`).
- **Canonical Lot editing** — `LotBuilderForm.tsx`, `handleSave`'s `updateCanonicalLotFields`/`activateTasteProfile` calls: zero diff this iteration.
- **Taste Profile** (prior iteration's fix) — `activateTasteProfile` unmodified, unaffected.
- **Public Passport** — `app/(site)/passport/[lotId]/page.tsx`: zero diff this iteration; `RoastProfileSummaryCard`/`RoastingTab` read paths unmodified — they will now simply start finding real data instead of an empty list.
- **Tasting / history** — unaffected; `roast_batches` is not read by `journey`/`checkins`/`TasteComparison` at all.
- **QR** — unaffected; no `public_id` involvement.
- **Existing Canonical Lots** — no backfill was performed and none was needed: existing Lots with no logged batches will continue to show "обжарщик ещё не опубликовал профиль обжарки" exactly as before, until a roaster next saves a profile for them — no data was fabricated or assumed.

No direct Supabase writes were performed outside the app's own new, reviewed function. No curl/REST inserts, no service-role key, no test data created.

## 11. Residual limitations / next real product gap

- **`reference_roast_profiles` (the versioned "declared target approach," distinct from the actual-event log just fixed) remains completely unbuilt** — no store, no UI, no write path, unlike `reference_taste_profiles` which already had its version-activation logic ready to use. This is a larger, standalone feature (new store, new form/UI, new read integration into `RoastProfileSummaryCard`'s "TargetCurve"), not a field-list or write-path completion — correctly out of this fix's scope, flagged as the clear next architectural candidate if the product wants to properly separate "declared approach" from "actual batch log."
- **Every "Редактировать" on an existing roast profile now creates an additional permanent batch** rather than editing in place — this is the schema's own correct, intended behavior (§7), but it does mean the guest-facing list will grow over time even for small corrections (e.g. fixing a typo in `notes`). Not a bug; a direct, accepted consequence of the pre-existing immutability decision this fix now correctly honors.
- Carried forward, unchanged: `app/dashboard/roaster/new/page.tsx`'s wizard remains uncommitted in the working tree (last real commit is still `74fdbef`).

## Stopping point

`roast_batches`'s write-path gap — a "Publish" action that never published anything, for a feature the product already treats and labels as guest-facing — is closed, using an insert-only design matching the table's own pre-existing immutability. The next real, evidenced product gap for this block is building the separate `reference_roast_profiles` concept, which has no existing client-side foundation to extend.
