# Coffee / Green Lot Ownership — Architecture Audit

Audit only, per instruction. No code, schema, RLS, or data changed. Every
claim below is from a fresh read of the current code and schema this
session — `lib/data/canonicalLotStore.ts` in full, every page/component
referencing `createCoffee`/`Coffee`/`coffee_id`/`Green Lot`, migration
`0025_canonical_lot_rls.sql`, and every consumer of `useLots()`.

## Step 1 — Coffee

### Create

`createCoffee()` (`lib/data/canonicalLotStore.ts:201`) — the only writer of
`public.coffees` anywhere in the codebase (confirmed by grep: no other
`.from('coffees').insert` exists). Called from exactly one place:
`app/dashboard/roaster/new/page.tsx`'s `submitNewCoffee()`, itself only
reachable from the roaster's own "+ Создать новый кофе" button inside the
Coffee step of the New Lot wizard, gated by `roasterUuid` (resolved from
the signed-in `roaster_admin`'s own session via `resolveRoasterUuid`).
`roaster_id` on the inserted row is always this resolved uuid — never
caller-suppliable as an arbitrary value from outside this flow.

The same wizard's Coffee step also offers **reuse**: `listCoffeesForRoaster(roasterUuid)`
lists every Coffee this roaster already has, and `selectCoffee()` picks one
instead of creating a duplicate — a real reuse path, not just a create-only
form.

### Edit

**No edit path exists, for anyone, including the roaster.** Grepped the
entire codebase for `.from('coffees').update` and for a function named
`updateCoffee` — zero matches outside this and the earlier
`NEXT_ARCHITECTURE_AUDIT.md`'s own prior finding of the same gap (§3.1
there, re-confirmed independently here). No page under
`app/dashboard/roaster/**` renders an edit form against an existing Coffee
row. `LotBuilderForm`'s Origin-step fields (country/region/variety/process/
cropYear/farmer/farm/altitude) are pre-filled from the selected Coffee at
Lot-creation time (`buildOriginDefaults()` in `app/dashboard/roaster/new/page.tsx`)
but are then just plain, freely-editable text inputs on a `Lot` object —
editing them there **never writes back to `coffees`** (see the read-path
gap below for the full consequence of this).

### Delete

No delete path exists anywhere (grepped every `.delete()` call in the
codebase — four exist, for `recipes`, `events`, `shop_ranks`,
`shop_mute_preferences`; none for `coffees`).

### Local-only save path

None specific to Coffee. `saveLot()` (`lib/data/lotsStore.ts`) writes a
flat `Lot` object (which happens to carry copies of several
origin/provenance values as plain strings) to localStorage — but this is a
`Lot`-shaped local cache, not a `Coffee`-shaped one; there is no
`coffee-passport:coffee`/similar localStorage key or store file. (A
same-named but entirely unrelated `lib/data/customCoffeeStore.ts` exists —
`coffee-passport:custom-coffees`, backing the guest's personal "Мой кофе"
shelf on `/coffee-kitchen`. Its own header comment states it "deliberately
never references the Lot/Roaster/CoffeeShop catalog." Verified this is a
distinct, fully guest-owned entity with its own full CRUD, unrelated to
canonical `Coffee` — no naming collision in practice, just a shared English
word.)

### Supabase write path

`createCoffee()` only. Runs under the ordinary anon-key browser client,
authenticated as the signed-in `roaster_admin`; RLS is what actually
enforces ownership (see below), not this function.

### RLS (`supabase/migrations/0025_canonical_lot_rls.sql`)

```sql
create policy "public reads coffees" on public.coffees for select using (true);
create policy "roaster staff manage own coffees" on public.coffees
  for all using (is_roaster_staff_for(roaster_id)) with check (is_roaster_staff_for(roaster_id));
```
`is_roaster_staff_for(target_roaster_id)` joins `profiles.roaster_id` to
`roasters.slug` for `auth.uid()` — a café/barista profile (`cafe_id` set,
`roaster_id` null) never matches. **Café cannot write to `coffees` under
any circumstance RLS would allow** (the `for all` clause covers
INSERT/UPDATE/DELETE alike). Select is fully public (`anon, authenticated`),
by design — the same tier every other canonical table uses.

### Can café create a local override of Coffee?

No — there is no `Coffee`-shaped local store, and no page ever constructs
a `Coffee`-shaped object from café-side input. Café never touches
`createCoffee`/any Coffee-shaped local cache at all.

### Can editing Coffee affect the Passport or other Lots?

