# Taste Intent Historical Link — Implementation

Implements the minimal solution approved in `TASTE_INTENT_HISTORICAL_LINK_AUDIT.md`
(Classification: B — Important). Follows the existing Roast Intent ↔ Roast
Batch pattern (`ROAST_BATCH_REFERENCE_LINK.md`), adapted for the one real
difference in write timing the audit identified: a guest's tasting is never
preceded by the roaster activating a profile in the same flow, so the write
path is a read-then-stamp at check-in time, not a reordered pair of writes.

## Write path

`checkins.reference_taste_profile_ref` (already existed, dormant, since
migration `0024`) is now populated at the exact moment a tasting is created.

- **`lib/data/canonicalLotStore.ts`** — two new functions, placed right
  after `findCanonicalLotByPublicId`:
  - `getActiveReferenceTasteProfile(lotUuid)` — the `reference_taste_profiles`
    row currently `active` for a lot, including its own `id` (unlike the
    roast-side equivalent, which never needed the id since
    `activateReferenceRoastProfile` already returns it directly).
  - `getReferenceTasteProfileById(id)` — one specific version by id,
    `active` or `superseded`, for the read path below.
  - Both are self-contained (their own `ActiveReferenceTasteProfile`
    interface, not reusing `activateTasteProfile`'s `ReferenceTasteProfileValues`)
    so this addition doesn't depend on any other in-flight, uncommitted work
    in this file.
- **`lib/journey/store.ts`** — new private `resolveActiveTasteProfileId(lotId)`:
  resolves the lot's public_id to its canonical uuid
  (`findCanonicalLotByPublicId`, the same lookup `cafeMenuStore.ts`'s
  `addLotToMenu` already uses for `lot_ref`), then reads whichever taste
  profile is active for it right now. Best-effort: any failure (no
  canonical row yet, no active profile yet, offline) resolves to `null`,
  identical to how every tasting recorded before this shipped will read.
- **`addTastingRecord()`** — the local save is still fully synchronous and
  unaffected. The reference lookup runs *before* the Supabase insert (not
  after, and not as a separate `UPDATE`), so a checkin never exists
  server-side even momentarily without its historical link. The lookup
  result is merged into whatever the *current* local record looks like at
  resolution time (not the original closed-over snapshot) — this matters
  because a fast anonymous→signup claim can re-tag the same record's
  `userId` before this lookup resolves, and the merge must never clobber
  that re-tagging.
- **`recordToRow()` / `rowToRecord()`** — now map
  `referenceTasteProfileId` ↔ `reference_taste_profile_ref` in both
  directions. `recordToRow` exported (previously module-private) so it has
  a direct unit test.
- **`claimAnonymousTastings()` — deliberately untouched.** It already
  spreads the full original record (`{ ...record, userId: realUserId }`)
  when re-owning a tasting, so `referenceTasteProfileId` carries through
  completely unchanged — no new logic was needed for "claim must not
  recompute the reference," it falls out of the existing spread.

## Read path

- **`components/coffee/TasteComparison.tsx`** — the version-selection rule
  is pulled into its own exported function, `resolveComparisonRoasterProfile(tasting, fallback, fetchById?)`,
  so the rule itself (not React's effect plumbing) is what's unit tested:
  if `tasting.referenceTasteProfileId` is set, fetch that exact version by
  id; otherwise, or if the fetch fails to resolve, use `fallback` (the
  lot's current active profile — `lot.roasterFlavorProfile`, unchanged from
  today). The component now holds `roasterProfile` as state, initialized to
  `lot.roasterFlavorProfile` and upgraded by an effect that calls this
  function — mirrors the exact `linkedId ? getById() : getActive()` shape
  already used for Roast Intent in `app/(site)/passport/[lotId]/page.tsx`.
- No change was needed to `app/(site)/passport/[lotId]/page.tsx` or
  `LotPassportModal.tsx` — both already pass `lot` and `tasting` straight
  through to `TasteComparison`, which now does its own version resolution
  internally.

## Version selection / fallback

| Case | Behavior |
|---|---|
| Tasting has `referenceTasteProfileId`, version still active | Renders that version (identical to today, since it's also the active one) |
| Tasting has `referenceTasteProfileId`, version since superseded | Renders the historically-correct (superseded) version, not today's active one |
| Tasting has no `referenceTasteProfileId` (pre-existing row, or lookup hadn't resolved yet) | Falls back to the lot's current active profile — identical to today's behavior for every tasting |
| Linked id fails to resolve (network error, row somehow gone) | Falls back to the lot's current active profile |

## Anonymous / authenticated behavior

Identical, by construction: both `addTastingRecord()` (direct/authenticated
save) and `claimAnonymousTastings()` (anonymous tastings re-owned at
signup) build their Supabase row via the same `recordToRow()`. Confirmed by
the live E2E below using a real authenticated session, and by the unit
tests' scenario E, which specifically exercises re-owning an anonymous
tasting across a Taste Intent version change.

## Community privacy

No change was made to `checkins_community_view` (migration `0026`) — it
already excludes `reference_taste_profile_ref` via its own explicit,
manually curated column list (`id, lot_id, brewing_method, rating, acidity,
sweetness, body, bitterness, liked, disliked, note, created_at`), same as
before this block. Re-confirmed by re-reading the migration; also, a
profile-version id points to the roaster's own public declared target, not
to any guest identity, so populating it carries no anonymity risk even in
principle.

## Backward compatibility

Every checkin recorded before this shipped has `reference_taste_profile_ref = null`
forever — no backfill was performed or attempted (migration `0024`'s own
comment explicitly forbids guessing a historical version for pre-existing
rows). These rows, and any future row whose lookup fails, render exactly as
they did before this block: today's active profile.

## Tests

New: `lib/journey/store.test.ts` (5 tests) and
`components/coffee/TasteComparison.test.ts` (4 tests). No jsdom or
`@testing-library/react` was added — `lib/journey/store.ts` only ever calls
`window.localStorage.getItem/setItem`, so a minimal in-memory stand-in
class is enough, and `resolveComparisonRoasterProfile` is a plain async
function tested directly without rendering the component. A minimal
`vitest.config.ts` was added (a bare `resolve.alias` for `@/*`, mirroring
`tsconfig.json`) — the project's one prior test file never needed it since
it only uses relative imports.

Store tests mock `@/lib/supabase/browserClient` and
`@/lib/data/canonicalLotStore` and cover the audit's Step 4 scenarios directly:

- `recordToRow` maps the field both ways, defaulting to `null`.
- **A** — a new tasting stamps the currently active version.
- **B/C/D** — one test: tasting → Taste Intent changes (v1 superseded, v2
  active) → second tasting; asserts the *first* tasting's insert still
  carries v1 and the *second* carries v2.
- **F** — a Lot with no canonical row yet (or no active profile) leaves the
  reference `null`.
- **E** — an anonymous tasting is recorded, Taste Intent changes, *then*
  `claimAnonymousTastings` runs; asserts the claimed insert still carries
  the *original* (v1) reference, not the now-active v2, and that `userId`
  is correctly re-owned.

`TasteComparison.test.ts` covers the read-side rule directly: falls back
with no linked id (including `undefined`, not just `null`), uses the
linked historical version even when it differs from the current active
profile, and falls back when the linked lookup fails. Scenario **G**
(Community anonymity) has no TS code path to exercise — it's verified by
re-reading the view's own column list (see above), not by a test.

## Build / test / type-check

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **23/23 passed** (14 pre-existing + 5 new in
  `store.test.ts` + 4 new in `TasteComparison.test.ts`).
- `npm run build` — succeeded, all 39 routes generated.

## Live E2E — real application, real Supabase, no raw INSERT, no service role

Ran the exact scenario requested (`Taste Intent v1 → tasting → Taste Intent
v2 → старый tasting = v1, новый tasting = v2`) against the actual local dev
server and the real Supabase project, entirely through the app's own UI —
signed in via the existing dev-only `signInAsPilotStaff` pilot-roaster
mechanism (`app/auth/actions.ts`, pre-existing, not created for this
block), never via any workaround:

1. **Lot used**: `LOT-XO-ETH-001` (canonical uuid `8c2670fe-b106-452b-88f3-0fe63854cdc6`),
   which already had one live active taste profile (v1, id `a5618db4-...`,
   values 4/5/3/1).
2. **Tasting #1**, via the real guest taste flow (`/passport/LOT-XO-ETH-001/taste`):
   saved successfully. Live read (authenticated fetch from the browser's
   own session, RLS-respecting — `checkins` select is `auth.uid() = owner_user_id`
   only, so the anon key alone cannot read it): `reference_taste_profile_ref = a5618db4-...` — **matches v1, exactly as it should.**
3. **Taste Intent changed**, via the real roaster dashboard
   (`/dashboard/roaster/LOT-XO-ETH-001/edit`, `activateTasteProfile`):
   sliders changed to 2/2/5/5 and saved. Live read confirms:
   `a5618db4-...` → `status: "superseded"`; new row `d7a01288-...` → `status: "active"`, values 2/2/5/5.
4. **Tasting #2**, via the same guest taste flow, same lot, after the
   change: saved successfully. Live read:
   `reference_taste_profile_ref = d7a01288-...` — **matches v2.**
5. **Re-verified tasting #1 was never touched**: still
   `reference_taste_profile_ref = a5618db4-...` after v2 was activated.

```
checkins (live, authenticated read):
  id f453f2b6-...  created 12:58:20  reference_taste_profile_ref = a5618db4-...  (v1, now superseded)
  id f5864427-...  created 13:12:45  reference_taste_profile_ref = d7a01288-...  (v2, active)

reference_taste_profiles (live, public read):
  a5618db4-...  version 1  status superseded  4.0/5.0/3.0/1.0
  d7a01288-...  version 2  status active      2.0/2.0/5.0/5.0
```

This is the decisive result: **старый tasting = v1, новый tasting = v2**,
confirmed against real, live data — not a mock, not an assumption.

## Files changed

- `lib/data/canonicalLotStore.ts` — two new functions (`getActiveReferenceTasteProfile`, `getReferenceTasteProfileById`).
- `lib/journey/store.ts` — new `resolveActiveTasteProfileId`; `addTastingRecord`'s insert chain rewritten to resolve-then-stamp; `recordToRow`/`rowToRecord` map the new field; `recordToRow` exported.
- `lib/types/coffee.ts` — `TastingRecord.referenceTasteProfileId?: string | null`.
- `components/coffee/TasteComparison.tsx` — new exported `resolveComparisonRoasterProfile`; component now version-aware.
- `lib/journey/store.test.ts`, `components/coffee/TasteComparison.test.ts` — new.
- `vitest.config.ts` — new (path-alias resolution only).

No SQL, no new migration (`checkins.reference_taste_profile_ref` already
existed per migration `0024` — confirmed live before writing any code, per
instruction), no RLS change, no change to `checkins_community_view`, no
change to `activateTasteProfile` itself, Roast Intent, Roast Batch, or any
other part of the Canonical Lot Architecture.

---

**STATUS: PASS**
**GIT: COMMITTED AND PUSHED** — see commit hash and push confirmation below (added after the commit/push actually completed).
