# Phase 4.5.6 — Status & Visibility Gating

## 1. Objective

Phase 4.5.5 found that Café-ordering and the public Coffee Passport are gated only by `in_roaster_catalog`, while `status` (draft/testing/active/archived) — editable since 4.5.4 — has no effect anywhere. This phase's job: establish the actual, current semantics of both fields across every consumer surface, and decide — per surface, not by assumption — whether the existing model is sufficient to safely define publication. Implement gating only where it is.

## 2. Audit — actual current behavior (before any change)

### 2.1 Where `in_roaster_catalog` is used

| File | Role |
|---|---|
| `app/dashboard/roaster/page.tsx` | Drives the roaster's own Active/Archived dashboard tabs (`myLots.filter(lot => lot.inRoasterCatalog)` / `!lot.inRoasterCatalog`). This is the **owner's own management view** — not a publication gate. |
| `app/dashboard/cafe/add-lot/page.tsx` | The only place that gates *discovery* of a Lot: `available = lots.filter(lot => !(lot.id in menuEntries) && lot.inRoasterCatalog)`, and the same check on the manual-code path (`if (!found.inRoasterCatalog) { ...error... }`). |
| `app/dashboard/cafe/(hub)/page.tsx` | Reads it for a Lot **already on a café's menu**, as `discontinuedByRoaster={!lot.inRoasterCatalog}` — a display flag, not a hide. |
| `app/(site)/passport/[lotId]/page.tsx` | Grepped for `inRoasterCatalog` — **zero matches**. Not read at all. |
| `app/(site)/scan/page.tsx` | Grepped — **zero matches**. Resolves a scanned code to any Lot with a matching id and navigates straight to its passport, unconditionally. |

Its own doc comment (`lib/types/coffee.ts`) is explicit and load-bearing: *"turning it off only means a coffee shop can no longer ADD this lot to its menu... It must NOT cascade into hiding the lot from a coffee shop that already stocked it."* This is a **non-cascade guarantee for already-served consumers**, confirmed structurally by `(hub)/page.tsx` showing a flag rather than hiding the row.

### 2.2 Where `status` is used