By design, yes, and correctly so — one Coffee can be the origin for
several Green Lots, each with several Canonical Lots (see Step 2's reuse
scenario), and `app/(site)/passport/[lotId]/page.tsx`'s
`withCanonicalCoffeeOverlay()` prefers the real Coffee row over a Lot's own
locally-diverged text for every guest, for every Lot under that Coffee. In
practice this is currently moot (no edit path exists to test), but the
*read* side already treats Coffee as authoritative where it has data — see
the read-path gap below for why this correct convention doesn't actually
reach most surfaces today.

## Step 2 — Green Lot

Structurally identical to Coffee in every respect:

- **Create**: `createGreenLot()` (`lib/data/canonicalLotStore.ts:258`), the
  only writer of `public.green_lots` anywhere, called only from
  `app/dashboard/roaster/new/page.tsx`'s `submitNewGreenLot()`, itself only
  reachable from the roaster's own wizard, `roaster_id` always the
  resolved session uuid.
- **Reuse (one Green Lot → many Canonical Lots)**: confirmed structurally
  sound. `listGreenLotsForCoffee(coffeeId)` lists every existing Green Lot
  under a Coffee; `selectGreenLot()` picks one; `createCanonicalLot()`
  (line 295) only ever *reads* `input.greenLotId` to store as the new
  Lot's `green_lot_id` foreign key — it contains **zero** writes to
  `green_lots` itself. `listCanonicalLotsForGreenLot(greenLotId)` (line
  443) is a pure read used by `CanonicalLotChain.tsx` to show every
  sibling Lot sharing one Green Lot — confirming the reuse relationship is
  visible, not just theoretically possible. There is no code path,
  anywhere, that could mutate a Green Lot's own fields as a side effect of
  creating, editing, or viewing any specific Canonical Lot built from it —
  provenance for a shared Green Lot cannot be accidentally changed through
  one of its several Canonical Lots.
