# Coffee Passport — End-to-End Architecture Audit

**Coffee → Green Lot → Canonical Lot → Roast Intent → Taste Intent → Public Coffee Passport**

**Update:** all three Category B findings below were closed in
`COFFEE_GREEN_LOT_EDIT_PATHS_IMPLEMENTATION.md` — commits `fb65c283eafe39cc6848e1e1c28e8baf5ebf04f6`
("feat: complete coffee green lot edit paths") and `5e3c4abd0cd625a3feaeda2bfea5e1332759f8c3`
("fix: make cafe canonical lot data read-only"), both verified present on
`origin/main`. The findings below are left in their original wording for
the historical record; each is annotated **[RESOLVED]** where closed, and
the Final Verdict at the bottom is superseded by the update at the very
end of this document.

Audit only, per instruction. No code, schema, migration, or data changed.
No commit, no push. Every claim below is sourced from a fresh read of the
current code/schema this session, or explicitly cross-referenced against
an already-closed block's own report — never assumed. Prior blocks'
implementations were not reopened or redone; each is checked here only as
a link in the chain, per instruction §12. Browser was not used, per
instruction §13 — every "Browser verification: NOT RUN" note below is a
UI/E2E-only aspect that the code, schema, and automated evidence already
gathered in this session's own prior blocks are sufficient to reach an
architectural conclusion on without it.

## 1. Executive Summary

The chain is architecturally sound end to end: Roaster ownership of
Coffee/Green Lot/Canonical Lot/Roast Intent/Roast Batch/Taste Intent is
enforced by real RLS everywhere (`is_roaster_staff_for()`), historical
integrity for both Roast Fact (immutable by DB trigger) and Taste Intent
(per-checkin version stamping, shipped and live-E2E-verified) is real and
provable, and the read path — after this session's own provenance-sync
fix — now delivers the same Coffee/Green Lot provenance to every consumer
of `useLots()`, not just the Public Passport. **No Category C blocker
exists anywhere in the chain.**

Two things need explicit, honest flagging that a narrower per-block audit
would not surface:

1. ~~The café Lot-edit read-only fix (`CAFE_LOT_EDIT_OWNERSHIP_IMPLEMENTATION.md`)
   is still uncommitted.~~ **[RESOLVED — `COFFEE_GREEN_LOT_EDIT_PATHS_IMPLEMENTATION.md`,
   commit `5e3c4abd0cd625a3feaeda2bfea5e1332759f8c3`, verified on `origin/main`.]**
2. ~~Two long-standing Category B gaps from `NEXT_ARCHITECTURE_AUDIT.md` and
   `COFFEE_GREEN_LOT_OWNERSHIP_AUDIT.md` remain open and unchanged: no
   edit path exists for Coffee or Green Lot, for anyone, ever.~~
   **[RESOLVED — `updateCoffee()`/`updateGreenLot()` added
   (`lib/data/canonicalLotStore.ts`), roaster-only UI shipped
   (`components/roaster/CoffeeGreenLotEditPanel.tsx`), commit
   `fb65c283eafe39cc6848e1e1c28e8baf5ebf04f6`, verified on `origin/main`.]**

## 2. Full Data Flow (as actually implemented)

