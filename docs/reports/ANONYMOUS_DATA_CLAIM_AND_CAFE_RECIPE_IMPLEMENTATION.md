# Anonymous Data Claim & Café Signature Recipe Lifecycle — Implementation

Closes both Category B findings from `COFFEE_PASSPORT_FULL_APPLICATION_E2E_AUDIT.md`
in one block: (1) the anonymous→authenticated claim gap beyond tastings,
and (2) the missing café Signature Recipe edit/delete UI. Also resolves
the audit's minor orphan-route finding (one route deleted, one corrected
from "orphaned" to "retained" — see §8).

## 1. Executive Summary

Both Category B findings are closed. The anonymous→authenticated claim
mechanism (previously `claimAnonymousTastings` alone) is now
`claimAnonymousUserData`, an orchestrator that claims tastings plus seven
sibling personal, userId-scoped local stores — the actual count found by
re-deriving the list from `lib/journey/userScope.ts`'s own purge list
(the audit's "5 sibling stores" undercounted; the real number is seven:
recipes, equipment, kitchen recipes, custom coffee, custom coffee
cuppings, recipe votes, and muted shops). Café Signature Recipe now has a
full create/read/update/delete UI, reusing the exact edit/delete pattern
already shipped and working for barista recipes, with no changes to
`ProRecipeForm`/`SignatureRecipeForm`/RLS — both already supported this;
only the café dashboard's own page was missing the wiring. The dead
`/dashboard` (members) scaffold is deleted; `/coffee/[id]` is **retained**
— the original full audit's "zero inbound links" claim for it was wrong
(see §8) and is corrected here.

21 new/updated automated tests pass, `tsc --noEmit` is clean, and
`next build` succeeds. No RLS policy, schema, or migration was touched —
none needed changing.

## 2. Anonymous Data Claim Architecture

`lib/journey/claimAnonymousData.ts` exports `claimAnonymousUserData(anonUserId, realUserId)`,
called from `lib/auth/currentUser.tsx`'s `CurrentUserProvider` effect at
the exact moment `authUserId` first becomes non-null (replacing the old
direct call to `claimAnonymousTastings`). It fans out to eight per-store
claim functions via `Promise.allSettled`:

```
claimAnonymousTastings           (lib/journey/store.ts — pre-existing, untouched)
claimEnthusiastRecipesForUser    (lib/data/brewingRecipesStore.ts)
claimEquipmentForUser            (lib/data/equipmentStore.ts)
claimKitchenRecipesForUser       (lib/data/kitchenRecipesStore.ts)
claimCustomCoffeeForUser         (lib/data/customCoffeeStore.ts)
claimCustomCoffeeCuppingsForUser (lib/data/customCoffeeCuppingsStore.ts)
claimVotesForUser                (lib/data/recipeVotesStore.ts)
claimMutedShopsForUser           (lib/data/shopMutePreferencesStore.ts)
```

Each store owns its own claim function — the same design
`lib/journey/userScope.ts` already uses for its own per-store purge
functions, since only a store itself can safely reach into its own
private cache/localStorage key. Every claim function is declared `async`
(even the ones with no `await` inside), specifically so a synchronous
throw inside one becomes a rejected promise rather than a thrown
exception — this is what lets `Promise.allSettled` actually isolate one
store's failure from every other store's claim (see §5).

The general contract every claim function follows (mirroring
`claimAnonymousTastings`, already audited and live-E2E-verified in an
earlier block): re-tag the local cache first (a plain array `.map`, in
place, never a delete-then-insert), which is always available and always
succeeds; then attempt a best-effort Supabase write of the newly-owned
rows, for whichever stores have a backend table, catching and logging any
failure without touching the already-applied local state.

## 3. Store-by-Store Matrix

