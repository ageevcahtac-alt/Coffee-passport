# Phase 4.5.7 — Public Passport / QR Lifecycle

## 1. Objective

Phase 4.5.6 deferred one question: what should the public Passport (`/passport/[lotId]`, reached via `/scan`, a saved link, or a printed QR) do for a Lot whose `status`/`in_roaster_catalog` isn't simply "active and in-catalog"? This phase's job: audit the actual flow, separate **discoverability**, **persistence**, and **history** (they are not the same question), and decide — using only the existing model — whether a safe, minimal rule exists.

## 2. Audit — actual current behavior (before any change)

### 2.1 Where `public_id` is used for public access

- `app/(site)/passport/[lotId]/page.tsx` — `params.lotId` is matched by exact string equality against `lots.find(candidate => candidate.id === params.lotId)`, where `lots` comes from `useLots()` (seed + localStorage + `syncLotsFromSupabase()` overlay). `lot.id` **is** the `public_id` (`rowToLot` in `lib/data/lotsStore.ts` sets `id: row.public_id`).
- `app/(site)/scan/page.tsx` — same exact-match lookup, then `router.push('/passport/${lot.id}')`. No independent gating; it's a pure lookup-and-redirect.
- `app/dashboard/roaster/page.tsx`'s `handleDownloadPdf` — generates a QR **for any Lot in the roaster's own list, unconditionally**, encoding `${origin}/passport/${lot.id}`. This is confirmed by reading the button: no `disabled` condition tied to `status` or `inRoasterCatalog` at all. **This is the one real, reachable path by which a guest could receive a QR for a not-yet-`active` Lot** — a roaster can download/print a QR for a `draft` Lot today.
- `lib/utils/lotId.ts`'s `extractLotId` — accepts either a bare code or a full passport URL/path (for pasted links or QR payloads), feeding both `/scan` and `app/dashboard/cafe/add-lot/page.tsx`'s manual-code entry. No gating logic here either — pure string extraction.

### 2.2 Does a public Lot-listing/browse page exist?

No. Grepped the whole `app/(site)` and public-facing tree: there is no "browse all active coffees" gallery for guests. A guest only ever reaches a specific Lot's passport by (a) scanning/typing a code they were physically handed (a café's printed menu/bag, or a roaster's own QR), or (b) a direct link/QR someone shared with them. **Discoverability of a brand-new Lot is therefore never an independent surface of the Passport page itself** — it is entirely downstream of who was handed a QR/code, which for the café-served path is already the Phase 4.5.6 gate (`in_roaster_catalog=true AND status='active'` — a café can only ever add such a Lot to its menu in the first place).

### 2.3 Existing `status`/`in_roaster_catalog` checks on the Passport page

Before this phase: **none**. Confirmed by reading the full file (326 lines) end to end and grepping both terms — zero matches for either, prior to this phase's change.

### 2.4 What happens for an unknown/never-existed `public_id`

`!lot` → a plain "Лот не найден" not-found screen (unchanged, untouched this phase). This has nothing to do with status/archival — it's the pre-existing behavior for any id that was never in the merged cache at all (a typo, a fabricated code).

### 2.5 What happens for an archived/inRoasterCatalog=false Lot's already-issued `public_id`

Traced the data path precisely:

- `syncLotsFromSupabase()` (`lib/data/lotsStore.ts`) only ever **adds or overlays** entries into the merged cache from a Supabase `select` — it never removes an entry, regardless of `status` or `in_roaster_catalog`.
- No `.delete()` call against the `lots` table exists anywhere in the codebase (`createCanonicalLot`, `updateCanonicalLotFields`, the migration script — all insert/update only). Grepped explicitly to confirm.
- `lot.id` (the `public_id`) has been immutable through every phase so far (4.5.1–4.5.6), and remains untouched by this phase too.

**Conclusion: PERSISTENCE already holds structurally, by omission — nothing in the current codebase can make a previously-valid `public_id`/QR stop resolving to *some* Lot record, regardless of `status` or `in_roaster_catalog` value.** This is not new code; it is the existing, correct behavior, confirmed by full-path tracing.

### 2.6 Existing saved tasting sessions / guest records tied to a Lot

- `journey` (`useJourney()`, guest-local tasting records) — matched purely by `record.lotId === lot.id` (the `public_id`), with no status/catalog check anywhere in `passport/[lotId]/page.tsx`'s existing `shopTastings`/`latestTasting` logic.
- `checkins` (Supabase) — `lot_id: string` (the same stable text id) plus an optional `lot_ref` canonical FK (`supabase/migrations/0024_canonical_lot_fk_columns.sql`), neither of which is affected by a `lots` row's `status` or `in_roaster_catalog` column changing.