```
Roaster wizard (app/dashboard/roaster/new/page.tsx)
  Coffee step   → createCoffee() ──────────────────► public.coffees
  Green Lot step→ createGreenLot() ─────────────────► public.green_lots (coffee_id FK)
  Lot step      → createCanonicalLot() ─────────────► public.lots (green_lot_id FK, public_id)
                → activateTasteProfile() ────────────► public.reference_taste_profiles (v1, active)
                → saveLot() ─────────────────────────► localStorage (creating device only)

Roaster edit (app/dashboard/roaster/[lotId]/edit/page.tsx)
  LotBuilderForm→ updateCanonicalLotFields() ────────► public.lots (name/status/inRoasterCatalog/
                                                         qGrade/roastType/roastProfileLabel/descriptors)
                → activateTasteProfile() ────────────► public.reference_taste_profiles (new version)
  RoastProfileForm → activateReferenceRoastProfile() ─► public.reference_roast_profiles (new version)
                   → createRoastBatch(referenceRoastProfileId) ─► public.roast_batches (immutable)

Guest taste flow (app/(site)/passport/[lotId]/taste)
  addTastingRecord()/claimAnonymousTastings()
    → resolveActiveTasteProfileId() → checkins.reference_taste_profile_ref  (stamped once)
    → public.checkins  (auth.uid() = owner_user_id only — anon never reaches Supabase)

Public Passport (app/(site)/passport/[lotId]/page.tsx)
  syncLotsFromSupabase() → public.lots + green_lots(coffees) + reference_taste_profiles → useLots()
  findCanonicalLotByPublicId → getGreenLotById → getCoffeeById → withCanonicalCoffeeOverlay()
  latestRoastProfile.referenceRoastProfileId → getReferenceRoastProfileById() | getActiveReferenceRoastProfile()
  latestTasting.referenceTasteProfileId → TasteComparison → getReferenceTasteProfileById() | lot.roasterFlavorProfile
  getCommunityTastingsForLot() → checkins_community_view (anonymized, opt-in)

Café menu (app/dashboard/cafe/(hub), /shop/[shopId])
  syncCafeMenuFromSupabase() → cafe_menu_entries_roaster_status_view (roaster_lot_status, roaster_in_catalog)
  isDiscontinuedByRoaster() → read-only badge, never writes back
```

## 3. Coffee

**Create**: `createCoffee()` (`lib/data/canonicalLotStore.ts:201`), the
only writer of `public.coffees` in the codebase. Called only from
`app/dashboard/roaster/new/page.tsx`'s `submitNewCoffee()`, gated by the
signed-in `roaster_admin`'s resolved uuid. Required field: `country`
(the form's own `required` attribute plus `if (!country.trim()) return`
guard). Optional: region, farm, producer, variety, altitude, processing,
harvest_year (all default to `''` server-side).

**Owner**: Roaster, enforced by RLS (`for all using (is_roaster_staff_for(roaster_id))`
in `0025_canonical_lot_rls.sql`).