| Store | Contains User Data | Anonymous Scope | Auth Scope | Should Claim | Current Claim (before) | Action |
|---|---|---|---|---|---|---|
| `journey` (tastings/check-ins) | Yes | Local, keyed by anon id | Supabase `checkins`, RLS `auth.uid()=owner_user_id` | Yes | Already claimed (`claimAnonymousTastings`) | None — untouched, already correct |
| `brewing-recipes` (enthusiast recipes) | Yes | Local only — `owner_user_id` is uuid+RLS-gated, anonymous insert always fails | Supabase `recipes` | Yes | Not claimed | **Added** `claimEnthusiastRecipesForUser` |
| `equipment` (Garage) | Yes | Local only — same uuid+RLS gate as recipes | Supabase `equipment_garage` | Yes, with conflict guard (singleton per user) | Not claimed | **Added** `claimEquipmentForUser` |
| `kitchen-recipes` (Coffee Kitchen) | Yes | Local only — no backend table | None | Yes | Not claimed | **Added** `claimKitchenRecipesForUser` |
| `custom-coffees` (Coffee Kitchen shelf) | Yes | Local only — no backend table | None | Yes | Not claimed | **Added** `claimCustomCoffeeForUser` |
| `custom-coffee-cuppings` | Yes | Local only — no backend table | None | Yes | Not claimed | **Added** `claimCustomCoffeeCuppingsForUser` |
| `recipe-votes` | Yes (one vote per recipe is a real preference) | Local only — no backend table | None | Yes, with dedupe (one vote per recipe/user) | Not claimed | **Added** `claimVotesForUser` |
| `muted-shops` | Yes (opt-out preference) | Local only while anonymous — remote write only attempted `if (isAuthenticated)` | Supabase `shop_mute_preferences` | Yes, with dedupe (one mute per shop/user) | Not claimed | **Added** `claimMutedShopsForUser` |
| `active-user` (`ACTIVE_USER_KEY`) | No — bookkeeping only | n/a | n/a | No | n/a | Not a data store; tracks which real account owns the local cache for `reconcileUserScope`'s own purge, unrelated to claiming |
| `custom-devices` / `custom-brew-methods` (roaster/barista submitted device & method catalog) | No — shared catalog entries pending approval, not personal history | n/a | n/a | No | n/a | Explicitly excluded — not personal to an anonymous browsing session; nothing here is authored anonymously in the first place |

No store was claimed "to make the number look complete." Two candidates
were explicitly evaluated and excluded: `ACTIVE_USER_KEY` is pure
bookkeeping, not user content; the device/brew-method submission catalogs
are roaster/barista-authored, never anonymous-guest-authored, so they were
never in scope for this gap.

## 4. Account Isolation

Verified in `lib/journey/claimAnonymousData.test.ts`'s
`"account isolation: claiming for Account B never touches data already
owned by Account A"` test: seeding one record under a different real
account's id (`OTHER_REAL`) alongside an anonymous record, then claiming
for `REAL`, confirms the `OTHER_REAL` record is completely untouched while
only the anonymous one moves.

The device-level scenario from the task spec —
`Anonymous → Signup → Claim → Account A → Logout → Account B` — is
guaranteed by two independent, already-correct mechanisms working
together, neither of which this task modified:

- Each claim function only ever matches records tagged with the exact
  `anonUserId` passed in, which `lib/auth/currentUser.tsx` always reads
  fresh from this device's own `ANON_ID_KEY` right as authentication
  happens — never a stored/previous render's value, never another
  device's id.
- `reconcileUserScope` (`lib/journey/userScope.ts`, untouched) purges the
  **previous real account's** local cache (across all eight stores, plus
  `journey`) the moment a **different** real account signs in on the same
  device — so by the time Account B's claim runs, Account A's already-claimed
  data has already been cleared from local view (it lives safely in
  Supabase for the Supabase-backed stores; for the four local-only Coffee
  Kitchen/votes stores, see the pre-existing risk noted in §9).

## 5. Failure / Retry Safety

- **Idempotent**: every claim function's local re-tag makes the anonymous
  tag disappear from the store in the same synchronous `write()` call — a
  second call for the same `(anonUserId, realUserId)` finds nothing left
  to claim and returns immediately. Verified directly in
  `claimAnonymousData.test.ts`'s idempotency test (claims twice, asserts
  no duplication).
- **No destructive clear-before-write**: every store re-tags in place
  (`.map`), never deletes-then-recreates. A page reload or app crash
  between the local write and the (separate, later) Supabase attempt
  leaves the local cache already correctly claimed either way.