- **Edit**: no edit path exists, for anyone (grepped for
  `.from('green_lots').update`/`updateGreenLot` — zero matches beyond the
  prior audit's own §3.2 finding of the same gap, re-confirmed here).
  `CanonicalLotChain.tsx` renders Green Lot data (`describeCanonicalGreenLot`)
  read-only — no edit form exists anywhere in the codebase.
- **Delete**: no delete path exists anywhere.
- **Local override**: none — no Green-Lot-shaped local store exists.
- **RLS**: identical shape to Coffee —
  ```sql
  create policy "public reads green lots" on public.green_lots for select using (true);
  create policy "roaster staff manage own green lots" on public.green_lots
    for all using (is_roaster_staff_for(roaster_id)) with check (is_roaster_staff_for(roaster_id));
  ```
  Café has zero write access under any circumstance.
- **Immutable FK linkage**: `Lot.greenLotId`/`CanonicalLot.greenLotId` is
  never present at all on the local `Lot` type (`lib/types/coffee.ts`) —
  local edits (roaster or café, past or present) physically cannot touch
  it, since the field doesn't exist on that object. `MutableCanonicalLotFields`
  (canonicalLotStore.ts:346) explicitly excludes `green_lot_id`/any
  origin-changing field from its own type, with a comment stating exactly
  why. A Canonical Lot's parent Green Lot is immutable after creation by
  construction — no function exists that could change it, not merely "one
  that's blocked by RLS."

## Step 3 — Ownership matrix

| Entity | Owner | Create | Edit | Delete | Café access | Immutable |
|---|---|---|---|---|---|---|
| Coffee | Roaster | Roaster only (`createCoffee`, RLS-gated, real Supabase insert) | **No path exists for anyone** — architecturally roaster-only by RLS if one were ever built | No path exists for anyone | None — no read or write function for Coffee is ever called from any café page; RLS itself grants café nothing beyond public `select` | `id`/`roaster_id` immutable by construction (no update path exists at all) |
| Green Lot | Roaster | Roaster only (`createGreenLot`) or reused (`listGreenLotsForCoffee` → pick existing) | **No path exists for anyone** | No path exists for anyone | None | `coffee_id`/`roaster_id` immutable by construction; the FK doesn't even exist on the local `Lot` type for anything to accidentally touch |
| Canonical Lot | Roaster | Roaster only (`createCanonicalLot`) | Roaster only (`updateCanonicalLotFields`: name/status/inRoasterCatalog/qGrade/roastType/roastProfileLabel/descriptors; `activateTasteProfile` for Taste Intent) — RLS-gated | No path exists for anyone | **Read-only** (`CAFE_LOT_EDIT_OWNERSHIP_IMPLEMENTATION.md` — code complete, pending final live E2E + commit at time of writing) | `green_lot_id`/`roaster_id`/`public_id` immutable by construction |

Every "no path exists" cell was confirmed by grep across the whole
codebase for the relevant Supabase `.update()`/`.delete()` call and for a
plausibly-named function — not inferred from RLS or from absence of a UI
button alone.

## Step 4 — Local shadowing (all consumer surfaces)

**Coffee/Green Lot write-side shadowing: none found.** Neither has a
local-first store of its own (unlike `Lot` via `lib/data/lotsStore.ts`), so
there is no `saveX()`-shaped function that could ever write a local
override of a `Coffee` or `Green Lot` object. This part of Step 4's
question is a clean PASS.

**Canonical Lot write-side shadowing: already found and addressed** in the
prior `CAFE_LOT_EDIT_OWNERSHIP_AUDIT.md`/`_IMPLEMENTATION.md` blocks —
café's `saveLot()` call for Canonical-Lot fields has been removed and the
screen made read-only (code complete; final live-E2E confirmation and
commit were pending at the time of this audit — see that report's own
STATUS). Not re-litigated here.

**A new, broader read-side gap was found, not previously documented**
(checked `NEXT_ARCHITECTURE_AUDIT.md` explicitly — it found the *absence
of a Coffee/Green Lot edit path* but not this):

### `useLots()` never reads `coffees`/`green_lots` at all, except on one page

`syncLotsFromSupabase()` (`lib/data/lotsStore.ts:138`) queries only
`'*, roasters(slug), reference_taste_profiles(...)'` on `lots` — no join to
`coffees` or `green_lots` anywhere in that query. `rowToLot()`
(`lib/data/lotsStore.ts:100`) sources every origin field
(`country`/`region`/`variety`/`process`/`cropYear`/`producer.*`) purely
from `fallback` — the *pre-existing* local cache entry for that same
`public_id`, which is either:
- a hardcoded `SEED_LOTS` row (`lib/data/lots.ts` — confirmed exactly 4
  ids: `LOT-XO-ETH-001`, `LOT-XO-COL-004`, `LOT-NS-KEN-002`,
  `LOT-NS-ETH-003`), always present, identical on every device, or
- a `saveLot()`-populated localStorage override from *this exact browser*
  having previously created or edited this Lot.

For any **real** Lot created through the actual roaster wizard since this
architecture shipped (confirmed live in an earlier session block: at least
`LOT-XO-COL-001`, `LOT-XO-ETH-002`, `LOT-XO-ETH-003`, `LOT-XO-ETH-004` exist
in the live `lots` table and are **not** in `SEED_LOTS`), any device that
never locally created/cached that specific Lot has `fallback === undefined`
for it, so every one of those origin fields resolves to `''` (empty
string) — **even though a real, populated `coffees` row for that Lot's
origin exists in Supabase.**

Exactly one surface compensates for this:
`app/(site)/passport/[lotId]/page.tsx`'s `withCanonicalCoffeeOverlay()`
(line 61), fed by its own separate `findCanonicalLotByPublicId` →
`getGreenLotById` → `getCoffeeById` fetch chain (confirmed in the page's
own effects). It correctly prefers the real Coffee row and falls back to
the local Lot's value only where Coffee has nothing recorded — the right
convention, just implemented in exactly one place.

**Every other surface reading `lot.country`/`lot.region` directly from
`useLots()` does not apply this overlay and is affected**, confirmed by
grep + read of each:
- `components/coffee/CatalogHierarchy.tsx:40` — groups the entire
  3-level guest/roaster/café catalog navigation **by `lot.country`**. A
  real Lot with a blank `country` on a given device cannot be found under
  its real country there.
- `app/dashboard/roaster/page.tsx:272` — the roaster's own dashboard list
  renders `{lot.country} · {lot.region}` directly, and also feeds
  `CatalogHierarchy`. A **second** staff member of the *same* roaster, on
  a different device, would see blank origin for a Lot a colleague created
  — this is not café-specific.
- `app/dashboard/cafe/add-lot/page.tsx:202` — café's own "browse every
  roaster's catalog" list, same direct read.
- `app/dashboard/cafe/[lotId]/edit/page.tsx` — the just-made-read-only
  screen from the prior block: correctly *prevents editing*, but the
  values it now displays read-only are subject to this same gap — café's
  device, having never locally cached this Lot before the recent fix
  removed its own local-write path, would show **blank**
  country/region/farmer/farm/altitude/process/cropYear/story for any real
  (non-seed) Lot, not the roaster's actual data. (A café browser that
  *had* previously used the now-removed editable path could instead be
  showing its own stale prior edit as if it were canonical — a residual,
  already-acknowledged effect of that prior gap, not a new one.)
- `/shop/[shopId]` (`GuestLotPreviewCard`) and `/dashboard/cafe`
  (`LotMenuCard`, via `CatalogHierarchy`) — same direct-read pattern for
  guest-facing and café-facing menu browsing.

