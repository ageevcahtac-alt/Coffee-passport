# Roast Batch → Reference Roast Profile Version — Exact Link

## 1. Current relationship (before this pass)

`roast_batches.reference_roast_profile_id` is a real, nullable FK into
`reference_roast_profiles(id)` (`on delete restrict` —
`supabase/migrations/0023_canonical_lot_profiles.sql`). Both write paths
existed independently:

- `activateReferenceRoastProfile()` — versions the roaster's declared
  target approach (draft/active/superseded, one active per Lot, DB partial
  unique index).
- `createRoastBatch()` — inserts one immutable actual-event row.

`handleRoastProfileSave()` (`app/dashboard/roaster/[lotId]/edit/page.tsx`)
called both, in the same try block, for the same "Опубликовать профиль
обжарки" button — but independently: `createRoastBatch` always inserted
`reference_roast_profile_id: null`, and neither call's result was passed to
the other. The system could answer "what's active now" and "what's the
newest batch," both scoped only by shared `lot_id`, but never "which exact
version did this specific batch follow."

## 2. Why the FK existed but was never populated

It was added to the schema up front (migration 0023) as part of the
original three-table design — the migration's own comment already states
intent: "It always stores the EXACT version that was followed — never
'whatever is active now.'" But `reference_roast_profiles` itself had no
application write path at all until `REFERENCE_ROAST_PROFILE_IMPLEMENTATION.md`'s
pass, built independently of, and after, `createRoastBatch` (from
`ROAST_BATCH_PUBLIC_PASSPORT_AUDIT.md`'s pass). Both passes deliberately
scoped themselves narrowly and flagged the FK link as the next gap rather
than reordering or threading state between two already-closed write paths.

## 3. Correct write order (confirmed, not guessed)

1. Activate the new `reference_roast_profiles` version → get its real
   `id` back from the insert.
2. Insert the new `roast_batches` row with
   `reference_roast_profile_id = <that id>`.

This is the only order that can work: `roast_batches.reference_roast_profile_id`
is a normal FK (not deferred), so the referenced row must exist before the
batch insert. Reversing the order was structurally impossible — the batch
insert would either fail (if it tried to reference a not-yet-existing row)
or have to be updated afterward, which `roast_batches`' immutability
trigger unconditionally rejects.

## 4. Implemented link

- **`lib/data/canonicalLotStore.ts`**
  - `activateReferenceRoastProfile()` now returns `Promise<string>` (the
    new version's id) instead of `Promise<void>` — the insert gained
    `.select('id').single()`, the same pattern `createCanonicalLot`/
    `createCoffee`/`createGreenLot` already use in this file.
  - `RoastBatchValues` gained a required `referenceRoastProfileId: string | null`
    field — the caller must now explicitly decide, rather than the function
    silently hardcoding `null`.
  - `createRoastBatch()` writes `values.referenceRoastProfileId` instead of
    a hardcoded `null`.
  - New `getReferenceRoastProfileById(id)` — same shape and
    not-found-returns-null contract as `getActiveReferenceRoastProfile`,
    but looks up by `id` instead of `(lot_id, status = 'active')`, so it can
    still find a version that has since been superseded.
- **`app/dashboard/roaster/[lotId]/edit/page.tsx`** — `handleRoastProfileSave`
  reordered: `activateReferenceRoastProfile` now runs first, its returned
  id is passed into `createRoastBatch`'s new `referenceRoastProfileId`
  field. No transaction/framework added — matches the task's explicit
  instruction; this is the same two-sequential-Supabase-calls shape the
  handler already had, just reordered and threaded.

Guarantees preserved: `roast_batches` stays insert-only/immutable; old
batches and old reference profile rows are never rewritten; a new save
always creates a brand-new profile version (new UUID) and a brand-new
batch event; `planVersionActivation()` is untouched; the one-active partial
unique index is untouched and still the only thing enforcing "one active
version."

## 5. Existing data / backfill decision

**No backfill was performed, and none is possible correctly.** Every
`roast_batches` row created before this pass has
`reference_roast_profile_id = NULL` because the write path never set it —
there is no recorded signal (no timestamp comparison, no version snapshot)
of which reference profile version, if any, was active at the moment each
of those historical batches was actually roasted. Guessing "whichever
version is active today" would misattribute history for any Lot whose
reference profile has since been re-saved — exactly what the task
prohibited. These rows keep `reference_roast_profile_id = NULL`
permanently; only batches created after this pass carry the exact link.

## 6. Public Passport impact

Checked whether "Задумано обжарщиком" (`RoastIntentCard`, fed by
`getActiveReferenceRoastProfile`) and "Как прошло на практике"
(`RoastProfileSummaryCard`/`RoastingTab`, fed by `latestRoastProfile`) could
safely switch to the historically-linked version — this was a safe,
minimal source-of-truth swap, not a redesign, so it was implemented:

- `RoastProfile` (`lib/types/coffee.ts`) gained an optional
  `referenceRoastProfileId?: string | null` field; `rowToRoastProfile`
  (`lib/data/roastProfilesStore.ts`) now maps
  `row.reference_roast_profile_id` onto it.
- `app/(site)/passport/[lotId]/page.tsx`: the roast-intent fetch was split
  into its own effect, keyed on the Canonical Lot's id and on
  `latestRoastProfile?.referenceRoastProfileId`. When the newest batch
  carries a linked id, the page now fetches that **exact** version via
  `getReferenceRoastProfileById` instead of "whatever is active now." When
  it doesn't (every batch logged before this pass, or a Lot with no batches
  yet), it falls back to `getActiveReferenceRoastProfile` — byte-identical
  to this page's behavior before this change.

No card, label, or layout changed. `RoastIntentCard`'s prop shape
(`ActiveReferenceRoastProfile`) is unchanged; only which query populates it
changed, and only when a real historical link is available.

## 7. Changed files

- `lib/data/canonicalLotStore.ts` — `activateReferenceRoastProfile` returns
  the new id; `RoastBatchValues`/`createRoastBatch` accept and write
  `referenceRoastProfileId`; new `getReferenceRoastProfileById`.
- `app/dashboard/roaster/[lotId]/edit/page.tsx` — `handleRoastProfileSave`
  reordered and threads the id through.
- `lib/types/coffee.ts` — `RoastProfile` gained optional
  `referenceRoastProfileId`.
- `lib/data/roastProfilesStore.ts` — `rowToRoastProfile` maps the new
  field.
- `app/(site)/passport/[lotId]/page.tsx` — roast-intent fetch split into
  its own effect preferring the linked version, falling back to active.

**Not touched this pass**: Canonical Lot architecture, `public_id`,
`green_lot_id`, Coffee, Green Lot, lifecycle, café gating, tasting history,
`reference_taste_profiles`, `roast_batches` immutability semantics,
`planVersionActivation()`, any migration/RLS, `RoastProfileSummaryCard.tsx`,
`RoastingTab.tsx`, `RoastIntentCard.tsx`'s own rendering, `LotBuilderForm.tsx`,
`RoastProfileForm.tsx`.

## 8. Validation

**`npx tsc --noEmit`** — passed, no output.

**`npx vitest run`**
```
✓ lib/server/canonicalLot.test.ts (14 tests)
Test Files  1 passed (1)
     Tests  14 passed (14)
```
No new test added — both changed functions are unbranched I/O sequences
(same convention as every prior pass in this block); `planVersionActivation`
itself, the only branching logic involved, is untouched and already fully
covered.

**`npm run build`** — passed.
```
✓ Compiled successfully
 ✓ Generating static pages (39/39)
```
`/dashboard/roaster/[lotId]/edit`: 9.08 kB → 9.12 kB. `/passport/[lotId]`:
11.4 kB (unchanged). No route added or removed.

## 9. Regression

- **New Canonical Lot creation** (`new/page.tsx`) — unaffected; no roast
  profile step there.
- **Editing** — `LotBuilderForm`/`updateCanonicalLotFields`/
  `activateTasteProfile` untouched, unaffected.
- **New Reference Roast Profile** — first save for a Lot: unchanged
  versioning behavior (`planVersionActivation([])` → version 1, active);
  only the id is now also returned and consumed.
- **Repeat save** — old version still flips to `superseded` (never
  rewritten); new version gets a new UUID; a new batch is still appended,
  now carrying that new UUID as its FK.
- **Version A → Batch A, Version B → Batch B** — verified by construction:
  each `createRoastBatch` call is passed exactly the id
  `activateReferenceRoastProfile` returned from the *same* handler
  invocation, immediately before, never a stored/stale id from a prior
  call. Batch A's row, once inserted, can never be changed (immutability
  trigger) — so it structurally cannot later start pointing at Version B.
- **Reference Taste Profile** — untouched, unaffected.
- **Public Passport** — "Задумано обжарщиком"/"Как прошло на практике"
  cards, labels, and layout unchanged; only the query behind the intent
  card changed, and only for batches that carry the new link. Existing
  Lots (all batches pre-dating this pass) render identically to before.
- **Tasting/history, QR** — neither reads roast-profile data; unaffected.
- **Existing Lots** — no backfill performed or needed (§5); nothing
  visually changes for any Lot whose batches predate this pass.

No direct Supabase writes were performed outside the app's own reviewed
functions.

## 10. Next real product gap

Now that a batch can carry its exact followed version, the Passport could
show *history* rather than just "current plan vs. most recent result" —
e.g. a per-batch list where each entry names which declared version it
followed (or "before any declared profile existed," for a `null` FK). That
is a genuine new UX surface (a list/detail view, not a one-line source
swap), correctly out of this pass's scope.
