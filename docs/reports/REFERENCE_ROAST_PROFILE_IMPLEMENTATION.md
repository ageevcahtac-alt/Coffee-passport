# Reference Roast Profile — Implementation

## 1. Current schema

`supabase/migrations/0023_canonical_lot_profiles.sql`:

```sql
create table public.reference_roast_profiles (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete restrict,
  version integer not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'superseded')),
  machine_model text not null default '',
  target_curve jsonb not null default '[]'::jsonb, -- [{timeSec, bt, et, ror}, ...]
  agtron_target numeric,
  notes text not null default '',
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (lot_id, version)
);
create unique index idx_ref_roast_profiles_one_active
  on public.reference_roast_profiles(lot_id) where status = 'active';
```

RLS (`0025_canonical_lot_rls.sql`, unmodified, already correct): public `select`; `insert`/`update` restricted to `is_roaster_staff_for(lot's roaster_id)` — the same ownership check every other Canonical Lot write already uses. No RLS change was needed.

## 2. Existing intended architecture (from the migration's own comments)

The migration's header is explicit: this table is the roaster's **declared target approach** for a Lot — distinct from `roast_batches` (an immutable log of what actually happened at each real roasting event) and independently versioned from `reference_taste_profiles` (the expected sensory result). All three share the same "Stage 3 §06/§07/§15/§25" versioning contract: **exactly one active version per Lot, enforced by a database partial unique index**, never a denormalized pointer.

## 3. Relation to `roast_batches`

- `roast_batches.reference_roast_profile_id` is a nullable FK into this table — "an early test roast during a Lot's `testing` stage may predate any finalized reference profile," and it "always stores the EXACT version that was followed — never 'whatever is active now.'"
- Conceptually: Reference Roast Profile = the plan; Roast Batch = an actual execution of (ideally) that plan.
- Practically, before this pass, **neither table's write path existed** for `roast_batches`' declared-profile link — `createRoastBatch()` (previous iteration) always inserts `reference_roast_profile_id: null`, since nothing on the client currently resolves "which reference profile version was this batch following." That remains true after this pass too (see §12) — linking a specific batch to a specific profile version is a separate decision this pass does not make.

## 4. Relation to `reference_taste_profiles`

Structurally identical versioning shape (`version`, `status: draft/active/superseded`, `unique(lot_id, version)`, one-active partial unique index) — confirmed by direct comparison of both `CREATE TABLE` statements. `planVersionActivation()` (`lib/server/canonicalLot.ts`) is already generic over `{id, version, status}` and was written once, for exactly this shared contract — re-used verbatim for this table, not reinvented.

## 5. Source of truth

Before this pass: none — no application write path existed anywhere (grepped every reference to `reference_roast_profiles`: only migration + `lib/types/database.ts` type definitions, confirmed zero application code). After this pass: Supabase `reference_roast_profiles`, written through `activateReferenceRoastProfile()`.

## 6. Versioning model

Identical to `reference_taste_profiles`' now-live model (closed in the prior iteration): `planVersionActivation(existingVersions)` computes `{ supersedeId, nextVersion }` from every existing version row for the Lot; if a version is currently `active`, it is flipped to `superseded` (never rewritten — a plain `UPDATE ... SET status = 'superseded'`, not a delete or value change), and the new version is inserted fresh as `active`. **No existing version is ever overwritten or deleted.**

## 7. Three-way comparison

| | `roast_batches` | `reference_roast_profiles` | `reference_taste_profiles` |
|---|---|---|---|
| Meaning | What actually happened | What the roaster declared as the target approach | What sensory result the roaster expects |
| Mutability | **Immutable** — DB trigger rejects UPDATE/DELETE unconditionally | Versioned — old version superseded, never rewritten | Versioned — old version superseded, never rewritten |
| Multiple rows per Lot? | Yes, unbounded, append-only log | Yes, but exactly one `active` at a time (DB-enforced) | Yes, but exactly one `active` at a time (DB-enforced) |
| "Current" selection | N/A — no active flag; reader picks "newest by `created_at`" | `status = 'active'`, DB-enforced uniqueness | `status = 'active'`, DB-enforced uniqueness |
| On repeat save | New row appended, prior rows untouched | Old `active` → `superseded`; new row inserted `active` | Old `active` → `superseded`; new row inserted `active` (already live) |
| Guest-visible today | Yes (`RoastProfileSummaryCard`, `RoastingTab`, already live) | **Not yet** — see §9 | Yes (`TasteComparison`, `ProducerRoasterCard`, already live) |
| Internal-only fields | none currently collected are hidden (see prior audit) | `created_by`, `effective_from` — not rendered anywhere, never were | same pattern |