- **Partial failure**: `Promise.allSettled` plus every claim function
  being declared `async` means one store's Supabase rejection can never
  prevent another store's claim from running — verified directly in the
  `"one store failing to sync to Supabase never blocks another store's
  claim"` test, which forces the `recipes` insert to fail and confirms
  `kitchen-recipes` still claims successfully in the same call.
- **No duplicates on conflict**: two stores have a real uniqueness
  invariant the naive "just retag everything" approach could violate —
  `recipeVotesStore` (one vote per `(recipe, user)`) and
  `shopMutePreferencesStore` (one mute per `(shop, user)`). Both drop the
  anonymous duplicate and keep the already-authenticated record when a
  conflict exists, rather than ever producing two rows for the same pair
  — verified in their own dedicated tests.
- **Singleton conflict (equipment)**: `equipmentStore` holds one Garage
  row per owner. If the authenticated account already has its own Garage
  entry on this device, the anonymous one is left unclaimed rather than
  silently overwriting already-owned authenticated data — verified in
  `"never overwrites an already-owned authenticated Garage with the
  anonymous one"`.

## 6. Café Signature Recipe CRUD

`app/dashboard/cafe/[lotId]/edit/page.tsx` now wires the full lifecycle,
reusing components already shipped for barista recipes with zero changes
to any of them:

- **Create**: unchanged (`addBrewingRecipe`, via `SignatureRecipeForm`).
- **Read**: unchanged (`useBrewingRecipes()` filtered to this café's own
  `coffee_shop`-authored rows for this Lot).
- **Update**: new — clicking "Редактировать" on a `RecipeCard` opens
  `SignatureRecipeForm` pre-filled via its existing `initialRecipe` prop
  (already supported, just never reached from this page), and the page's
  new `handleSaveRecipe` routes to `updateBrewingRecipe` instead of
  `addBrewingRecipe` when editing — mirroring
  `app/dashboard/barista/page.tsx`'s `handleSave` exactly.
- **Delete**: new — `handleDeleteRecipe` requires two clicks (an inline
  "Нажмите «Удалить» ещё раз, чтобы подтвердить" confirmation state, not a
  native `confirm()` dialog, consistent with this app never using native
  browser dialogs anywhere else) before calling `deleteBrewingRecipe`.

`RecipeCard`'s existing `isOwnBarista` prop (already used exactly this
way for barista's own recipes) is reused unchanged to mark these as the
viewer's own — no new prop, no fork of the component.

## 7. Recipe Ownership / RLS

No RLS policy was changed — none needed to be. `0007_staff_profiles_rls.sql`'s
`"staff manage own org recipes"` policy already covers `cafe_admin`
against `coffee_shop`-authored rows with `for all` (insert/update/delete
all already permitted, scoped by `profiles.cafe_id = recipes.author_id`).
This was already proven correct in production by the identical barista
flow; this task only added the missing app-level UI to reach the
already-authorized `updateBrewingRecipe`/`deleteBrewingRecipe` functions.
Verified directly (not assumed) in
`lib/data/brewingRecipesStore.test.ts`'s two "wrong café blocked" tests:
when the mocked Supabase client returns an RLS-rejection error, local
state is provably left unchanged (the recipe keeps its old value / is not
removed) — the app never applies a write the database rejected.

Delete safety: `recipes.parent_recipe_id references public.recipes(id)
on delete set null` (`0005_recipes_equipment_checkins.sql`) is a real
database-level guarantee, not an application convention — deleting a
café's signature recipe can never cascade into or corrupt an enthusiast's
own "Адаптировать под себя" copy of it; that copy just loses its
`parentRecipeId` pointer. A hard delete (the pre-existing
`deleteBrewingRecipe`, unchanged) is therefore the architecturally correct
choice, not a new soft-delete scheme — confirmed by reading the migration,
not assumed.

Canonical Lot / roaster-owned data is untouched by any of this: the café
edit page's `LotBuilderForm` stays `readOnly` (unchanged from the
Café Lot Edit Ownership block), and none of the recipe functions write to
`lots`/`coffees`/`green_lots`.

## 8. Orphan Routes

