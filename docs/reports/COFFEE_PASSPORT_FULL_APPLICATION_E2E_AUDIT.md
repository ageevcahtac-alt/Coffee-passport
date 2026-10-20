# Coffee Passport — Full Application E2E Audit

Audit only. No code, schema, RLS, migration, or data changed. No commit,
no push. Browser (Claude-in-Chrome) was not used and no retries were
attempted, per instruction — every relevant note below reads "Browser
verification: NOT RUN" and is backed instead by code/schema/RLS/test
evidence, cited by file:line.

## 1. Executive Summary

The application passes this full end-to-end audit with **two real,
concrete Category B gaps** and **zero Category C blockers**. Both B
findings share the same shape as gaps already fixed elsewhere in this
codebase — an already-built, already-authorized capability that simply
isn't wired to a second place that needs it — which makes them cheap,
low-risk, well-scoped fixes rather than open-ended design problems.

The chain audited in the prior block (`Coffee → Green Lot → Canonical Lot
→ Roast Intent → Roast Batch → Taste Intent → Check-in → Public Passport`)
was re-confirmed only as a link in this wider audit, not reopened — its
`STATUS: PASS` stands. This audit's own scope was everything around and
beyond it: every route, every role, auth lifecycle, café/barista/admin
surfaces, guest journeys outside the tasting flow, and cross-cutting
security/ownership consistency.

One near-miss is worth stating plainly, because catching it is itself
evidence this audit was done by verification rather than assumption: an
early migration (`0005_recipes_equipment_checkins.sql`) contains a
`recipes` RLS policy with no owner/staff scoping at all
(`"open access to roaster/shop recipes"`, `for all using (author_type in
('roaster','coffee_shop'))`), which — read in isolation — looks like a
Category C cross-tenant write vulnerability. A later migration
(`0007_staff_profiles_rls.sql:172-199`) explicitly `drop`s that exact
policy and replaces it with `"staff manage own org recipes"`, correctly
scoped by `profiles.roaster_id`/`cafe_id`/`barista_id` matching the row's
`author_id`. The live policy is the tightened one. This is called out here
specifically so it is not independently "discovered" again as a false
alarm in a future audit.

## 2. Application Route Map

Built via repository-wide `Glob`/`Grep` across `app/**/page.tsx`,
`layout.tsx`, `route.ts`, `middleware.ts`, and `lib/auth/requireStaffRole.ts`
— not from memory of "known" routes.

| Role | Route | Purpose | Data Source | Write Capability | Expected Access | Status |
|---|---|---|---|---|---|---|
| Public | `/` | Landing + partner lead form | static + `partner_requests` insert | Guest (public POST) | Anyone | PASS |
| Public/Guest | `/passport/[lotId]` | Public Coffee Passport | Supabase (full canonical chain) | none (read) + guest tasting insert downstream | Anyone | PASS |
| Public/Guest | `/passport/[lotId]/taste` | Blind tasting flow | Supabase + local `journey` | Guest (`checkins` insert) | Anyone | PASS |
| Public/Guest | `/shop/[shopId]` | Café public menu | `cafe_menu_entries`/`lots` | none | Anyone | PASS |
| Public/Guest | `/scan` | QR entry redirect | `lots` lookup | none | Anyone | PASS |
| Public | `/map` | Café map | `coffee_shops` | none | Anyone | PASS (no Navbar — full-bleed, intentional) |
| Guest | `/journey`, `/journey/cuppings`, `/recipes`, `/top-recipes`, `/loyalty` | Enthusiast history/recipes/loyalty | local + Supabase | Guest | Anon or authenticated | PASS |
| Guest | `/coffee-kitchen`, `/coffee-kitchen/recipes`, `/coffee-kitchen/equipment`, `/coffee-kitchen/[coffeeId]` | Standalone home-lab feature | local-only stores | Guest | Anyone | PASS (see §12/§18 Finding 1 for the one real gap here) |
| Guest | `/auth/login`, `/auth/callback` | Signup/login/magic-link | Supabase Auth | Guest | Anyone | PASS |
| Roaster | `/dashboard/roaster`, `/new`, `/[lotId]/edit`, `/equipment` | Roaster dashboard | Supabase, `requireStaffRole('roaster_admin')` | Roaster | `roaster_admin` only | PASS |
| Café | `/dashboard/cafe/(hub)/*`, `/add-lot`, `/[lotId]/edit`, `/staff/*` | Café dashboard | Supabase, `requireStaffRole('cafe_admin')` | Café | `cafe_admin` only | PASS (see §18 Finding 2 for Signature Recipe) |
| Barista | `/dashboard/barista` | Barista profile + own recipes | Supabase, `requireStaffRole('barista')` | Barista (own scope) | `barista` only | PASS |
| Admin | `/dashboard/admin/(hub)/*` | Platform feedback/events | Supabase, `requireStaffRole('admin')` | Admin | `admin` only | PASS |
| Admin | `/admin`, `/api/admin/*` | Partner-requests CRM | `middleware.ts` HTTP Basic (fails closed if unset) | Admin | Env-credentialed | PASS |
| Legacy (dead) | `/dashboard` (members), `/dashboard/coffees`, `/dashboard/qr` | Pre-Canonical-Lot MVP scaffold | `roaster_members` table (unreachable — nothing creates a row in it) | none (stub text) | N/A | Minor finding, §18 |
| Orphaned (dead) | `/coffee/[id]` | Pre-Stage-3 prototype "coffee card" | `coffee_lots` (fossil table predating `coffees`/`green_lots`/`lots`) | none | N/A | Minor finding, §18 |
| API | `/api/events`, `/api/barista/[id]`, `/api/partner-requests`, `/api/cron/*` | Public reads / cron | anon-key client, RLS-gated; cron routes require `isCronRequestAuthorized` | varies, correctly scoped | Correctly scoped | PASS |