Before this phase: only the surfaces built in 4.5.3–4.5.5 (`CanonicalLotChain`, `CanonicalLotStatusControl`, the roaster dashboard's status badge) ever read it. Zero consumer-facing gating anywhere. The only semantic hint in the codebase is `createCanonicalLot`'s own comment: *"status?: LotStatus; // defaults to 'draft' — a freshly created Lot has no finalized profile yet."* — this describes the roaster's own workflow-readiness, not guest-facing publication, and says nothing about what `testing`/`archived` should mean for a café or a guest.

### 2.3 Is there an existing "Roaster Catalog" list, or only separate pages?

`app/dashboard/roaster/page.tsx` already is the Roaster Catalog (confirmed in Phase 4.5.5). No second list exists. No change needed here beyond what 4.5.5 already did — it's the owner's view; an owner must see their own drafts, so it must **not** be gated by `status` at all. Left untouched.

### 2.4 Legacy/localStorage mechanisms that could conflict

`lib/data/lotsStore.ts`'s local-override-shadowing merge (documented in the 4.5.5 report, §2.7) still means the local `Lot` type has no `status` field and cannot safely be given one this phase either — same reasoning as before, unchanged, not revisited.

### 2.5 The concrete fork

Two consumer surfaces, two different risk profiles:

- **Café ordering** (`add-lot/page.tsx`): already has a real gate (`inRoasterCatalog`). Adding `status === 'active'` on top only **narrows** an existing gate — it can never grant access that didn't already exist, and it directly closes the exact bug 4.5.5 diagnosed (a freshly created `draft` Lot was immediately orderable). Checked against live data: every pre-existing Lot in Supabase (the four seed/backfilled ones) already has `status = 'active'` — so this change has **zero effect** on anything a real café could already order; it only prevents the four `draft`-status Lots created during Phase 4.5.2's manual A–D testing from being orderable, which is precisely correct.
- **Public Passport** (`passport/[lotId]/page.tsx`, reached via `/scan` or a direct link): has **no gate at all today** — this would be the *first* gate ever added to that page, a materially bigger change. Worse: `in_roaster_catalog`'s documented non-cascade guarantee (§2.1) exists specifically to protect a guest/café that already has the Lot. A guest who already scanned a passport and saved it to their journey is exactly the kind of "already-served consumer" that principle protects — so reusing `in_roaster_catalog` as a passport gate would directly **contradict** an existing, deliberate design decision. And `status` alone doesn't resolve this either: nothing in the codebase says what `testing` or `archived` should mean for a guest who already has the link — should `archived` (a Lot the roaster discontinued) still show its passport (matching the `inRoasterCatalog` precedent) or not? That is a genuine, unanswered product question, not something inferable from existing code.

**Verdict**: the existing model is sufficient to safely define publication for **café ordering** (a pure, backward-compatible narrowing of an existing gate). It is **not** sufficient for **the public Passport** — closing that gap would mean either inventing an answer to an unstated product question, or reusing `in_roaster_catalog` in a way that contradicts its own documented purpose. Per the task's explicit instruction, the Passport question is recorded as a finding and a precise fork (§7), not resolved.

## 3. Rule implemented

> **A Canonical Lot is available for a café to newly order when `in_roaster_catalog = true` AND `status = 'active'`.**

This is additive to the existing rule, not a redefinition: `in_roaster_catalog` still means exactly what it always meant (roaster's own catalog inclusion); `status` still means exactly what it always meant (lifecycle); "published for ordering" is now the **explicit conjunction** of the two, replacing the previous single-field check — closing exactly the "случайное сочетание legacy-проверок" the task warned about, for this one surface.

No rule was adopted for the public Passport — see §7.

## 4. Exact changed files

- `lib/data/canonicalLotStore.ts` — modified (additive only: one new function, `listAllCanonicalLotStatuses`, +13 net lines; **zero lines removed**, confirmed by `git diff | grep '^-'` producing no output)
- `app/dashboard/cafe/add-lot/page.tsx` — modified (new imports, a local `STATUS_LABELS` map, a `canonicalStatuses` fetch, `isPublishedForOrdering()` replacing the old inline `lot.inRoasterCatalog` filter, and one new status check + error message on the manual-code path)

**Not touched this phase** (confirmed via `git diff --stat` showing identical byte counts to the end of Phase 4.5.5, or no diff at all): `lib/data/canonicalLotStore.ts`'s `createCanonicalLot`, `generatePublicLotId` usage, `green_lot_id` handling; `components/roaster/LotBuilderForm.tsx`; `app/dashboard/roaster/new/page.tsx`; `app/dashboard/roaster/[lotId]/edit/page.tsx`; `app/dashboard/roaster/page.tsx`; `components/roaster/CanonicalLotChain.tsx`; `components/roaster/CanonicalLotStatusControl.tsx`; `app/(site)/passport/[lotId]/page.tsx`; `app/(site)/scan/page.tsx`; `app/dashboard/cafe/(hub)/page.tsx`; `lib/types/coffee.ts`; any migration.

## 5. Implementation

**`lib/data/canonicalLotStore.ts`** — `listAllCanonicalLotStatuses()`: an unscoped `select('public_id, status')` over `lots`, returning `Map<publicId, LotStatus>`. Deliberately unscoped (unlike `listCanonicalLotsForRoaster`) because the café add-lot flow browses every roaster's catalog in one list — it has no single `roaster_id` to filter by. This mirrors the shape `createCanonicalLot()` itself already uses for its own public_id-uniqueness check (a bare `select` over all of `lots`), just returning one extra column.

**`app/dashboard/cafe/add-lot/page.tsx`**:
- Loads `canonicalStatuses` once on mount, independently of `useLots()` — same "separate, read-only, display/gating-only map" pattern established in Phase 4.5.5's roaster dashboard change.
- `isPublishedForOrdering(lot)`: `false` immediately if `!lot.inRoasterCatalog` (unchanged prior behavior); otherwise `true` unless a known canonical status exists and isn't `'active'`. A Lot with no canonical row at all (`status === undefined` — a legacy/local-only Lot never backfilled) is treated exactly as before this phase: gated by `inRoasterCatalog` alone, never newly blocked by an absent status.
- The browse list (`available`) now filters through `isPublishedForOrdering` instead of the bare `lot.inRoasterCatalog` check.
- The manual-code path gained one new check, after the existing `inRoasterCatalog` check and before `addLot()`, with its own distinct message: *"{name} ещё не опубликован обжарщиком (статус: {label})."* — kept separate from the existing "снят с производства" message so a café understands *why* (paused catalog vs. still in progress) rather than seeing one generic denial.

## 6. Consumer flows affected vs. not affected

**Affected**: café-ordering discovery only — the browse list on `/dashboard/cafe/add-lot` and its manual-code entry path. A `draft`/`testing`-status Lot can no longer be freshly added to a café's menu; a Lot already on a menu is completely unaffected (this gate only runs at the point of *adding*, never re-evaluated for existing `cafe_menu_entries` rows — matching the same "never affects lots already on a menu" principle `inRoasterCatalog` already followed).

**Not affected** (verified by re-reading each, unchanged):
- Roaster's own dashboard (`app/dashboard/roaster/page.tsx`) — an owner must see all their own Lots including drafts; no gating added, none needed.
- Café's already-added menu (`app/dashboard/cafe/(hub)/page.tsx`) — still shows every Lot the café added, `discontinuedByRoaster` flag unchanged.
- Public Passport (`app/(site)/passport/[lotId]/page.tsx`) and `/scan` — no gate added; see §7.
- Coffee/Green Lot creation, reuse, `createCanonicalLot()`, `public_id` generation, `green_lot_id` — untouched.
- Detail (4.5.3) and edit/update (4.5.4) flows — untouched.

## 7. Residual architectural question (not resolved, per instructions)

**Should the public Passport (`/passport/[lotId]`, reached via `/scan`, a saved link, or a printed QR code) be gated by `status` and/or `in_roaster_catalog`?**

Not decided or implemented this phase. The fork, precisely:

- Reusing `in_roaster_catalog` here would contradict its own documented non-cascade guarantee (§2.1, §2.5) — a guest who already has the link is exactly who that guarantee protects.
- Gating by `status` alone is plausible for `draft` (an unfinished profile, per `createCanonicalLot`'s own comment — a guest seeing a half-filled passport is a real UX problem) but **undefined** for `testing` and `archived`: no code or comment anywhere states what a guest who already has the link should see for either. Guessing risks either needlessly breaking an already-shared QR code (if too strict) or leaving the original gap open in another form (if too lenient).
- This also interacts with `/scan`'s and any menu/QR-print flow's own assumptions, none of which currently branch on either field — a real product decision (not just a code change) about what "not yet published" should look like publicly (404? a "coming soon" page? render normally?) is needed before this can be implemented safely.

**Recommended next phase (candidate Phase 4.5.7)**: decide, with product input, what a `draft`/`testing`/`archived` Canonical Lot's public Passport should show to a guest who already has the link — then implement that specific, decided behavior. Not started here.

## 8. Validation

**`npx tsc --noEmit`** — passed. No output, no errors.

**`npx vitest run`** — passed.
```
✓ lib/server/canonicalLot.test.ts (14 tests) 18ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```
No new test added — `listAllCanonicalLotStatuses` is a thin Supabase I/O wrapper with no new branching (same shape as the already-untested `listCoffeesForRoaster`/`listCanonicalLotsForRoaster`); `isPublishedForOrdering` is a 3-line pure function but lives inside a page component reading page-local state, not a candidate for the pure-logic test file per this project's own established convention (stated in `canonicalLot.test.ts`'s header comment).

**`npm run build`** — passed.
```
✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Generating static pages (39/39)
   Finalizing page optimization ...
   Collecting build traces ...
```
`/dashboard/cafe/add-lot` changed from 3.41 kB to 2.62 kB (172 kB First Load JS) — net smaller despite new logic, consistent with Next's per-build chunk-splitting reshuffle (several *unrelated, untouched* routes also shifted a few hundred bytes between this build and the 4.5.5 build, e.g. `/admin` 9.82→10.2 kB — normal build-to-build noise, not a code change, confirmed by `git diff` showing no changes to those files).

## 9. Regression

- **Creation wizard** (all 4 scenarios): `new/page.tsx` and `createCoffee`/`createGreenLot`/`createCanonicalLot` — zero diff this phase.
- **`public_id`**: `generatePublicLotId` and its 14 tests unmodified, still pass.
- **`green_lot_id`**: not referenced by `listAllCanonicalLotStatuses` or `isPublishedForOrdering` at all.
- **Reuse of one Green Lot by multiple Canonical Lots**: unaffected — nothing in this phase touches `green_lots` or the Green-Lot-scoped list functions.
- **Detail flow (4.5.3)** / **edit/update flow (4.5.4)**: `CanonicalLotChain.tsx`, `CanonicalLotStatusControl.tsx`, `[lotId]/edit/page.tsx` — zero diff this phase.
- **Roaster Dashboard**: `app/dashboard/roaster/page.tsx` — zero diff this phase (diff stat identical to the end of Phase 4.5.5).
- **Status display**: unaffected, same code as 4.5.5.
- **Coffee and Green Lot never change from any Canonical Lot operation**: `listAllCanonicalLotStatuses` is a pure `select` on `lots` only; no `update`/`insert` was added anywhere this phase.
- No direct Supabase writes were performed by this phase — only read-only `select` queries via the existing anon-key client. No curl/REST inserts, no service-role key, no test data created.

## 10. Residual limitations / architectural questions

- **Public Passport visibility gating** — not resolved, see §7. This is the primary open item from this phase.
- **`testing` status has no distinct behavior anywhere yet** — for café ordering, it is currently treated identically to `draft` (both simply "not `active`," both blocked). Whether a `testing`-status Lot should be café-orderable under some different rule (e.g. a pilot café allowed to test it while it's hidden from the general catalog) is a related, equally unresolved product question, out of scope for this pass.
- Carried forward, unchanged from prior reports: `app/dashboard/roaster/new/page.tsx`'s Phase 4.5.2 wizard and the `resolveRoasterUuid` slug/id fix remain uncommitted in the working tree (last real commit is still `74fdbef`); this phase added no commits.

## Stopping point

Phase 4.5.6 (Status & Visibility Gating) is implemented for café ordering and validated. The public Passport visibility question is recorded as a finding and a precise architectural fork, deliberately not resolved. **Phase 4.5.7 has not been started.**