This is **not an ownership violation** — nobody writes incorrect data to
`coffees`/`green_lots`, and the source of truth is exactly where it should
be (Roaster-owned, RLS-correct). It is a **read-path completeness gap**:
the correct "Coffee overlay wins" convention was built once, for one page,
and never generalized to the shared `rowToLot()` mapping every other
surface relies on — and the gap is specifically masked by local shadowing
on the one device most likely to test it (the creating roaster's own
browser, whose local cache happens to already hold the right values from
`saveLot()` at creation time), which is exactly the failure pattern this
audit's Step 4 was asked to look for.

## Step 6 — Already-approved architectural rules re-checked

No café ownership is proposed anywhere in this report for Coffee, Green
Lot, or Canonical Lot — every finding above either confirms existing
Roaster-only ownership (RLS-backed) or flags a read-path gap that affects
*all* non-creating devices equally, roaster and café alike, not something
that argues for expanding café's permissions. Café's read-only Lot-edit
screen (`LotBuilderForm` reused with `readOnly`, per the prior block) is a
component-reuse pattern, correctly limited to display — this audit found
no case where reusing a roaster component accidentally granted café any
write capability beyond what was already identified and fixed in the prior
block.

---

## Findings summary

**A — PASS**
- Coffee create: Roaster-only, RLS-enforced, real Supabase write.
- Green Lot create/reuse: Roaster-only, RLS-enforced; one Green Lot → many
  Canonical Lots is structurally sound and cannot be accidentally
  corrupted through any one Canonical Lot.
- Canonical Lot's FK linkage to Green Lot (and Green Lot's to Coffee) is
  immutable by construction — no function exists to change it, for anyone.
- No local-override write path exists for Coffee or Green Lot specifically.
- Café has zero write access to `coffees`/`green_lots`/`lots` under RLS,
  confirmed by policy text, not assumption.
- Café's Canonical Lot local-shadowing write gap: already found and fixed
  (prior block; pending only final live-E2E confirmation and commit).

**B — IMPORTANT GAP**
1. **No Coffee edit path exists, for anyone** (re-confirmed independently;
   originally found in `NEXT_ARCHITECTURE_AUDIT.md` §3.1).
   - File: `lib/data/canonicalLotStore.ts` — no `updateCoffee()`.
   - Why it matters: a roaster's typo in country/farm/producer at creation
     time is permanent; `LotBuilderForm`'s origin fields *look* editable
     on the Lot edit screen but silently never reach `coffees`.
   - Minimal fix: an `updateCoffee(coffeeId, fields)` mirroring
     `updateCanonicalLotFields`'s shape; RLS already supports it
     (`for all using (is_roaster_staff_for(roaster_id))`) — no RLS change
     needed.
   - Affects existing data: no — purely additive.
2. **No Green Lot edit path exists, for anyone** — same shape as #1, lower
   guest-visibility (Green Lot fields aren't rendered on the Public
   Passport). File/fix: same pattern, `updateGreenLot()`.
3. **`useLots()`'s read path never joins `coffees`/`green_lots`, so every
   surface except the Public Passport shows blank origin data for any
   real (non-seed) Lot on a device that didn't create it** — this
   session's own new finding, detailed in full under Step 4 above.
   - Files: `lib/data/lotsStore.ts` (`syncLotsFromSupabase`, `rowToLot`);
     consumers affected: `components/coffee/CatalogHierarchy.tsx`,
     `app/dashboard/roaster/page.tsx`, `app/dashboard/cafe/add-lot/page.tsx`,
     `app/dashboard/cafe/[lotId]/edit/page.tsx`, `GuestLotPreviewCard`/`LotMenuCard`
     call sites.
   - Why it matters: this is the exact "local shadow masks a real bug"
     pattern the audit was asked to look for — it just turned out to be
     broader than Canonical-Lot fields alone, and not café-specific (a
     second roaster device is affected identically).
   - Minimal fix: extend `syncLotsFromSupabase()`'s query to also resolve
     each Lot's Coffee (via its Green Lot) and apply the same "Coffee
     wins where present, local value only as fallback" convention
     `withCanonicalCoffeeOverlay()` already uses correctly — but inside
     `rowToLot()` itself, so every consumer of `useLots()` benefits at
     once instead of each page needing its own copy of that logic.
   - Affects existing data: no — read-only, additive; no write, no schema,
     no migration needed.

**C — BLOCKER**

None found. No path exists, for café or any other non-owner role, to
write to `coffees`, `green_lots`, or `lots` that RLS would actually permit
to succeed — every write function in `canonicalLotStore.ts` runs under
`is_roaster_staff_for(roaster_id)`, which structurally excludes café. The
only real write-side gap this session (café's local `saveLot()` shadow of
Canonical Lot fields) was already identified and fixed in the prior block.

---

**STATUS: GAPS FOUND** (Category B only — no blockers; no ownership
violation exists or was found possible under current RLS)