## 8. Implemented write-path

**`lib/data/canonicalLotStore.ts`** — `activateReferenceRoastProfile(lotUuid, { machineModel, targetCurve, agtronTarget, notes })`: reads existing version rows for the Lot, calls the unmodified `planVersionActivation()`, supersedes the current active row if any, inserts the new version as `active`. Byte-for-byte the same two-step shape as `activateTasteProfile` (prior iteration) — no new versioning logic was written, the existing pattern was reused directly.

**`app/dashboard/roaster/[lotId]/edit/page.tsx`** — `handleRoastProfileSave` (the single handler behind `RoastProfileForm`'s "Опубликовать профиль обжарки" button, already extended in the prior iteration to call `createRoastBatch`) now **also** calls `activateReferenceRoastProfile`, in the same try block, using fields `RoastProfileForm` already collects:

| `RoastProfileForm` field | → `reference_roast_profiles` field | Reasoning |
|---|---|---|
| `machineModel` | `machine_model` | Direct match |
| `curve` (the roaster's logged/imported curve points) | `target_curve` | Same point shape (`{timeSec, bt, et, ror}`) as both `roast_batches.curve` and this column — the curve the roaster just entered/imported doubles as the newly-declared target shape, exactly as intended when a roaster is defining "how we roast this coffee" for the first time |
| `agtronNumber` | `agtron_target` | Direct match |
| `notes` | `notes` | Direct match |
| `chargeTemp`, `dropTemp`, `firstCrackTimeSec`, `totalTimeSec`, `dtrPercent` | *(no column)* | This table has no such columns at all — they remain `roast_batches`-only, exactly matching the schema |

**One form, one button, one production flow** — per the task's explicit instruction, no second parallel form was created. A single save now correctly populates both the immutable actual-event log (`roast_batches`) and the versioned declared-target table (`reference_roast_profiles`) from the one set of fields the roaster already fills in.

## 9. Read-path — deliberately NOT changed, and why

Audited `RoastProfileSummaryCard.tsx` precisely: its own header comment already frames it as "a friendlier, marketing-style summary of the roaster's REFERENCE/target profile" — conceptually exactly what `reference_roast_profiles` is for. But its `profile` prop is the client `RoastProfile` type (`chargeTemp: number`, `dropTemp: number`, ...) and its internal `TargetCurve` sub-component draws an illustrative two-point-interpolated curve **from those two temperature numbers** — a rendering approach that only makes sense for `roast_batches`-shaped data (which does carry `charge_temp`/`drop_temp` as direct columns). `reference_roast_profiles` has **no `charge_temp`/`drop_temp` columns at all** — its shape is a full `target_curve` point array instead, structurally closer to `RoastingTab`'s `RoastCurveChart` (which plots a real point series) than to `RoastProfileSummaryCard`'s two-endpoint interpolation.

Reconnecting `RoastProfileSummaryCard` to real `reference_roast_profiles` data would therefore require rewriting its `TargetCurve` rendering (from "interpolate between two temperatures" to "plot a real point array") — **that is a redesign of an existing component's rendering logic**, not a minimal read-path change, and the task explicitly ruled that out ("не делай redesign," "если требуется минимальное изменение read-path... внеси только это" — conditional on it actually being minimal, which this audit found it is not). `RoastProfileSummaryCard` and `RoastingTab` therefore continue to be fed by `roast_batches`' `latestRoastProfile` (newest actual batch), completely unchanged — confirmed via `git diff --stat`: zero lines touched in either file, or in `app/(site)/passport/[lotId]/page.tsx`, this iteration.

**Public Passport behavior after this pass**: unchanged. It still shows the newest actual roast batch, exactly as before. `reference_roast_profiles` now accumulates real, correctly-versioned data underneath, ready for a future, properly-scoped UI change — but nothing on the guest-facing page reads it yet.

## 10. Public value / fields exposed

**No new field became guest-visible.** This pass writes to a table nothing currently reads on the Public Passport (§9) — there is no new public surface to audit for internal-data leakage. `created_by` and `effective_from` are written (required by the schema) but rendered nowhere, matching the same pattern already accepted for `reference_taste_profiles`. Per the task's explicit prohibition list — no batch date, no batch number, no purchasing/production-internal data, no internal notes were added to any public surface, because no public surface changed at all.

## 11. Product safety checklist

- **New Canonical Lot creation** — unaffected; `activateReferenceRoastProfile` is only ever called from the roast-profile save flow, never from `new/page.tsx`'s Lot-creation flow (which has no roast-profile step at all, unchanged).
- **Creating a reference roast profile** — first save for a Lot: `existingRows` is empty, `planVersionActivation([])` returns `{ supersedeId: null, nextVersion: 1 }` (matches its own tested behavior, unmodified) — inserts version 1 as `active`, nothing to supersede.
- **Re-saving / editing** — `existingRows` finds the current `active` row, `planVersionActivation` returns its id as `supersedeId` and `nextVersion` one higher — old row flipped to `superseded` (never deleted, never had its content changed), new row inserted `active`. **The old version's declared approach remains permanently readable in the table, exactly as `reference_taste_profiles` already does.**
- **Versioning / active profile** — DB partial unique index (`idx_ref_roast_profiles_one_active`) makes "more than one active version" structurally impossible regardless of application logic — a second layer of protection beyond `planVersionActivation`'s own correctness.
- **Public Passport** — zero diff, confirmed (§9).
- **Existing Lots** — no backfill performed; Lots with no `reference_roast_profiles` row yet simply have none, same as before.
- **Taste Profile** (prior iteration) — `activateTasteProfile` unmodified, unaffected; called independently, in the same `handleSave` for `LotBuilderForm`, not this one.
- **`roast_batches` immutability** — not touched by this pass at all; `createRoastBatch` (prior iteration) is called in the same handler but is a wholly separate function/table, unmodified.
- **Tasting/history, QR** — neither reads roast-profile data of any kind; unaffected.

## 12. Exact changed files

- `lib/data/canonicalLotStore.ts` — modified (new `activateReferenceRoastProfile` + `ReferenceRoastProfileValues`, additive only)
- `app/dashboard/roaster/[lotId]/edit/page.tsx` — modified (`handleRoastProfileSave` now also calls `activateReferenceRoastProfile`)

**Not touched this iteration** (confirmed via `git diff --stat` showing byte-identical output to before this pass): `app/dashboard/roaster/new/page.tsx`, `app/dashboard/roaster/page.tsx`, `app/dashboard/cafe/add-lot/page.tsx`, `app/(site)/passport/[lotId]/page.tsx`, `components/roaster/LotBuilderForm.tsx`, `components/roaster/RoastProfileForm.tsx`, `components/coffee/RoastingTab.tsx`, `components/coffee/RoastProfileSummaryCard.tsx`, `lib/data/roastProfilesStore.ts`, any migration, RLS policies, `reference_taste_profiles`, `roast_batches`, `public_id`, `green_lot_id`, Coffee, Green Lot, Canonical Lot lifecycle, Café gating, tasting history.

## 13. Validation

**`npx tsc --noEmit`** — passed. No output, no errors.

**`npx vitest run`** — passed.
```
✓ lib/server/canonicalLot.test.ts (14 tests) 17ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```
`planVersionActivation`'s existing 3 tests (first activation, v1→v2 supersede, superseded history not re-superseded) are the exact logic now driving production writes for a *second* table — no new test needed; the shared function is already fully covered, and `activateReferenceRoastProfile` itself is a thin, unbranched I/O sequence around it (same convention as `activateTasteProfile`).

**`npm run build`** — passed.
```
✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Generating static pages (39/39)
   Finalizing page optimization ...
   Collecting build traces ...
```
`/dashboard/roaster/[lotId]/edit` grew from 9.06 kB to 9.08 kB. No route added or removed.

## 14. Regression

All items from the product-safety checklist (§11) double as the regression check; additionally confirmed via `git diff --stat` that every file outside the two listed in §12 is byte-identical to its state before this pass, across the full set the task asked to protect: Canonical Lot creation/edit, Taste Profile, `roast_batches`, Public Passport, tasting/history, QR, and existing Lots. No direct Supabase writes were performed outside the app's own new, reviewed function — no curl/REST inserts, no service-role key, no test data created.

## 15. Next real product gap

**Deciding how (or whether) to surface "Задумка обжарщика" distinctly from "Фактическая обжарка" on the guest-facing Public Passport** is the clear next step — but it is a genuine product/design decision, not a mechanical completion:

- Should `RoastProfileSummaryCard` be rewritten to plot the real `target_curve` (a redesign of that card), or should a new, separate card be introduced for "the plan" alongside the existing one for "what happened"?
- Should `roast_batches.reference_roast_profile_id` start being set (linking each new batch to the reference version active at roast time), so the Passport could eventually show "this batch followed the current plan" vs. "this batch predates it"?
- Is showing both the plan and the actual result to a guest even more useful than just the actual result already shown — or would it be confusing/redundant for a non-expert audience?

None of these have an evidenced, low-risk answer the way the write-path completion did — each requires an actual product decision, correctly out of this pass's scope to make unilaterally.