**Edit**: none exists, for anyone — re-confirmed this session (grepped for
`updateCoffee`/`.from('coffees').update`, zero matches beyond this and
`NEXT_ARCHITECTURE_AUDIT.md`'s own prior §3.1 finding of the same gap).

**Does Passport need everything Coffee stores?** Yes — country, region,
farm, producer, variety, altitude, processing all flow into
`withCanonicalCoffeeOverlay()`/`rowToLot()`'s provenance fields, which the
Passport (`LotPassport`, `ProducerRoasterCard`, `FarmerRevealCard`) renders
directly.

**Local-only illusion**: `LotBuilderForm`'s Origin step is pre-filled from
the selected/created Coffee (`buildOriginDefaults()`) but stays a plain
editable `Lot`-shaped text field — editing it there updates only the local
`Lot` object via `saveLot()`, never `coffees` itself. This is the same,
already-known gap (§3.1 of the prior audit), not new.

## 4. Coffee → Green Lot

**Create**: `createGreenLot()` (`lib/data/canonicalLotStore.ts:258`), only
writer of `public.green_lots`, called only from
`submitNewGreenLot()`, `roaster_id`/`coffee_id` always the resolved
session values.

**Reuse**: `listGreenLotsForCoffee(coffeeId)` lists every existing Green
Lot under a Coffee; the wizard's `selectGreenLot()` picks one instead of
creating a duplicate.

**`green_lot_id → coffee_id`**: `green_lots.coffee_id references coffees(id)`
(`0022_canonical_lot_core.sql`) — a real FK, not a convention.

**Ownership/RLS**: identical shape to Coffee — `roaster staff manage own
green lots`, `is_roaster_staff_for(roaster_id)`.

**One Green Lot → several Canonical Lots, verified not to cross-contaminate**:
`createCanonicalLot()` (line 295) only ever *reads* `input.greenLotId` to
store as the new row's FK — there is no write to `green_lots` anywhere in
that function. `listCanonicalLotsForGreenLot()` (line 443) is a pure read,
used by `CanonicalLotChain.tsx` to list every sibling Lot sharing one
Green Lot — confirmed this reuse relationship already has live data (this
session's own earlier reads of the roaster edit page showed "ДРУГИЕ ЛОТЫ
ИЗ ЭТОЙ ПАРТИИ / LOT-XO-ETH-002 — TEST FLOW A" rendered for
`LOT-XO-ETH-001`, i.e. two real, live Canonical Lots already share one
Green Lot in this project). No function anywhere could mutate a Green
Lot's own fields as a side effect of creating or editing any one Canonical
Lot built from it — creating a second Canonical Lot cannot change the
first's provenance because there is no code path that writes to Green Lot
at all past its own creation.

## 5. Green Lot → Canonical Lot

**Full creation path** (`app/dashboard/roaster/new/page.tsx`): Coffee
step (select or create) → Green Lot step (select or create) → Lot Details
step (`LotBuilderForm`) → `handleLotSave()`:
```ts
const canonicalLot = await createCanonicalLot({ roasterUuid, roasterSlug, country: coffee.country,
  greenLotId: greenLot.id, name: lot.name, descriptors: lot.descriptors, qGrade: lot.qGrade,
  roastType: lot.roastType, roastProfileLabel: lot.roastProfile, inRoasterCatalog: lot.inRoasterCatalog });
await activateTasteProfile(canonicalLot.id, lot.roasterFlavorProfile);
saveLot({ ...lot, id: canonicalLot.publicId });
```
`public_id` is generated server-side (`generatePublicLotId()`, against the
real, complete existing-id set fetched from Supabase — not a per-browser
guess) inside `createCanonicalLot()` itself. `status` defaults to
`'draft'`. `name`/`qGrade`/`roastType`/`roastProfileLabel`/`descriptors`
are all written to the real `lots` row at creation. Story/origin text
typed at this step is **not** written anywhere canonical (see §3) — it
only reaches `saveLot()`'s local cache.

**Source of truth after creation**: Supabase (`public.lots`), confirmed —
`saveLot()` here only mirrors the just-created row into the creating
device's own local cache; every other device relies entirely on
`syncLotsFromSupabase()` reading the real row back (and, after this
session's provenance-sync fix, its Coffee/Green Lot chain too).

## 6. Roast Intent

**Path**: `activateReferenceRoastProfile()` (`canonicalLotStore.ts:626`) —
two-step versioned write (`planVersionActivation()`, shared pure logic,
14 unit tests in `lib/server/canonicalLot.test.ts`): supersede the
previously-active version if any, insert the new one as `active`. DB-level
guarantee of exactly one active version per Lot:
```sql
create unique index idx_ref_roast_profiles_one_active on reference_roast_profiles(lot_id) where status = 'active';
```
Called only from `app/dashboard/roaster/[lotId]/edit/page.tsx`'s
`handleRoastProfileSave()`, which runs it **first**, then threads the
returned new version's id into `createRoastBatch()`'s
`referenceRoastProfileId` — exactly the ordering `ROAST_BATCH_REFERENCE_LINK.md`
established, re-confirmed by a fresh read of this file this session.

**Public Passport read**: `latestRoastProfile.referenceRoastProfileId ? getReferenceRoastProfileById(linkedId) : getActiveReferenceRoastProfile(canonicalLotId)`
(`app/(site)/passport/[lotId]/page.tsx:244-247`) — prefers the *exact*
version the guest's roaster-side batch actually followed, only falling
back to "whatever is active now" for batches predating this link.

**New Roast Intent version does not rewrite old Roast Batches**: verified
structurally — `activateReferenceRoastProfile()` never touches
`roast_batches`, and a `roast_batches` row's own `reference_roast_profile_id`
is set once, at insert time, by the caller, never updated afterward (there
is no `.from('roast_batches').update(...)` anywhere, and even if there
were, the DB trigger below would reject it).

## 7. Roast Batch

`public.roast_batches` rows are immutable **at the database level**, not
just by application convention (re-read `0023_canonical_lot_profiles.sql`
in full this session):
```sql
create trigger trg_roast_batches_immutable
  before update or delete on public.roast_batches
  for each row execute function public.prevent_roast_batch_mutation();
-- raises an exception unconditionally on any UPDATE or DELETE attempt
```
`createRoastBatch()` is insert-only by construction. This is the strongest
historical-integrity guarantee anywhere in the chain — a real DB
constraint, not something that could be silently bypassed by a future
missed application-layer check.

## 8. Taste Intent

**Path**: `activateTasteProfile()` (`canonicalLotStore.ts:484`) — same
versioned two-step write, same DB-level one-active-per-lot partial unique
index, same shared `planVersionActivation()` logic as Roast Intent. Called
from both `new/page.tsx` (first version, from the creation wizard's
flavor sliders) and `[lotId]/edit/page.tsx` (subsequent versions).

**Stamping**: `resolveActiveTasteProfileId()` (`lib/journey/store.ts`) —
resolves the tasting's lot to its canonical uuid, reads whichever
`reference_taste_profiles` row is `active` *at that exact moment*, and
stamps its id onto `checkins.reference_taste_profile_ref` **before** the
insert (not after, not as a separate update). `claimAnonymousTastings()`
carries this field through unchanged via a plain object spread — no
recomputation, by construction.

**Read/historical resolution**: `TasteComparison`'s exported
`resolveComparisonRoasterProfile(tasting, fallback, fetchById)` — if
`tasting.referenceTasteProfileId` is set, fetches that exact version
(`getReferenceTasteProfileById`, which returns `superseded` rows too, not
just `active`); otherwise, or if the fetch fails, falls back to
`lot.roasterFlavorProfile` (today's active version) — identical fallback
convention to Roast Intent's.

**Fallback for old checkins**: every checkin predating this feature has
`reference_taste_profile_ref = null` (migration `0024`'s own comment
explicitly forbids retroactively guessing a version for these) and
correctly falls through to the "active now" branch — unchanged, intended
behavior, not a gap.

**The exact requested scenario — already live-verified, not just
theoretical.** `TASTE_INTENT_HISTORICAL_LINK_IMPLEMENTATION.md` records a
real, live browser + real Supabase test of precisely this:

| Event | Real result (live Supabase, authenticated read) |
|---|---|
| Tasting #1, Taste Intent v1 active (`a5618db4-...`, 4/5/3/1) | `checkins.reference_taste_profile_ref = a5618db4-...` |
| Roaster changes Taste Intent → v2 active (`d7a01288-...`, 2/2/5/5), v1 → `superseded` | `reference_taste_profiles`: v1 `superseded`, v2 `active` |
| Tasting #2, same Lot | `checkins.reference_taste_profile_ref = d7a01288-...` |
| Re-checked Tasting #1 after v2 activation | still `a5618db4-...` — unchanged |

This is exactly "Tasting #1 → v1, Tasting #2 → v2," confirmed against real
data, not assumed. This block's own commits (`99e2e30`, `1e76fb6`) are
confirmed present on `origin/main` (verified via `git fetch` + `git
rev-parse` in that block and re-confirmed in this session's own `git log`).

## 9. Check-in

**Owner**: Guest — RLS `owner manages own checkins` (`for all using
(auth.uid() = owner_user_id)`, `0007_staff_profiles_rls.sql`, re-read this
session). An anonymous (unauthenticated) device can never write to
`public.checkins` directly — `owner_user_id` requires a real `auth.uid()`
— matching the established convention that anonymous tastings are
local-only (`lib/journey/store.ts`'s localStorage cache) until
`claimAnonymousTastings()` re-owns and inserts them under a real account
at signup.

**Create**: `addTastingRecord()` (authenticated) / claimed via
`claimAnonymousTastings()`. **Edit**: none — no `.from('checkins').update`
exists for the guest's own sensory data (only `is_public` toggling and the
café/roaster read-only views touch this table otherwise). **Community
opt-in**: `checkins_community_view` (`0026_checkins_community_sharing.sql`)
exposes a manually curated column list that excludes
`reference_taste_profile_ref`/`lot_ref`/any identity column — re-confirmed
by re-reading the view definition this session.

## 10. Public Passport

| Step | Source of truth | Read path | Fallback | Local cache | Ownership |
|---|---|---|---|---|---|
| QR / public_id | `lots.public_id` | route param | — | — | Roaster (immutable) |
| Sync | `public.lots` | `syncLotsFromSupabase()` | seed/local override | `useLots()` localStorage | Roaster writes, guest device caches |
| Canonical Lot | `public.lots` | `findCanonicalLotByPublicId()` | none (`null` if not found) | none (fresh fetch) | Roaster |
| Coffee/Green Lot provenance | `coffees`/`green_lots` | `getGreenLotById → getCoffeeById` (Passport's own chain) **and**, since this session's fix, `syncLotsFromSupabase()`'s own `green_lots(coffees(...))` join | local Lot's own value where Coffee has nothing recorded | `useLots()` | Roaster |
| Roast Intent | `reference_roast_profiles` | linked-id-or-active (§6) | active version | none | Roaster |
| Roast Fact | `roast_batches` | `syncRoastProfilesFromSupabase` | — | `useRoastProfiles()` | Roaster (immutable) |
| Taste Intent | `reference_taste_profiles` | linked-id-or-active (§8) | active version | none | Roaster |
| Blind Tasting | `checkins`/local `journey` | `latestTasting` from `useJourney()` | — | localStorage | Guest |
| Community | `checkins_community_view` | `getCommunityTastingsForLot()` | empty array on error | none | Guest (opt-in, anonymized) |
| History | local `journey` filtered by shop+lot+user | `shopTastings` | — | localStorage | Guest |

**The exact failure pattern this task asked to re-check — "Supabase
correct → local cache incomplete → wrong/incomplete display" — was the
Category B gap this session already found and fixed**
(`COFFEE_GREEN_LOT_PROVENANCE_SYNC_IMPLEMENTATION.md`, commits `1de9600`/`6f8f5ae`,
confirmed present on `origin/main`). Before that fix, exactly this pattern
existed for every consumer of `useLots()` *except* the Passport page
itself (which always had its own separate, correct fetch chain). After
the fix, `rowToLot()` applies the same convention centrally, so the
pattern no longer exists for country/region/variety/process/cropYear/
producer fields on any surface. It was never possible for Roast
Intent/Taste Intent/Roast Batch specifically, since those are always
fetched fresh per-page (no local cache layer exists for them at all — see
§13).

## 11. Lifecycle

Café menu lifecycle (`is_active`/`status`/`scheduled_removal_at`, café-owned)
and Canonical Lot lifecycle (`status`/`in_roaster_catalog`, roaster-owned)
remain two independent axes, joined read-only by
`cafe_menu_entries_roaster_status_view` (migration `0027`, already
deployed and live-verified — `CANONICAL_LOT_CAFE_MENU_INTEGRITY_DEPLOYMENT.md`).
Not re-verified from scratch here per instruction §12; checked only as a
link: the Passport page's own `LotRemovalCountdown` reads café's own
`cafe_menu_entries` lifecycle fields directly (`useCafeMenuEntries`), never
the roaster-status view — the roaster-discontinued badge is a café/shop
*catalog-browsing* signal (`GuestLotPreviewCard`, `LotMenuCard`), not
rendered on the individual Lot Passport page itself. An archived Canonical
Lot does not gate an already-saved tasting's Passport view at all
(`latestTasting` branch is never status-gated, confirmed in §10's own
code read) — existing tasting history survives a roaster archiving a Lot,
by design (`PHASE_4.5.7_REPORT.md`'s own stated rule, re-confirmed by
re-reading the current code this session, not just cited from memory).

**Browser verification: NOT RUN — manual browser verification may be
performed separately.**

## 12. Ownership

Re-confirmed this session by reading RLS text directly, not assumed:

**Roaster owns** (all `for all using (is_roaster_staff_for(roaster_id))`
or the `lot_id`-joined equivalent): Coffee, Green Lot, Canonical Lot,
Roast Intent, Roast Batch (insert-only + immutable trigger), Taste Intent.
Café's `profiles.roaster_id` is never set (mutually exclusive with
`cafe_id`), so `is_roaster_staff_for()` structurally cannot match a café
account — confirmed from `ProfileRole`'s own type and the function's own
join condition.

**Café owns**: `cafe_menu_entries` (`is_active`/`status`/`scheduled_removal_at`/`lot_ref`),
gated by `profiles.cafe_id = coffee_shop_id`; Signature Recipe
(`BrewingRecipe` with `authorType: 'coffee_shop'`), its own save path
(`addBrewingRecipe`) confirmed untouched by the pending café read-only fix.

**Guest owns**: `checkins` (`auth.uid() = owner_user_id`), local `journey`
tastings, `UserCustomCoffee` ("Мой кофе" shelf — confirmed this session to
be a fully separate, unrelated entity with its own full CRUD, despite the
shared English word "coffee"; explicitly documented as never referencing
the Lot/Roaster/CoffeeShop catalog).

**Café write-ownership violation check**: no path exists, anywhere,
authorized by RLS, for café to write to `coffees`, `green_lots`,
`reference_roast_profiles`, `roast_batches`, or `reference_taste_profiles`.
The one UI surface that *technically* let café construct a
Canonical-Lot-shaped local object and "save" it — café's Lot-edit screen
reusing `LotBuilderForm` — is correctly classified (per
`CAFE_LOT_EDIT_OWNERSHIP_AUDIT.md`) as a **local-only UI affordance, never
a real write to the owner's data**: `saveLot()` is pure `localStorage`,
and Supabase (the actual source of truth) was never touched by it, on any
commit of this codebase, ever. The fix removing even that UI affordance is
implemented but **not yet committed** (see §1). This does not change the
classification (Category B, not C) — it changes only whether the
already-correctly-scoped fix has shipped.

## 13. Local Cache / Shadowing

Every local persistence mechanism in this chain, checked:

- **`lib/data/lotsStore.ts`'s `saveLot()`/`useLots()`**: the one real
  local-shadow mechanism in this entire chain. Overrides win **wholesale**
  (not field-by-field) over whatever `syncLotsFromSupabase()` computes for
  the same id — confirmed by re-reading the merge logic this session
  (`overrideIds.has(lot.id) ? overrides.find(...) : lot`). This is why the
  provenance-sync fix (§10) only benefits a device with **no** existing
  override for a given Lot — a device that already has one (the creating
  roaster's own, or a café's pre-fix stale edit) keeps showing it
  unchanged, exactly as `COFFEE_GREEN_LOT_PROVENANCE_SYNC_IMPLEMENTATION.md`
  itself already documented. Not re-litigated as a new finding here.
- **Roast Intent / Roast Batch / Taste Intent**: no local cache layer
  exists for any of these at all beyond React component state re-fetched
  per page load (`useRoastProfiles()` does cache roast batches locally via
  `lib/data/roastProfilesStore.ts`, structurally identical to `lotsStore.ts`'s
  own pattern — not audited field-by-field here since Roast Batch data is
  never user-editable after creation, so there is no local-edit path that
  could shadow it; only a *sync-staleness* window exists, self-correcting
  on next `syncRoastProfilesFromSupabase()` call). Reference profile
  *activation* itself has no local cache at all — every read
  (`getActiveReferenceRoastProfile`/`getReferenceTasteProfileById`/etc.)
  is a fresh Supabase call.
- **Coffee / Green Lot**: no local-first store exists for either (confirmed
  in `COFFEE_GREEN_LOT_OWNERSHIP_AUDIT.md`, re-confirmed here) — so
  neither can ever be locally overridden or shadowed independently of the
  `Lot` object that redundantly copies some of their fields as plain text.
- **Café menu (`cafe_menu_entries`)**: `lib/data/cafeMenuStore.ts` has the
  same "sync overlays local, view falls back to base table" idiom, already
  audited and deployment-verified in the closed café-menu-integrity block —
  checked only as a link here, not reopened.

No local mechanism was found capable of becoming a *new* source of truth —
every one either loses to a fresh Supabase read on the next sync (roast/
taste profiles, café menu) or is a known, already-classified, one-directional
shadow limited to the `Lot` object's own redundant text fields
(origin/name/qGrade/etc.), never to Roast/Taste Intent activation state or
to Coffee/Green Lot rows themselves.

## 14. Data Integrity Matrix

| Stage | Source of truth | Owner | Create | Edit | Read | Historical integrity | Status |
|---|---|---|---|---|---|---|---|
| Coffee | `public.coffees` | Roaster | Roaster only, RLS-gated | **None exists, for anyone** | Public (RLS `select using (true)`) | N/A (immutable by absence of edit path) | B |
| Green Lot | `public.green_lots` | Roaster | Roaster only or reused | **None exists, for anyone** | Public | N/A (FK to Coffee immutable by construction) | B |
| Canonical Lot | `public.lots` | Roaster | Roaster only, RLS-gated | Roaster only (`updateCanonicalLotFields`) | Public | `green_lot_id`/`roaster_id`/`public_id` immutable | A (café UI fix pending commit — see §1) |
| Roast Intent | `reference_roast_profiles` | Roaster | Roaster only | Versioned (supersede + new active) | Public | DB partial unique index, `planVersionActivation()` (14 unit tests) | A |
| Roast Batch | `roast_batches` | Roaster | Roaster only, insert-only | **Impossible** — DB trigger rejects UPDATE/DELETE | Public | Real DB-level immutability, not convention | A |
| Taste Intent | `reference_taste_profiles` | Roaster | Roaster only | Versioned (same mechanism as Roast Intent) | Public | DB partial unique index + live-E2E-verified per-checkin stamping | A |
| Check-in | `public.checkins` | Guest | Authenticated guest only (`auth.uid()`) | None (sensory data itself never updated) | Owner-only direct; anonymized subset public via view | `reference_taste_profile_ref` stamped once, never recomputed (live-verified) | A |
| Passport | Composite of all above | — | — | — | Every field resolved fresh or via the now-fixed `useLots()` join | Depends on above; no independent integrity risk of its own | A |

## 15. Findings A/B/C

**A — PASS**
- Roaster ownership of Coffee/Green Lot/Canonical Lot/Roast Intent/Roast
  Batch/Taste Intent — real RLS, verified by policy text.
- Roast Batch immutability — real DB trigger, not convention.
- Roast Intent and Taste Intent versioning — DB-level one-active-per-lot
  constraint, shared tested logic, correct historical read-side fallback.
- Taste Intent per-checkin historical stamping — live-verified against
  real Supabase data, not assumed.
- Coffee/Green Lot provenance now reaches every `useLots()` consumer, not
  just the Passport page — this session's own fix, committed and pushed
  (`1de9600`/`6f8f5ae` on `origin/main`).
- One Green Lot → many Canonical Lots — structurally cannot cross-
  contaminate; confirmed with live data.
- Café/guest cannot write to any roaster-owned table under any RLS-permitted
  path.

**B — IMPORTANT GAP — all three [RESOLVED] as of `COFFEE_GREEN_LOT_EDIT_PATHS_IMPLEMENTATION.md`**
1. ~~No edit path exists for Coffee, for anyone~~ (`NEXT_ARCHITECTURE_AUDIT.md`
   §3.1 / `COFFEE_GREEN_LOT_OWNERSHIP_AUDIT.md`). **[RESOLVED — `updateCoffee()`
   added to `lib/data/canonicalLotStore.ts`, commit `fb65c28`.]**
2. ~~No edit path exists for Green Lot, for anyone~~ — same shape, file, and
   prior citation as #1. **[RESOLVED — `updateGreenLot()`, same commit.]**
3. ~~The café Lot-edit read-only fix is implemented but not committed.~~
   **[RESOLVED — committed in `5e3c4ab`, verified on `origin/main`.]**

**C — BLOCKER**

None found. No mechanism exists, provable by RLS text or by the absence of
any write function, for a non-owner to actually change source-of-truth
data for Coffee, Green Lot, Canonical Lot, Roast Intent, Roast Batch, or
Taste Intent. The one UI-level false affordance (café's pre-fix Lot-edit
screen) never reached Supabase on any commit of this codebase — it is a
local-only illusion, not a data-integrity compromise, which is exactly why
it was classified B originally and remains B here.

## 16. Recommended Next Steps

All three next steps originally listed here were completed in
`COFFEE_GREEN_LOT_EDIT_PATHS_IMPLEMENTATION.md`:

1. ~~Commit and push the already-implemented café Lot-edit read-only fix~~ — done, `5e3c4ab`.
2. ~~Add `updateCoffee(coffeeId, fields)`~~ — done, `fb65c28`.
3. ~~Add `updateGreenLot(greenLotId, fields)`~~ — done, same commit.

No other gap in this chain has a concrete, provable mechanism attached to
it; every other surface checked in this audit resolved to PASS, and
remains PASS after the above implementation (re-verified in
`COFFEE_GREEN_LOT_EDIT_PATHS_IMPLEMENTATION.md`'s own §18 regression pass:
`tsc`/`vitest` 43/43/`build` all still pass, café ownership boundary
re-confirmed by grep, cross-entity isolation re-confirmed by reading both
new functions' SQL).

## 17. Final Verdict

**Superseded — see `COFFEE_GREEN_LOT_EDIT_PATHS_IMPLEMENTATION.md`.**

~~STATUS: GAPS FOUND~~ → **STATUS: PASS** (A: all checked areas; B: 0; C: 0),
per that report's own final regression. Original verdict preserved below
for the historical record:

> Category B only — three items, all previously identified in earlier
> session blocks, none newly discovered as broken here, one (café
> read-only) newly confirmed to be *uncommitted* rather than merely
> "pending." No Category C blocker exists anywhere in the audited chain.
