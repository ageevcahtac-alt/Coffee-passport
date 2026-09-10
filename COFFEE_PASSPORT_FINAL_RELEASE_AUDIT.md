# Coffee Passport — Final Release Audit

## 1. Executive Summary

This is the final technical checkpoint before release. It re-verifies every
finding and fix from the prior production-readiness audit
(`COFFEE_PASSPORT_PRODUCTION_READINESS_AUDIT.md`) against the current
committed code, builds a definitive ownership matrix across all 30
migrations, traces six concrete account-isolation attack scenarios end to
end, and proves the blind-tasting spoiler-protection rule holds for every
data class the Passport page fetches — not just the one already fixed.

**Zero new C-level (release-blocking) findings.** All 5 previously-fixed
security items were re-confirmed intact with file:line evidence. Two real,
narrow B-level gaps were found and fixed in this pass: one localStorage
store (the cupping journal) was missing from the account-switch data purge
list, and the purge function itself — the single guard against one
account's local data leaking to another on a shared browser — had zero
test coverage. Both are closed. Everything else audited is A (pass).

**STATUS: RELEASE READY WITH NON-BLOCKING NOTES.**

## 2. Release Scope

Guest → Auth → Anonymous data → Tasting → Blind Tasting → Community → Passport
Roaster → Coffee → Green Lot → Canonical Lot → Roast Profile → Taste Profile → Catalog → Passport
Café → Menu → Canonical Lot (read-only) → Signature Recipe → Availability → Public Shop
Public → QR → /scan → Passport → public-safe information

## 3. Architecture Baseline

Confirmed unchanged and respected throughout this pass: Coffee → Green Lot →
Canonical Lot (all Roaster-owned); café reads Canonical Lot, never writes it;
café-owned menu/availability/Signature Recipe; guest-owned tastings/recipes/
history; public = read-only/public-safe. Canonical Lot lifecycle
draft→testing→active→archived, `public_id` server-generated, café ordering
gate `in_roaster_catalog=true AND status='active'`, one Green Lot → many
Canonical Lots, `roast_batches` immutable, reference profiles
historical/versioned. No architectural decision was revisited without a
proven defect — none was found.

## 4. Ownership Matrix