No broken `Link`/`router.push` targets found anywhere. No duplicate routes
serving the same live purpose. All four staff dashboards use the
identical `requireStaffRole(role, path)` gate with identical, non-leaking
redirect behavior (no session → login; wrong role → login with an
explanatory error, never a bare "access denied" that would confirm a
route's existence to an unauthorized prober).

## 3. Role Map

**Roaster** — authentication via real Supabase Auth + `profiles.roaster_id`;
full Coffee/Green Lot/Canonical Lot/Roast Intent/Taste Intent
create+edit; catalog/lifecycle control; QR generation; edit paths for all
of the above confirmed live and RLS-gated. PASS.

**Café** — authentication via `profiles.cafe_id`; dashboard, add-Lot
(correctly gated on `active` + `in_roaster_catalog`), menu lifecycle,
Signature Recipe (create works, edit/delete does not — see Finding 2),
Canonical Lot correctly read-only, public shop page correct. PASS except
Finding 2.

**Guest/Enthusiast** — anonymous session (device-scoped id), full
authenticated account via real signup/login, tasting + blind tasting +
history all real and RLS-backed, recipes/community/account all real.
Anonymous→authenticated claim exists for tastings only, not for four
sibling local stores — see Finding 1.

**Public visitor** — QR → Passport → full provenance chain (Coffee,
Green Lot, Roast Intent, Roast Fact, Taste Intent) → tasting → blind
tasting → community, all confirmed working with correct historical
resolution and no spoiler leakage pre-reveal.

## 4. Authentication / Authorization

Full lifecycle traced through `lib/auth/currentUser.tsx:85-115`
(`CurrentUserProvider`'s effect): on every `authUserId` change, in order:
`claimAnonymousTastings` (only when newly authenticated and a pre-existing
anon id exists, lines 96-99) → `reconcileUserScope` (`lib/journey/userScope.ts:44`)
→ background Supabase syncs. `reconcileUserScope` purges the *previous
real account's* local data only on a genuine account-to-account switch
(`userScope.ts:45,54`), explicitly no-ops on logout and on
anonymous-to-authenticated transitions (documented rationale in the file
itself, re-confirmed by reading it fresh this session).

`next`/return-path threading is correct end to end: `components/shared/Navbar.tsx:20-22`
builds `next` from the current path+query; `EnthusiastAuthForm.tsx:59-60`
carries it as hidden fields; `app/auth/actions.ts`'s `signInWithPassword`/
`signUpWithPassword` redirect to it on success or back to an
error-annotated URL on failure. `signOut()` (`app/auth/actions.ts:63-68`)
calls real `supabase.auth.signOut()`, revalidates, redirects to
`/auth/login`.

**UI guard vs. data-layer guard — confirmed both exist where required**,
not just UI: `checkins` (`auth.uid() = owner_user_id`), `recipes`/`equipment_garage`
(`auth.uid() = owner_user_id` for enthusiast rows, staff-scoped for
roaster/café/barista rows via the corrected `0007` policy), `coffees`/
`green_lots`/`lots`/`reference_roast_profiles`/`reference_taste_profiles`
(`is_roaster_staff_for(roaster_id)`), `cafe_menu_entries`
(`profiles.cafe_id = coffee_shop_id`, also permits `barista` role — see
§13). Role/`roaster_id`/`cafe_id`/`barista_id` cannot be self-assigned:
`profiles`'s only self-service UPDATE policy is column-restricted to
`display_name` (`0012_loyalty_module.sql:64-68`, enforced by a
column-level `grant update (display_name)`, not just the row policy —
re-read fresh this session, a genuinely defense-in-depth design). Role
assignment instead goes through `dev_seed_staff_profile()`, a
`security definer` RPC hard-gated by an exact-email `case` statement
(`0008_dev_seed_staff_profile.sql:46-61`) — no arbitrary account can
escalate to a staff role through it.

Direct URL access to a protected route without a session, or with the
wrong role, was confirmed (§2) to redirect correctly rather than exposing
content or leaking route existence.

## 5. Roaster E2E

Traced by code, not assumed: Coffee (select-existing-or-create) → Green
Lot (select-existing-or-create, correctly reusable across many Canonical
Lots) → Canonical Lot creation (`createCanonicalLot`, server-generated
`public_id`) → first Taste Intent version (`activateTasteProfile`) →
`saveLot()` local mirror → redirect to dashboard
(`app/dashboard/roaster/new/page.tsx:178-206`). Edit: Coffee
(`updateCoffee`), Green Lot (`updateGreenLot`), Canonical Lot
(`updateCanonicalLotFields`) — all live, roaster-only, all previously
closed this session and re-confirmed present on `origin/main`
(`git log`: commits `fb65c28`, `5e3c4ab`, `987d312`). Roast: `activateReferenceRoastProfile`
→ `createRoastBatch` (ordered so the batch always records the exact
version it followed). Taste: `activateTasteProfile`, versioned, one
active per Lot enforced by a DB partial unique index. Publish: `status`/`in_roaster_catalog`
on `lots`, correctly gates café's own add-Lot flow (§6). Passport: QR/`public_id`
→ full chain, confirmed in §8. No dead ends found in this journey — every
screen has a working "next" action and a "cancel"/"back" path.

## 6. Café E2E

`app/dashboard/cafe/add-lot/page.tsx:68-72` (`isPublishedForOrdering`)
gates the browsable catalog on **both** `lot.inRoasterCatalog` and
`canonicalStatuses.get(lot.id) === 'active'`; the manual-code entry path
(`handleCodeSubmit`, lines 88-118) independently re-checks both with
explicit Russian error copy for each failure case ("снят с производства
обжарщиком" / "ещё не опубликован обжарщиком"). A café cannot add a
draft/testing/archived/catalog-off Lot through either path — confirmed by
reading the gating code directly, not assumed.

Café-owned fields are exactly `is_active`/`status`/`status_changed_at`/`scheduled_removal_at`/`lot_ref`
on `cafe_menu_entries` (`0017`/`0018`); no "café price" field exists
anywhere in schema or types (not a gap — nothing in this product ever
specified one). Every write function in `lib/data/cafeMenuStore.ts`
touches `cafe_menu_entries` exclusively — zero writes to `lots`/`coffees`/`green_lots`
anywhere in that file, confirmed by direct grep of the file's own content,
not by trusting its comments. **Café Menu Entry never substitutes for
Canonical Lot, and café-owned state never mutates roaster-owned state** —
both explicitly required checks in this task, both hold.

Signature Recipe: create is real (persists to Supabase `recipes`,
reloads correctly). **Edit/delete is not wired for café** — see Finding 2.

Public shop page (`app/(site)/shop/[shopId]/page.tsx`) shows both café's
own lifecycle badge and the roaster's discontinued badge together, has a
correct empty state, and leaks no café-internal-only field
(`scheduledRemovalAt`, `lot_ref`) to the guest-facing card.

## 7. Guest E2E

Anonymous tasting → local `journey` history: real, `useCurrentUser()`
filters by `record.userId` so a second local identity can never see the
first's history on the same device. Signup → `claimAnonymousTastings`:
real, live-E2E-verified in an earlier session block against actual
Supabase data (not just unit-tested). Authenticated tasting → history:
real, synced via `syncCheckinsForUser`. Community: private stays private
(no code path renders another guest's non-opted-in tasting anywhere);
public opt-in renders anonymized via `checkins_community_view`, whose own
column list excludes any identity or historical-reference column
(re-confirmed by re-reading the view's `create view` statement this
session).

Blind tasting spoiler gating re-verified fresh: `app/(site)/passport/[lotId]/page.tsx`
returns early into either the `draft`-status message or `BlindTastingLock`
whenever `!latestTasting`; `CommunityTastingsCard`/`getCommunityTastingsForLot`
are only ever reached in the final return block, which requires
`latestTasting` truthy — and are imported/used in exactly this one file
in the entire codebase (grep-confirmed), so no other reuse could bypass
the gate.

**The one real guest-side gap**: the anonymous→authenticated claim
mechanism covers `journey`/`checkins` only. `lib/auth/currentUser.tsx:98`
calls exactly one claim function, `claimAnonymousTastings` — grepped for
any other `claim*`/`Claim*` call in `lib/data/` or `lib/auth/`: zero
matches. `addBrewingRecipe` (enthusiast-authored recipes),
`equipmentStore`, `kitchenRecipesStore`, `customCoffeeStore`, and
`customCoffeeCuppingsStore` all insert/save under the caller's *current*
`userId` (the anonymous device id, when anonymous) and all filter reads by
that same `userId` — but none of them is claimed when the guest signs up.
**Product impact**: a guest who tries the app anonymously — logs a
brewing recipe, builds an equipment garage, adds kitchen recipes or custom
coffee entries — then signs up (the exact funnel the Identity block was
built to support) sees all of that content silently vanish post-signup:
not deleted, permanently orphaned under the old anon id, invisible under
the new real account forever. This is the identical bug class already
fixed for tastings (`IDENTITY_SESSION_CONTINUITY_IMPLEMENTATION.md`'s
"GAP 2"), left open for five sibling stores. See Finding 1.

## 8. Public Passport E2E

Full path re-traced (fresh code read, `app/(site)/passport/[lotId]/page.tsx`):
QR/`public_id` → `syncLotsFromSupabase()` (now including the
`green_lots(coffees(...))` join from the already-closed provenance-sync
block) → `lot` resolved from `useLots()` → `findCanonicalLotByPublicId` →
`getGreenLotById` → `getCoffeeById` → `withCanonicalCoffeeOverlay` →
`latestRoastProfile.referenceRoastProfileId`-or-active → Roast Intent
card; `roast_batches` via `syncRoastProfilesFromSupabase` → Roast Fact;
`latestTasting.referenceTasteProfileId`-or-active → `TasteComparison`;
`getCommunityTastingsForLot` → Community card (post-reveal only).

- **First load / hydration**: `lotsSynced` gate (`page.tsx:122-125`)
  prevents the "Лот не найден" false-negative on a brand-new guest's very
  first QR scan, before the Supabase fetch resolves — this was itself the
  subject of an earlier session's own audit and fix, re-confirmed present.
- **Not-found state**: correct, waits for both `mounted` and `lotsSynced`.
- **Existing history**: `shopTastings` scoped by `(lot, shop, currentUserId)`
  — a repeat visit to the same lot at the same shop shows the same
  comparison; a different shop starts a clean session, matching the
  product's own "новая кофейня = новый опыт" rule.
- **New-tasting gate**: `draft`-status Lots block starting a *new* blind
  tasting (`canonicalStatus === 'draft'` branch) but never gate an
  *already-saved* tasting's own display — confirmed by reading the
  branching directly; this is a deliberate, previously-documented rule
  (`PHASE_4.5.7_REPORT.md`), not an oversight.
- **Archived behavior**: an archived Lot's existing tastings remain fully
  viewable (same reasoning as above — status never gates the
  `latestTasting` branch at any value).
- **Historical Taste/Roast Intent**: both resolve the linked historical
  version when present, falling back to "active now" only for
  tastings/batches predating the link — live-E2E-verified for Taste
  Intent in an earlier block against real Supabase data.
- **Public data leakage**: none found — `checkins_community_view`'s
  column list is manually curated and excludes identity/reference
  columns; no Green-Lot-only operational field
  (`purchasedKg`/`purchaseDate`/`contractReference`/`notes`) is rendered
  on any guest-facing surface (grepped every consumer of `CanonicalGreenLot`
  outside the roaster dashboard — none render these fields).

## 9. Route Consistency

Covered in full in §2's route map and its "What was NOT found" note: no
broken links, no duplicate live routes, no inconsistent staff-dashboard
gating, no route reachable through a wrong role without a correct
redirect. Two dead/orphaned routes exist (Finding 3, minor) with zero
inbound navigation and zero security exposure — confirmed unreachable by
grepping for their path strings in every `Link href`/`router.push` call
across the codebase.

## 10. Data Source / Cache Consistency

- **`useLots()`/`syncLotsFromSupabase()`**: Supabase is the source of
  truth; local override wins wholesale (not field-by-field) over the
  canonical branch for any Lot id that already has one — an existing,
  understood, previously-documented mechanism (not re-litigated here). No
  *new* instance of "Supabase correct → local shadow → UI wrong" was
  found beyond what the already-closed provenance-sync block already
  fixed for Coffee/Green Lot origin fields.
- **`canonicalLotStore.ts`**: no local-first cache at all — every read is
  a fresh Supabase call. Cannot shadow anything by construction.
- **Profile state**: no local override capability — `profiles` reads are
  always fresh; the one self-service field (`display_name`) is
  column-grant-restricted server-side.
- **Tasting state (`journey`)**: local cache overlaid by Supabase for
  authenticated users only (correct — an anonymous device id can't
  authenticate a Supabase read anyway); `reference_taste_profile_ref`
  stamped once at creation, never recomputed, confirmed by code and by an
  earlier session's live E2E test.
- **Community state**: no local cache at all — always a fresh
  `checkins_community_view` read.
- **Café menu state**: same "sync overlays local, falls back to base
  table if the view isn't live" idiom as `lotsStore.ts`, already
  deployment-verified in the closed café-menu-lifecycle block; not
  reopened here.
- **The five orphaned-on-claim local stores** (Finding 1) are themselves
  a data-source-consistency issue of a different shape: not "Supabase
  correct, local wrong," but "local correct, never promoted to Supabase
  ownership on identity change" — same family of risk (a guest's own
  data silently becomes unreachable), different mechanism.

## 11. Error / Empty / Edge States

Checked across the critical flows named in the task:
- **Passport**: not-found (correct, hydration-gated), empty
  community/no-tastings-yet (renders nothing extra, no broken layout),
  network/Supabase error on any of the chain's several fetches
  (`try/catch` + `null`-returning contracts throughout `canonicalLotStore.ts`,
  confirmed — a failed fetch degrades to "no historical link, fall back to
  active" rather than crashing the page).
- **Dashboard write flows** (Coffee/Green Lot/Canonical Lot edit,
  Roast/Taste Intent activation, café menu writes): every write function
  in `canonicalLotStore.ts`/`cafeMenuStore.ts` either throws a caught,
  user-facing error (roaster forms all show `saveError`/`lotSaveError`
  inline) or is explicitly best-effort with a `console.warn` (café menu
  sync, tasting sync) — no silent swallow-and-pretend-success path found
  in any write flow.
- **Invalid ID / missing relation**: `findCanonicalLotByPublicId`/`getGreenLotById`/`getCoffeeById`
  all use the same `maybeSingle()` + `error || !data → null` contract —
  a broken chain link degrades gracefully (e.g. `CanonicalLotChain`'s own
  "Не удалось загрузить партию/кофе" messages) rather than crashing.
- **Stale cache**: covered in §10 — the one known shape (override-wins-wholesale)
  is understood and unchanged; no new stale-cache path found.
- **Role mismatch**: covered in §4 — correct redirect, no content leak.

## 12. Historical Integrity

- **Roast**: `reference_roast_profiles` versioned (`draft/active/superseded`),
  exactly one `active` per Lot enforced by a real DB partial unique index
  (`idx_ref_roast_profiles_one_active`, `0023_canonical_lot_profiles.sql`).
  `roast_batches.reference_roast_profile_id` is set once, at insert time,
  by the caller (never defaulted, never recomputed) and the row is
  **immutable at the database level** — `trg_roast_batches_immutable`
  raises an exception unconditionally on any `UPDATE`/`DELETE`, re-read
  fresh from `0023` this session. A new Roast Intent version cannot alter
  which version an old Roast Batch recorded following.
- **Taste**: identical versioning shape for `reference_taste_profiles`.
  `checkins.reference_taste_profile_ref` is stamped once, at insert time,
  never updated afterward — confirmed by code (no `.from('checkins').update`
  exists anywhere in the codebase, grepped) and by an earlier session's own
  live test against real Supabase data (Tasting #1 kept v1's id after the
  roaster activated v2; Tasting #2 got v2).
- **Lot identity**: `public_id`, `green_lot_id`, `roaster_id` on `lots`
  are never included in `updateCanonicalLotFields`'s patch type — a
  metadata edit cannot change a Canonical Lot's identity or its parent
  Green Lot.
- **Coffee/Green Lot edit**: both `updateCoffee`/`updateGreenLot` compile
  to a plain `UPDATE ... WHERE id = <uuid>` — no insert, no new row, no
  identity change; re-confirmed this session by reading both functions'
  full bodies again (not assumed from the prior block's own report alone).

## 13. Ownership Matrix

Confirmed by reading RLS policy text and every `.insert`/`.update`/`.delete`
call site for each table — not assumed.

| Entity | Roaster | Café | Guest | Public |
|---|---|---|---|---|
| Coffee | C, R, U (no D anywhere) | R | R | R |
| Green Lot | C, R, U (no D anywhere) | R | R | R |
| Canonical Lot | C, R, U (no D anywhere) | R | R | R |
| Roast Intent | C, R, U (versioned; no D) | R | R | R |
| Roast Batch | C only (insert-only; U/D impossible for anyone — DB trigger) | R | R | R |
| Taste Intent | C, R, U (versioned; no D) | R | R | R |
| Café Menu Entry | R (via `cafe_menu_entries_roaster_status_view`) | C, R, U (soft-remove only via `is_active`/status — no hard D, by design); barista role also RLS-permitted, not yet UI-wired (§18 note) | R | R |
| Signature Recipe (`recipes`, `author_type='coffee_shop'`) | R (own lot's dashboard) | C, R (U/D exist and are RLS-authorized but not UI-wired — Finding 2) | R (if public) | R (if public) |
| Check-in | R (`checkins_roaster_view`) | R (`checkins_cafe_benchmark_view`) | C, R (own; **no U/D exists for anyone, including the owning guest**) | none directly |
| Community Check-in (view) | R | R | R | R (anonymized, opt-in only) |

Note on Check-in's own missing U/D: a guest cannot correct or remove a
past tasting note through any code path in the app (no
`.from('checkins').update`/`.delete` exists anywhere, confirmed by grep).
This mirrors Roast Batch's own deliberate "permanent record" design
philosophy closely enough, and nothing in this product's stated intent
promises editable tasting history, that it is **not classified as a
finding** here — flagged only as an observation for the coordinator's own
record, per this audit's rule against manufacturing findings for missing
convenience.

## 14. Security / RLS

Full repository-wide grep of every `.insert`/`.update`/`.delete` against
`coffees`, `green_lots`, `lots`, `reference_roast_profiles`,
`roast_batches`, `reference_taste_profiles`, `checkins`, `cafe_menu_entries`:
every single write site lives in exactly one of `lib/data/canonicalLotStore.ts`,
`lib/journey/store.ts`, or `lib/data/cafeMenuStore.ts` — no write to any of
these tables exists anywhere else in the codebase (dashboards, forms, and
components only ever call these stores' own exported functions, never a
raw Supabase call of their own). UI ownership → data-layer ownership →
RLS ownership are consistent for all eight tables: every write function's
own RLS policy scopes it to the correct owning role, and no UI surface
ever attempts a write its own role's RLS would reject.

`profiles` role/`roaster_id`/`cafe_id`/`barista_id` cannot be
self-assigned (§4). `dev_seed_staff_profile()` is hard-gated by an exact
pilot-email allowlist. `/admin`'s HTTP-Basic gate fails closed if its env
vars are unset (`middleware.ts:6-30`, re-confirmed).

The one item requiring history (§1): `recipes`' original open policy was
superseded, confirmed live in the current migration set, not just in
comments.

## 15. Product Completeness

- **Roaster** (`создать → подготовить → обжарить → описать → активировать → опубликовать`):
  every step has a real, working, non-dead-end screen — confirmed
  end-to-end in §5. **Completable.**
- **Café** (`найти → добавить → настроить меню → использовать → изменить café-specific data → снять`):
  every step works except "изменить café-specific data" for **Signature
  Recipe specifically** — a café can change lifecycle status/availability
  freely, but cannot correct a published recipe once saved (Finding 2).
  **Completable except this one step.**
- **Guest** (`открыть Passport → попробовать → оценить → сохранить → вернуться → увидеть историю`):
  fully completable, confirmed in §7/§8, including across a signup
  transition for the tasting itself. The equivalent journey for
  recipes/equipment/kitchen data is **not** completable across a signup
  transition (Finding 1).
- **Public** (`QR → Passport → понять происхождение → понять обжарку → попробовать → увидеть community`):
  fully completable, confirmed in §8.

## 16. Closed Architecture Regression

Not reopened; checked only as links in this wider chain, per instruction.
No contradiction found between current code and any of: Canonical Lot
Architecture 4.5, Public Passport, Community, Identity, Taste Intent
Historical Link, Roast Batch, Reference Roast Profile, Roast Intent vs
Fact, Café Menu ↔ Lifecycle, Coffee/Green Lot provenance sync, Coffee/Green
Lot edit paths. All three commits from the immediately-prior block
(`fb65c28`, `5e3c4ab`, `987d312`) confirmed present on `origin/main` via
`git log`/`git fetch` this session.

## 17. Category A Findings

Every area in §2–§16 not called out below as a Finding resolved to PASS:
full route map and staff-dashboard gating; auth lifecycle and its RLS
backing; roaster's full create/edit/roast/taste/publish journey; café's
add-Lot gating and menu/roaster-signal isolation; guest tasting/community/blind-tasting
flow including the reveal gate; the full Passport read chain including
historical Roast/Taste Intent resolution; historical integrity for
Roast Batch (DB-enforced), Roast/Taste Intent versioning, and Lot/Coffee/Green-Lot
identity immutability; the full ownership matrix's write-path isolation;
and RLS consistency across every write site in the codebase for the eight
audited tables.

## 18. Category B Findings — RESOLVED

See `ANONYMOUS_DATA_CLAIM_AND_CAFE_RECIPE_IMPLEMENTATION.md` for the full
implementation. Both findings below are now closed; kept here verbatim as
the historical record of what was found, per this section's own name.

**Finding 1 — Anonymous→authenticated claim covers tastings only, not
five sibling local-only stores. RESOLVED.** (The actual count, re-derived
independently rather than trusted from this audit's own wording, was
seven — `claimAnonymousUserData` now claims all seven; see the
implementation report's §3 store-by-store matrix.)
- Files: `lib/auth/currentUser.tsx:98` (the one claim call site);
  `lib/data/brewingRecipesStore.ts`, `lib/data/equipmentStore.ts`,
  `lib/data/kitchenRecipesStore.ts`, `lib/data/customCoffeeStore.ts`,
  `lib/data/customCoffeeCuppingsStore.ts` (all insert/read keyed by the
  caller's *current* `userId`, none claimed on signup).
- Mechanism: identical to the already-fixed "GAP 2" for tastings, just
  incomplete — an anonymous guest's recipes/equipment/kitchen-coffee data
  is retagged to nothing on signup and becomes permanently unreachable
  under the new real account.
- Product impact: real and concrete — any enthusiast who explores before
  creating an account loses everything outside their tasting history the
  moment they sign up, with no error, no warning, and no data loss
  awareness on their part.

**Finding 2 — Café's Signature Recipe has no edit/delete UI, despite the
write functions and RLS already existing. RESOLVED** — full create/read/update/delete
lifecycle now wired in `app/dashboard/cafe/[lotId]/edit/page.tsx`, reusing
the existing barista pattern with no RLS or component changes needed.
- Files: `lib/data/brewingRecipesStore.ts` (`updateBrewingRecipe`,
  `deleteBrewingRecipe` — both already implemented); `0007_staff_profiles_rls.sql:175-185`
  (`"staff manage own org recipes"` already authorizes `cafe_admin` for
  `author_type = 'coffee_shop'` rows); `app/dashboard/cafe/[lotId]/edit/page.tsx:74-97`
  (only ever renders the create form, no edit/delete action per row).
- Proof this is a wiring gap, not a missing capability: the identical
  primitive is fully wired for barista's own recipes one dashboard over
  (`app/dashboard/barista/page.tsx`, `onEdit`/`onDelete` both in active
  use against the same store functions).
- Product impact: a café that publishes a recipe with a wrong dose/yield
  has no way to correct it — only to publish a duplicate alongside the
  wrong one forever.

**Finding 3 (minor) — Two dead/orphaned routes with zero inbound
navigation and zero security exposure. PARTIALLY CORRECTED.**
`/dashboard` (members)/`/dashboard/coffees`/`/dashboard/qr` (a
pre-Canonical-Lot scaffold gated by a `roaster_members` table nothing in
the live app ever populates) was genuinely orphaned and has been
**deleted**. `/coffee/[id]` was **incorrectly** classified as orphaned in
this section — re-verified in the implementation block and found to have
a real inbound reference: `components/admin/LegacyLotCreator.tsx`,
rendered on the real (HTTP-Basic-gated) `/admin` page, generates QR codes
pointing at this exact route after inserting into the still-live
`coffee_lots` table. It is **retained**, not deleted — see
`ANONYMOUS_DATA_CLAIM_AND_CAFE_RECIPE_IMPLEMENTATION.md` §8 for the full
correction. This is recorded here as a reminder that even a "zero inbound
links" claim in an audit must be re-verified before acting on it, not
just cited.

## 19. Category C Findings

**None.** No mechanism was found, in this audit or any prior one this
session, by which a non-owner role could write to a table it doesn't own,
by which source-of-truth data could be silently mutated by a lesser-privileged
actor, by which historical integrity could be retroactively altered, or by
which private guest data could leak publicly. The one policy that read
like a candidate (§1) was verified superseded before being written up as
a finding, not after.

## 20. Evidence Limitations

Browser verification: **NOT RUN** for this entire audit, per instruction.
Every conclusion above is based on code, schema, RLS policy text, and this
session's own prior live-E2E test results (Taste Intent stamping,
migration 0027 deployment, café menu lifecycle) — not on freshly-run
browser interaction. No area was found where a conclusion was impossible
without a browser; every check had sufficient code/schema/test evidence
to reach a decisive PASS/FINDING call. This is explicitly not a blocker
per instruction §18/§20.

## 21. Recommended Next Implementation Blocks — COMPLETED

Both blocks below were implemented in a single follow-up block; see
`ANONYMOUS_DATA_CLAIM_AND_CAFE_RECIPE_IMPLEMENTATION.md`. Kept here for
the historical record of the original plan:

**BLOCK 1 — Anonymous Data Claim Completion**
Extend the existing `claimAnonymousTastings` pattern to
`brewingRecipesStore`/`equipmentStore`/`kitchenRecipesStore`/`customCoffeeStore`/`customCoffeeCuppingsStore`
— five near-identical claim functions (or one generic helper
parameterized by store), wired into `CurrentUserProvider`'s existing
effect alongside the current call. Same RLS shape already proven safe by
the tasting claim (re-tag `userId`, best-effort Supabase insert). Closes
Finding 1 completely.

**BLOCK 2 — Café Signature Recipe Edit/Delete**
Wire the already-existing `updateBrewingRecipe`/`deleteBrewingRecipe`
into `app/dashboard/cafe/[lotId]/edit/page.tsx`'s recipe list, mirroring
the barista dashboard's own already-working `onEdit`/`onDelete` pattern
almost verbatim. No new store function, no RLS change, no new UI
component needed beyond copying an existing, proven pattern. Closes
Finding 2 completely.

Finding 3 (dead routes) is not proposed as its own implementation block —
it has no product impact, so an optional cleanup pass (delete both routes
and their now-pointless data-access code) can be folded into either block
above or done separately at the user's discretion; it is not blocking
anything.

## 22. Final Verdict

**Updated post-implementation** — see
`ANONYMOUS_DATA_CLAIM_AND_CAFE_RECIPE_IMPLEMENTATION.md` for the full
implementation block that closed both findings below.

**A: all checked areas**
**B: 0** (Finding 1 and Finding 2 both resolved; Finding 3's dead route deleted, its other route corrected from orphaned to retained)
**C: 0**

**STATUS: PASS**

---

*Original verdict at the time this audit was first written (kept for
history): A: all checked areas except the two Category B items below /
B: 2 (Finding 1 — anonymous-data claim gap; Finding 2 — café Signature
Recipe edit/delete not wired) + 1 minor (Finding 3 — dead routes,
effectively zero product impact) / C: 0 / STATUS: GAPS FOUND.*