Both routes flagged as "orphaned" in the full application audit were
re-verified from scratch in this task (not re-assumed from that report):

- **`app/dashboard/(members)/*` (layout, root page, `coffees`, `qr`) — DELETED.**
  Its own gate (`select * from roaster_members`) can never succeed:
  nothing in the entire codebase ever inserts into `roaster_members`
  (confirmed by repo-wide grep), so every visit permanently dead-ends on
  "No roaster access." Zero inbound `Link`/`redirect`/middleware
  references from anywhere outside its own directory (confirmed by grep).
  Genuinely dead, safe to remove — removed.
- **`app/coffee/[id]` — RETAINED. The original full audit was wrong to
  call this orphaned.** `components/admin/LegacyLotCreator.tsx` — rendered
  on the real, HTTP-Basic-gated `/admin` page (`app/admin/page.tsx`) —
  builds a QR code pointing at `/coffee/${cleanId}` after inserting into
  `coffee_lots`. That component's own comment explicitly says it was
  deliberately left in place in an earlier block ("Left as-is since
  fixing/removing it wasn't part of this task"), and `coffee_lots` is a
  real pre-migrations table still referenced by FK from
  `0004_taste_profile.sql`. Deleting `/coffee/[id]` would have broken this
  still-intentionally-retained admin tool's own generated links. This is
  corrected here rather than repeated as a second false "orphaned"
  finding.

## 9. Regression

No RLS, schema, or migration changed. No file outside the anonymous-claim
and café-recipe surfaces was modified. Specifically re-checked, unchanged:

- **Identity**: signup/login/`next`/logout flow, `reconcileUserScope`'s
  own account-switch purge — untouched; `claimAnonymousUserData` is a
  strict superset of the prior single `claimAnonymousTastings` call, same
  call site, same timing.
- **Community**: private/public check-in visibility, `checkins_community_view`'s
  column scope — untouched, no code path here touches `checkins` beyond
  the pre-existing, unmodified `claimAnonymousTastings`.
- **Taste Intent**: `reference_taste_profile_ref` stamping — untouched;
  `store.test.ts`'s existing 5 tests for this still pass unmodified.
- **Passport / Canonical Lot / Roaster / Café menu lifecycle**: no file in
  any of these paths was touched.
- **Barista recipes**: `RecipeCard`, `ProRecipeForm`, `BaristaRecipeForm`,
  `app/dashboard/barista/page.tsx` — none modified; the café page now
  follows the identical pattern but through its own separate call sites.

One pre-existing, out-of-scope risk was noted but deliberately **not**
fixed here, since it is unrelated to the anonymous→authenticated claim
gap this task closes: `reconcileUserScope`'s account-to-account SWITCH
purge (a different mechanism from claiming) permanently deletes the
outgoing account's local-only Coffee Kitchen data (`kitchen-recipes`,
`custom-coffees`, `custom-coffee-cuppings`) and votes when a **second,
different real account** signs in on the same shared device/browser —
these four stores have no Supabase backend to fall back on. This is
pre-existing behavior (the purge functions already existed before this
task) for a narrow, already-documented multi-account-per-browser edge
case, not a regression introduced by this block, and fixing it would
require adding real backend tables for those stores — a schema change
explicitly out of this task's scope. Flagged here for visibility, not
raised as a new Category B/C finding (see §13).

## 10. Tests

21 tests added, all passing, alongside the pre-existing 38 (59 total, all
green):

- `lib/journey/claimAnonymousData.test.ts` (8 tests) — orchestration
  across every claimable store, idempotency, partial-failure isolation,
  account isolation, plus dedicated conflict-safety tests for
  `claimEquipmentForUser`, `claimVotesForUser`, `claimMutedShopsForUser`.
- `lib/data/brewingRecipesStore.test.ts` (8 tests) — café/enthusiast
  recipe create/update/delete, RLS-rejection-leaves-local-state-unchanged
  for both update and delete, `claimEnthusiastRecipesForUser`'s claim and
  its "never claims a non-enthusiast row" ownership guard.
- `lib/journey/store.test.ts` (pre-existing 5 tests) — unmodified, still
  passing, confirming Taste Intent stamping is unaffected.

## 11. Browser