Built from a full re-read of all 30 migrations, resolving every later
override to its FINAL live policy (e.g. 0013 superseding 0007's recursive
`profiles` policy, 0030 superseding 0017's `cafe_menu_entries` policy).

| Entity | Roaster | Café | Guest | Public/anon | Enforcement |
|---|---|---|---|---|---|
| `coffees` | S,I,U,D (own) | — | — | S | `is_roaster_staff_for` (0025) |
| `green_lots` | S,I,U,D (own) | — | — | S | `is_roaster_staff_for` (0025) |
| `lots` (Canonical Lot) | S,I,U,D (own) | — | — | S (all statuses — intentional, see §5) | `is_roaster_staff_for` (0025) |
| `reference_taste_profiles` | S,I,U,D (via lot's roaster) | — | — | S | 0025 |
| `reference_roast_profiles` | S,I,U,D (via lot's roaster) | — | — | S | 0025 |
| `roast_batches` | S,I only (immutable trigger) | — | — | S | 0025 + 0023 trigger |
| `cafe_menu_entries` | — | S,I(gated: lot active+in_catalog),U,D (own shop) | — | S | 0017/0030 |
| `recipes` (roaster/café/barista) | S,I,U,D (own org) | S,I,U,D (own org) | — | S (`is_public=true`) | 0007 |
| `recipes` (enthusiast) | — | — | S,I,U,D (own) | S (`is_public=true`) | 0005 |
| `checkins` | anonymized-only via `checkins_roaster_view` | own-shop full row (0007) | S,I,U,D (own) | opt-in only via `checkins_community_view` (0026) | 0005/0007/0026 |
| `equipment_garage`, `custom_brew_methods`, `shop_mute_preferences` | — | own (barista/café scoped) | S,I,U,D (own) | — | 0007/0016/0019 |
| `custom_coffee`, `custom_coffee_cuppings`, `recipe_votes`, `kitchen_recipes`, cupping journal | — | — | **client-only, localStorage, no Supabase table** | — | account-isolation via `reconcileUserScope` (§7) |
| `profiles` | own row | own row | own row only | none (no anon grant) | 0007/0012/0013 |
| `partner_requests` | — | — | — | I only (anon S/U dropped in 0028) | 0003+0028 |
| `coffee_shops` | — | S,U own | — | S | 0025 |
| `roasters` | S,U own | — | — | S | 0025 |

**No table found with RLS disabled. No `using(true)` write policy on any
owner-scoped entity** — every `using(true)` is either SELECT-only public
catalog read or the intentional public-insert lead capture on
`partner_requests`.

## 5. Security

**PASS.** Re-confirmed all 5 previously-fixed items with fresh evidence
against current code:
1. Pilot-staff sign-in gated by `NEXT_PUBLIC_PILOT_DEMO_ENABLED` (client +
   server), plus a DB-level `app_settings.pilot_demo_enabled` kill switch.
2. `partner_requests` anon read/update policies dropped (0028); admin CRM
   requires `SUPABASE_SERVICE_ROLE_KEY`.
3. Café ordering gate enforced in RLS on `cafe_menu_entries` INSERT (0030).
4. Every `next=`-driven redirect in the auth flow goes through
   `safeNextPath`.
5. Account isolation intact (see §7).

One item considered and deliberately left as-is: draft/testing Canonical
Lots and their reference profiles remain publicly SELECT-able
(`using(true)`, no status filter). Two independent passes (this one and the
prior block) confirm this is a deliberate product decision — roaster
preview links (`PHASE_4.5.7_REPORT.md`) — not an oversight. Tightening it
would break reviewed, working preview UX with no corresponding security
gain (no write access is granted, and a draft Lot has no printed QR code to
be discovered through).

## 6. RLS

Covered fully in §4/§5. No table lacks RLS; no policy grants a role write
access beyond its documented ownership; no stale permissive policy was
found actively widening access (the one confirmed-dead permissive policy,
legacy `public.reviews`/`review_replies` from migration 0004, has no live
code path calling it — `.from('reviews')` does not appear anywhere in the
app, which uses `checkins` exclusively since migration 0005+; left as a
documented cleanup item, not a release risk, since dead SQL with no callers
cannot be exploited through this application).

## 7. Authentication / Account Isolation

All six required scenarios traced end-to-end against current code:

- **A (anon → signup → claim → logout → different login) — PASS.**
  `lib/auth/currentUser.tsx` gives anonymous guests a structurally distinct
  `anon-<uuid>` id; every store filters strictly by `userId`/`ownerUserId`
  equality, so id-format alone prevents cross-boundary matches even before
  any purge runs. `reconcileUserScope` (see below) is defense in depth on
  top of that.
- **B (re-claim) — PASS.** `claimAnonymousData.test.ts` directly asserts
  idempotence and that Account B's claim never touches Account A's already-
  claimed data.
- **C (logout to anonymous) — PASS.** Same filter-at-read guarantee as A;
  `reconcileUserScope` intentionally no-ops on logout by design (documented
  rationale: avoids wiping a slow/offline resync's local cache).
- **D (Roaster A → Roaster B's data) — PASS.** RLS-blocked via
  `is_roaster_staff_for(roaster_id)`.
- **E (Café → Roaster-owned tables) — PASS.** Zero café/barista policy
  exists on `coffees`/`green_lots`/`lots`, confirmed by grep across all 30
  migrations; zero café-role code path calls a write on any of the three.
- **F (public → private data) — PASS** for `checkins` (anon has no
  privilege before RLS is even evaluated — `auth.uid()` is null) and
  `profiles` (no anon grant at all). Reference-profile public visibility is
  the same intentional item as §5.

**Fixed in this pass:** `lib/data/cuppingsStore.ts` (the enthusiast cupping
journal) was the one personal, shared-key localStorage store NOT included
in `reconcileUserScope`'s purge list — inconsistent with every sibling
store (journey, recipes, equipment, votes, kitchen recipes, custom coffee,
custom coffee cuppings, muted shops). Not exploitable today (its one reader
already filters by `userId`), but it would silently leak the moment any
future unfiltered consumer is added. Added `purgeCuppingsForUser` and wired
it into `reconcileUserScope`.

**Fixed in this pass:** `reconcileUserScope` itself — the single function
standing between two accounts' local data on a shared browser — had zero
test coverage anywhere in the 71-test suite. Added
`lib/journey/userScope.test.ts` (4 tests): account-switch purge, same-
account no-op, anonymous-transition no-op, and first-resolved-identity
no-op — covering every branch of the function.

## 8. Data Integrity

FK/constraint review re-confirmed correct (§6 of the prior audit, not
re-litigated): `RESTRICT` on the canonical chain, `SET NULL` on
history-preserving cross-references, append-only/versioned reference
profiles (equivalent to a snapshot since a historical FK's target is never
mutated in place, only superseded). `recipes.parent_recipe_id` confirmed
`ON DELETE SET NULL`. No café-role code path writes `lots`/`green_lots`/
`coffees` (grepped all `.from(...)` call sites — the only writers are three
functions in `lib/data/canonicalLotStore.ts`, called exclusively from
roaster-role pages).

## 9. Passport

**PASS.** Full QR→scan→Passport→tasting→history journey re-traced. Invalid/
missing/draft/archived-lot handling, public visibility, and the previously-
fixed full-table-fetch bug (now scoped to one `public_id`) all confirmed
current.

## 10. Blind Tasting

**PASS, with an explicit new check.** Confirmed `getCommunityTastingsForLot`
has exactly one call site, gated by `hasRevealedTasting`, with no other
pre-reveal code path reaching it. Additionally checked whether `roastIntent`/
`canonicalCoffee` — fetched unconditionally as soon as the Lot resolves, the
same "fetched before a reveal gate" shape as the original bug — constitute
an analogous spoiler leak. **Verdict: no.** `canonicalCoffee` is
origin/provenance data (country, region, farm, altitude, processing, crop
year) — already-established non-spoiler content per `BlindTastingLock`'s
own pre-reveal field list, which already renders it. `roastIntent` is
roasting-process data (machine, target curve, target Agtron) — not a
flavor-perception comparison. The actual flavor-perception content
(`TasteComparison`, built from `reference_taste_profiles`) and
`RoastIntentCard`'s rendering are both confined to the post-reveal branch
(or `isPreview` mode, a roaster/café self-preview, not a guest session).
This is a categorically different data class from the fixed bug, not a
second instance of it.

## 11. Community

**PASS.** Opt-in public checkins, anonymized view, and blind-tasting gating
confirmed consistent at both the UI and network-fetch level (§10).

## 12. Roaster

**PASS.** Scenario D (one Green Lot → several Canonical Lots) re-proven:
every mutation in `canonicalLotStore.ts` scopes by the Canonical Lot's own
uuid, never `green_lot_id`; no module-level cache keyed by `green_lot_id`
exists in either roaster create/edit page that could bleed state between
two sibling Lots' edit sessions.

## 13. Café

**PASS.** Confirmed structurally, not just via a prop flag: café's
`LotBuilderForm` render path has no reachable `onSave` — `handleSubmit`
exits before calling it when `readOnly` is set, and no `onSave` prop is
even passed from the café edit page. A café cannot create a local shadow of
Canonical Lot data under any code path.

## 14. Anonymous Claim

**PASS.** Idempotence and cross-account isolation on re-claim directly
tested (§7, Scenario B). No change from the previous block.

## 15. Reliability

**PASS.** The previously-fixed optimistic-save/rollback bug, catalog-toggle
in-flight guard, café-menu write serialization, and double-submit guards
were all re-confirmed present and unmodified in current code.

## 16. Performance

**PASS.** Both previously-fixed hot-path bugs re-confirmed fixed:
`syncLotsFromSupabase(publicId?)` still scopes the Passport page's fetch to
one row; `RoasterSupplyMapWidget` still uses the single bulk
`syncCafeMenuEntriesForLots` call, not a per-shop loop. One new,
non-blocking observation: `brewingRecipesStore.ts`'s
`syncRecipesFromSupabase` fetches every public recipe system-wide with no
limit. At current pilot scale (a handful of roasters/cafés) this is not a
real risk; documented as a future-scaling note, not a release blocker — a
realistic growth path exists but hasn't been reached, and pagination here
is a UI-level change (a "load more" affordance) that belongs with the
already-documented, similarly-scoped `checkins_roaster_view` pagination
note from the prior audit, not bundled into this block.

## 17. Accessibility

**PASS for every release-critical journey.** Blind tasting start, location
selection, and the taste-flow's step navigation all use real interactive
elements (`<Link>`, `<button>`) with native keyboard support. The two
previously-documented minor gaps (no Escape-to-close on two modals, one
icon-only button missing `aria-label` in `RoastProfileForm`) are unchanged
and confirmed to not sit on any required-field or required-action path —
non-blocking.

## 18. Routes

**PASS.** Full inventory (44 routes) re-checked: no new orphan/dead route;
`/coffee/[id]` confirmed still intentionally linked from
`LegacyLotCreator.tsx`; no `/dashboard` members scaffold exists.

## 19. Environment / Deployment

**PASS.** No service-role key in any client/browser file; `render.yaml`
carries the pilot-demo flag and service-role key as private env vars; no
hardcoded secrets found.

## 20. Tests

**71 → 75.** New coverage this pass: `lib/journey/userScope.test.ts` (4
tests) covering the account-switch purge guard, its no-op branches, and —
via the fix in §7 — the cupping journal's inclusion in that purge. All 75
tests pass; no test was added to pad the count — each maps directly to a
release-risk-sensitive invariant that was previously unverified.

## 21. Findings

**A (PASS):** Architecture baseline, ownership matrix (all entities), RLS
(no disabled table, no over-broad write policy), all 6 account-isolation
scenarios, data integrity/FK behavior, Passport journey, blind-tasting
spoiler protection (including the new roastIntent/canonicalCoffee check),
community, roaster Scenario D, café read-only enforcement, anonymous claim,
reliability fixes, the two previously-fixed performance bugs, release-
critical accessibility, routes, environment/secrets.

**B (2 found, both fixed in this pass):**
1. `lib/data/cuppingsStore.ts` missing from `reconcileUserScope`'s purge
   list — fixed (`purgeCuppingsForUser` added and wired in).
2. `reconcileUserScope` had zero test coverage — fixed
   (`lib/journey/userScope.test.ts`, 4 tests).

**B (non-blocking, documented, not fixed in this pass — none release-risk-
sensitive enough to justify expanding scope):**
- Dead legacy `reviews`/`review_replies` permissive policy (no live caller).
- `brewingRecipesStore`'s unbounded recipe select (real future-scaling
  note, not a current risk).
- Two minor, non-critical-path accessibility gaps (carried from the prior
  audit, unchanged).
- draft/testing Lot public visibility (confirmed intentional, twice).

**C: 0.**

## 22. Fixes Implemented

1. `lib/data/cuppingsStore.ts`: added `purgeCuppingsForUser`.
2. `lib/journey/userScope.ts`: wired the new purge into
   `reconcileUserScope`.
3. `lib/journey/userScope.test.ts`: new file, 4 tests covering every branch
   of the account-switch purge guard.

No architecture was changed. No previously-closed block was reopened or
weakened.

## 23. Remaining Non-Blocking Notes

See §21's second B list. None block release: each is either dead code with
no live exploit path, a documented future-scaling item with no current
realistic trigger, or a cosmetic accessibility gap outside every critical
journey.

## 24. Release Decision

**STATUS: RELEASE READY WITH NON-BLOCKING NOTES**

Zero release-blocking (C) findings. The two B-level gaps found in this pass
were both fixed (not deferred) because they were safe, narrow, and directly
reinforced an already-established security pattern without requiring a new
architectural program. The B items left open are genuinely non-blocking —
none permit unauthorized access, data loss, cross-account leakage, or
incorrect historical data.

TypeScript: PASS. Build: PASS. Tests: 75/75 PASS. Browser: NOT RUN (standing
project instruction, not a blocker) — compensated by the RLS/schema audit,
code-level tracing of all six account-isolation scenarios, and the expanded
test suite.