**Conclusion: HISTORY already holds structurally too — an existing tasting record is looked up purely by the immutable `public_id`, with no status/catalog filter anywhere in that lookup path.** Also existing, correct, unchanged behavior.

## 3. The actual gap, precisely

Everything except one narrow case was already correct by construction. The one gap: **a guest who is handed a `draft`-status Lot's QR (a real, reachable case — see §2.1) and has never tasted it before can, today, walk straight into a brand-new blind tasting for a Lot the roaster's own tooling describes as having "no finalized profile yet"** (`createCanonicalLot`'s own comment). This risks a broken or nonsensical guest experience (e.g. no reference taste profile to compare against) — the one place `status` should matter for the Passport page but currently doesn't.

## 4. Decision — discoverability / persistence / history, kept separate

| Concept | Question | Verdict |
|---|---|---|
| **A. Discoverability** | Can a guest treat this Lot as a current, orderable coffee and start something new? | Gated **upstream**, at the point a café can add it to a menu (Phase 4.5.6: `in_roaster_catalog=true AND status='active'`). On the Passport page itself, narrowly extended this phase: a guest may not **start a brand-new tasting** for a `draft`-status Lot (§5). `testing`/`archived`/`active` remain unrestricted for starting a new tasting — see §6 for why. |
| **B. Persistence** | Does an already-issued `public_id`/QR keep resolving to something? | Already true, unconditionally, for every status/catalog value. **Not changed this phase** — confirmed correct by audit (§2.5), no code needed. |
| **C. History** | Does an existing saved tasting/checkin stay viewable? | Already true, unconditionally — the `latestTasting` lookup is never gated by status, at any value, including `draft`. **Not changed this phase, and deliberately never gated by this phase's new check either** (§5 explicitly only touches the `!latestTasting` branch). |

This directly follows the task's core principle: archiving/status changes must never destroy history, and they don't — because history was never looked up through `status` or `in_roaster_catalog` in the first place.

## 5. What was implemented

**`app/(site)/passport/[lotId]/page.tsx`**:
- New state `canonicalStatus`, populated via `findCanonicalLotByPublicId(lot.id)` (Phase 4.5.1's existing function — no new data-access code needed), the same self-contained per-page fetch pattern already used in `CanonicalLotStatusControl` (4.5.4) and the roaster dashboard (4.5.5).
- The `!latestTasting` branch (i.e., the "no saved tasting yet — offer to start one" branch, which renders `BlindTastingLock`) now checks `canonicalStatus === 'draft'` first. If true, renders a plain "обжарщик ещё готовит паспорт этого лота" notice instead of `BlindTastingLock` — no `Link` to `/passport/[lotId]/taste` is ever rendered in this state, so the blind-tasting flow is simply unreachable through the normal navigation path.
- Everything else on the page — the `!lot` not-found screen, `isPreview` mode, `LocationStep`, and the entire `latestTasting`-found branch (full passport + history + recommendations) — is **completely unmodified**, confirmed by `git diff` showing zero removed lines in the file.

## 6. What was deliberately NOT implemented, and why

- **`testing` status is not restricted for starting a new tasting.** No code or comment anywhere states whether `testing` means "internal QA only" or "soft-launch, real guest feedback wanted" — these have opposite implications for whether a guest should be allowed to start a tasting. Guessing either way risks being wrong about a real product intent. Left exactly as `active` behaves (unrestricted), which is the same choice Phase 4.5.6 made for the identical ambiguity.
- **`archived` status is not restricted for starting a new tasting.** By direct analogy with `in_roaster_catalog`'s own documented, already-established non-cascade principle ("shelf inventory can outlive the roaster's own catalog entry") — a café could still be physically serving remaining stock of an Lot the roaster has since archived from active production. Blocking a fresh tasting purely because of `status='archived'` would contradict a precedent this project has already deliberately chosen for the conceptually adjacent `in_roaster_catalog=false` case.
- **`in_roaster_catalog` is not used as a Passport gate at all**, for either discoverability or anything else — this was the explicit hard constraint from both this phase and Phase 4.5.6's own finding, and remains correct: its own doc comment exists specifically to protect an already-served consumer, which is exactly who lands on this page.
- **`/passport/[lotId]/taste` (the tasting-entry sub-route itself) was not independently gated.** The only realistic path to it is the `Link` inside `BlindTastingLock`, which this phase's change already prevents from ever rendering for a `draft` Lot. A guest who somehow already had that exact sub-URL bookmarked from a prior session is a materially more contrived edge case, and gating it would require duplicating this same fetch in a second file for a case with no realistic trigger — noted as a residual limitation (§10), not fixed.

**No new architecture, entity, table, or migration was introduced.** The rule uses only the existing `status` column, the existing `LotStatus` type, and one existing data-access function.

## 7. Exact changed files

- `app/(site)/passport/[lotId]/page.tsx` — modified (+45 lines, **0 removed**, confirmed by `git diff | grep '^-'` producing no output)

**Not touched this phase** (confirmed identical diff stats to the end of Phase 4.5.6): `lib/data/canonicalLotStore.ts`, `app/dashboard/cafe/add-lot/page.tsx`, `app/dashboard/roaster/page.tsx`, `app/dashboard/roaster/[lotId]/edit/page.tsx`, `app/dashboard/roaster/new/page.tsx`, `components/roaster/LotBuilderForm.tsx`, `components/roaster/CanonicalLotChain.tsx`, `components/roaster/CanonicalLotStatusControl.tsx`, `app/(site)/scan/page.tsx`, `app/(site)/passport/[lotId]/taste/page.tsx`, `components/coffee/BlindTastingLock.tsx`, any migration, `Coffee`/`Green Lot` tables and their data-access functions.

## 8. Validation

**`npx tsc --noEmit`** — passed. No output, no errors.

**`npx vitest run`** — passed.
```
✓ lib/server/canonicalLot.test.ts (14 tests) 22ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```
No new test added — the new logic is a single status-equality branch inside a page component reading already-covered store functions (`findCanonicalLotByPublicId`, unmodified since Phase 4.5.1), consistent with this project's established convention of unit-testing only pure domain logic.

**`npm run build`** — passed.
```
✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Generating static pages (39/39)
   Finalizing page optimization ...
   Collecting build traces ...
```
`/passport/[lotId]` grew from 10.8 kB to 10.9 kB (206 kB First Load JS, was 204 kB) — the new fetch + branch. No route added or removed.

## 9. Regression

- **Creation wizard**, **`public_id` generation**, **`green_lot_id`**, **reuse of one Green Lot by multiple Canonical Lots**: `lib/data/canonicalLotStore.ts` and `app/dashboard/roaster/new/page.tsx` — zero diff this phase (confirmed, §7).
- **Detail flow (4.5.3)** / **edit/update flow (4.5.4)**: `CanonicalLotChain.tsx`, `CanonicalLotStatusControl.tsx`, `[lotId]/edit/page.tsx` — zero diff this phase.
- **Roaster Dashboard (4.5.5)**: `app/dashboard/roaster/page.tsx` — zero diff this phase.
- **Café ordering (4.5.6)**: `app/dashboard/cafe/add-lot/page.tsx` — zero diff this phase; its `isPublishedForOrdering` rule is untouched.
- **Existing public Passport/QR flows**: the not-found screen, preview mode, location-step gate, and — critically — the entire "guest already has a saved tasting" branch (full passport, history, recommendations, extraction/roasting tabs) are byte-for-byte unmodified (confirmed: zero removed lines in the whole file's diff). Only the never-tasted-before + `draft`-status combination now renders differently; every other status value in that same branch renders exactly as before.
- **Coffee and Green Lot**: not referenced by this phase's change at all — it reads one `lots` row via an unmodified existing function and touches no other table.
- No direct Supabase writes were performed by this phase — only the existing, unmodified `findCanonicalLotByPublicId` read. No curl/REST inserts, no service-role key, no test data created.

## 10. Residual architectural questions

- **What `testing` and `archived` should mean for a *brand-new* guest tasting** remains genuinely undecided (§6) — this phase deliberately left both unrestricted rather than guess. A future phase could resolve this with actual product input; until then, both behave exactly like `active` for this one narrow "start a new tasting" decision point.
- **`/passport/[lotId]/taste` has no independent status check** (§6) — relies entirely on the Passport page never linking to it for a `draft` Lot. A guest with a stale bookmark to that exact sub-URL from before a status change is a known, disclosed, low-probability gap, not fixed here.
- **The roaster's own QR-download button is still unconditional** for any status. This phase treated that as the *cause* of the one real gap it closed (rather than a second thing to fix) — restricting when a roaster may generate/download a QR at all would be a UI change to `app/dashboard/roaster/page.tsx`'s existing, working `handleDownloadPdf`, arguably a different (and arguably backwards — a roaster should probably be free to preview/share their own draft QR internally) decision than gating what a *guest* can do with it. Left exactly as-is.
- Carried forward, unchanged from prior reports: `app/dashboard/roaster/new/page.tsx`'s Phase 4.5.2 wizard remains uncommitted in the working tree (last real commit is still `74fdbef`); this phase added no commits.

## Stopping point

Phase 4.5.7 (Public Passport / QR Lifecycle) is implemented and validated: persistence and history were confirmed already-correct by full-path audit (no code change needed), and one real, narrow discoverability gap (`draft`-status Lots startable as new tastings) was closed. The `testing`/`archived` new-tasting question remains an open, explicitly-flagged product decision. **Phase 4.5.8 has not been started.**