`Browser E2E: NOT RUN — verified through code/schema/RLS/tests`, per this
task's own instruction (Claude-in-Chrome not used, no retries attempted).
Not a blocker: every claim/CRUD path here is plain TypeScript store logic
with unit-test coverage of its actual behavior (local state after the
call), not UI rendering, so the untested surface is narrow — mainly the
two-click delete confirmation's visual state, which is a straightforward,
low-risk UI addition copying an existing text-based confirmation idiom
already used elsewhere in this app (`recipeActionError` display, etc.).

## 12. Files Changed

New:
- `lib/journey/claimAnonymousData.ts`
- `lib/journey/claimAnonymousData.test.ts`
- `lib/data/brewingRecipesStore.test.ts`
- `ANONYMOUS_DATA_CLAIM_AND_CAFE_RECIPE_IMPLEMENTATION.md` (this file)

Modified:
- `lib/auth/currentUser.tsx` — swapped `claimAnonymousTastings` for
  `claimAnonymousUserData` at the one existing call site.
- `lib/data/brewingRecipesStore.ts` — added `claimEnthusiastRecipesForUser`.
- `lib/data/equipmentStore.ts` — added `claimEquipmentForUser`.
- `lib/data/kitchenRecipesStore.ts` — added `claimKitchenRecipesForUser`.
- `lib/data/customCoffeeStore.ts` — added `claimCustomCoffeeForUser`.
- `lib/data/customCoffeeCuppingsStore.ts` — added `claimCustomCoffeeCuppingsForUser`.
- `lib/data/recipeVotesStore.ts` — added `claimVotesForUser`.
- `lib/data/shopMutePreferencesStore.ts` — added `claimMutedShopsForUser`.
- `app/dashboard/cafe/[lotId]/edit/page.tsx` — Signature Recipe
  edit/delete UI.
- `COFFEE_PASSPORT_FULL_APPLICATION_E2E_AUDIT.md` — Category B #1 and #2
  marked resolved; orphan-route finding corrected (see §8).

Deleted:
- `app/dashboard/(members)/layout.tsx`, `page.tsx`, `coffees/page.tsx`,
  `qr/page.tsx`.

**Git note on scope**: `lib/auth/currentUser.tsx`, `lib/journey/store.ts`,
`lib/types/coffee.ts`, and `lib/types/database.ts` already carried
pre-existing, uncommitted work from earlier sessions (Identity Session
Continuity, Community Layer, Reference Roast Profile) at the start of
this task. This task's own new code has a real, verified compile-time
dependency on parts of that work (`claimAnonymousTastings`, `TastingRecord.isPublic`,
`CheckinCommunityViewRow`) — surgically isolating only this task's own
lines from those files was attempted and found to be technically
infeasible without breaking other already-integrated (if still
uncommitted) application code that depends on the same exports. Per this
task's own instruction to use selective staging for unrelated pre-existing
work, every other modified-but-untouched-by-this-task file (auth pages,
Navbar, roaster/café dashboard pages not part of this task, RoastCurveChart,
LotBuilderForm, canonicalLotStore, roastProfilesStore, the passport pages,
and every untracked report/HTML/component file from other blocks) was left
completely out of this commit. See the final git report for the exact
commit contents.

## 13. Final Findings

- **A**: Anonymous claim now covers every personal store found by
  independently re-deriving the list from `userScope.ts` (not just the
  audit's own count). Café Signature Recipe has a complete CRUD lifecycle,
  RLS-verified, delete-safe by schema. Account isolation holds under
  claim, dedupe, and conflict scenarios. `/dashboard` (members) scaffold
  removed; `/coffee/[id]` correctly retained with its real dependency
  documented.
- **B**: None remaining from the original audit's two findings — both
  closed. One pre-existing, out-of-scope risk is documented in §9
  (Coffee Kitchen/votes data loss on real account-to-account device
  sharing) but is not a new finding — it predates this task and requires
  a schema change outside this task's boundaries.
- **C**: None. No RLS/ownership regression, no data loss, no historical
  corruption introduced or found.

## 14. Final Verdict

`A: all checked areas` / `B: 0` / `C: 0`

**STATUS: PASS**
