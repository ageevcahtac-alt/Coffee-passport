# Coffee / Green Lot Provenance Sync — Implementation

Implements the Category B gap from `COFFEE_GREEN_LOT_OWNERSHIP_AUDIT.md`:
`syncLotsFromSupabase()` never joined `coffees`/`green_lots`, so any device
without a pre-existing local cache entry for a real (non-seed) Lot saw
blank origin/provenance, even though a real `coffees` row existed.

**Closed.** Code, `tsc`, `vitest`, and `build` are all complete and
passing. A follow-up session explicitly instructed not to attempt or
retry the Claude-in-Chrome browser connection for this block, and stated
that browser unavailability is not a reason to leave a block with fully
passing automated validation uncommitted — live browser E2E is therefore
recorded below as **NOT RUN — browser integration intentionally not
used**, not as BLOCKED, and this block was committed and pushed on that
basis.

## Root cause

`syncLotsFromSupabase()` (`lib/data/lotsStore.ts`) queried only
`'*, roasters(slug), reference_taste_profiles(...)'` on `lots` — no join to
`green_lots` or `coffees` anywhere. `rowToLot()` sourced every origin field
(`country`/`region`/`variety`/`process`/`cropYear`/`producer.*`) purely
from `fallback` (the pre-existing local cache entry for that `public_id`):
either a hardcoded `SEED_LOTS` row (always present, identical everywhere)
or a `saveLot()`-populated localStorage override from a device that had
previously created/edited that specific Lot. Any device without either —
a second staff device, café's browser, a guest's fresh browser browsing
the shop/catalog pages — saw `''` for every one of those fields on any
real Lot, since nothing in this function's query or mapping ever reached
the actual `coffees` row. Exactly one surface,
`app/(site)/passport/[lotId]/page.tsx`, compensated for this with its own
separate `findCanonicalLotByPublicId` → `getGreenLotById` → `getCoffeeById`
fetch chain (`withCanonicalCoffeeOverlay`) — every other consumer of
`useLots()` was affected.

## Read paths changed

**`lib/data/lotsStore.ts`** only. No other file was touched — per the
audit's own recommendation, the fix was made once, centrally, in the
shared `rowToLot()`/`syncLotsFromSupabase()` mapping every surface already
goes through, rather than adding a separate fetch to each screen.

1. **Query** (`syncLotsFromSupabase()`): added
   `green_lots(coffees(country, region, farm, producer, variety, altitude, processing, harvest_year))`
   to the existing `.select(...)` string — nested the same way
   `roasters(slug)` already was. `lots.green_lot_id -> green_lots.id` and
   `green_lots.coffee_id -> coffees.id` are both many-to-one, so PostgREST
   returns a single object at each level (not an array), matching how
   `roasters(slug)` already behaves in this same query.
2. **Type** (`LotWithRefs`): added
   `green_lots: { coffees: Pick<CoffeeRow, ...> | null } | null` — the
   existing `as unknown as LotWithRefs[]` cast pattern (already used here
   because this hand-written `database.ts` declares `Relationships: []`
   for every table, so the generated Supabase client type can't infer
   nested embeds on its own) needed no change.
3. **Mapping** (`rowToLot()`): now resolves
   `const coffee = row.green_lots?.coffees ?? null;` and uses
   `coffee?.field || fallback?.field || ''` for
   country/region/variety/process/cropYear/producer.farmerName/farmName/altitude
   — the exact same "Coffee wins when present, fall back to the local
   value only where Coffee has nothing recorded" convention
   `withCanonicalCoffeeOverlay()` already used correctly on the Passport
   page, now applied at the one shared mapping point instead of being
   hand-rolled per page. `producer.story` is unchanged: always sourced
   from `fallback` only, since Coffee has no story-equivalent field —
   matching the Passport overlay's own explicit convention for the same
   reason.
4. **Export**: `rowToLot` changed from module-private to exported, purely
   so `lib/data/lotsStore.test.ts` can assert its mapping directly (same
   convention as `lib/journey/store.ts`'s `recordToRow`). No behavior
   change.

## How `Lot → Green Lot → Coffee` now works

```
syncLotsFromSupabase()
  → SELECT lots.*, roasters(slug), reference_taste_profiles(...),
           green_lots(coffees(country, region, farm, producer,
                               variety, altitude, processing, harvest_year))
  → rowToLot(row, existingLocalEntry)
      country  = row.green_lots?.coffees?.country  || existingLocalEntry?.country  || ''
      region   = row.green_lots?.coffees?.region   || existingLocalEntry?.region   || ''
      variety  = row.green_lots?.coffees?.variety  || existingLocalEntry?.variety  || ''
      process  = row.green_lots?.coffees?.processing || existingLocalEntry?.process || ''
      cropYear = row.green_lots?.coffees?.harvest_year || existingLocalEntry?.cropYear || ''
      producer.farmerName = coffees?.producer  || existingLocalEntry?.producer.farmerName || ''
      producer.farmName   = coffees?.farm      || existingLocalEntry?.producer.farmName   || ''
      producer.altitude   = coffees?.altitude  || existingLocalEntry?.producer.altitude   || ''
      producer.story      = existingLocalEntry?.producer.story ?? ''   // no Coffee equivalent
```
This result then flows into `useLots()` exactly as before — no consumer
needed any change, per the audit's own instruction not to add a separate
fetch per screen.

**One existing, unchanged mechanism is worth stating precisely** (not new,
not touched by this fix): `syncLotsFromSupabase()`'s own merge step
(`overrideIds.has(lot.id) ? overrides.find(...) : lot`) makes a local
override win **wholesale**, not field-by-field, for any id that already
has one. This fix only changes what the *canonical* branch computes — it
does not change which branch wins when both exist. That is exactly why
scenario A below was never broken and needs no fix, and why a device with
an already-cached (possibly still-incomplete) override for a given Lot
will keep showing that override unchanged by this fix — only a device
with **no** override for that specific Lot benefits immediately, which is
precisely scenario B, the one the audit and this task both named.

## Affected surfaces

No file other than `lib/data/lotsStore.ts` was changed, so every consumer
of `useLots()` benefits automatically from the same fix:
`components/coffee/CatalogHierarchy.tsx` (country-grouped navigation),
`app/dashboard/roaster/page.tsx`, `app/dashboard/cafe/add-lot/page.tsx`,
`app/dashboard/cafe/[lotId]/edit/page.tsx` (the recently-made-read-only
screen — now also correctly *populated*, not just correctly
non-editable), `/shop/[shopId]`'s `GuestLotPreviewCard`, and
`/dashboard/cafe`'s `LotMenuCard`. `app/(site)/passport/[lotId]/page.tsx`
was **not modified** — its own separate `withCanonicalCoffeeOverlay` fetch
chain is untouched and keeps working exactly as before; since both paths
apply the identical "Coffee wins when present" convention against the
same underlying `coffees` row, they cannot conflict — at most, the
Passport's own fetch is now redundant with what `useLots()` itself would
already carry, which is a pre-existing, harmless duplication this task
explicitly said not to touch ("не создавать второй конфликтующий source
of truth" — there is no conflict, just an intentionally-preserved second
reader of the same source).

## Cache / legacy behavior

- **A. Lot created on this device**: unaffected. The creating device's own
  local override already has correct origin text from `saveLot()` at
  creation time; the override-wins-wholesale merge means this fix's new
  canonical computation is never even consulted for that id on that
  device.
- **B. Lot loaded on another device**: fixed. No override exists for that
  id there, so the canonical branch — now carrying real Coffee data —
  is what populates `useLots()`. Covered by
  `lotsStore.test.ts`'s `"B: populates provenance for a Lot with no
  pre-existing local cache entry"`.
- **C. Existing local Lot**: not clobbered. `coffee?.field || fallback?.field || ''`
  means an empty/incomplete Coffee response never overwrites good existing
  data with blanks (the `||` falls through to `fallback`); and, separately,
  the pre-existing override-wins-wholesale merge means an existing full
  override is never touched by the canonical computation at all. Covered
  by `lotsStore.test.ts`'s `"does not let an empty Coffee field overwrite
  good existing local data"` and `"C: never overwrites an existing local
  override with the canonical row"`.
- **D. Legacy/local Lot without full Supabase provenance**: no crash.
  `row.green_lots?.coffees ?? null` and the `||` chain handle a `null`
  `green_lots` (or a `green_lots` whose own `coffees` is `null`) gracefully
  — every field simply falls back to `fallback`/`''`. Covered by
  `lotsStore.test.ts`'s `"D: a row with no green_lots join at all does not
  throw"` and `"never crashes and returns empty strings with no fallback
  and no Coffee data at all"`.
- **E. Public Passport**: untouched file, own fetch chain still works
  exactly as before — no second, conflicting source of truth was created;
  both paths read the same `coffees` row via the same FK chain.

## Tests

New: `lib/data/lotsStore.test.ts` (9 tests, all passing):
- `rowToLot` (5 tests): full Coffee data preferred over empty fallback;
  falls back when `green_lots` is `null`; falls back when `green_lots.coffees`
  is `null`; never crashes with neither fallback nor Coffee data; an empty
  individual Coffee field doesn't overwrite good existing local data;
  `producer.story` always comes from `fallback`.
- `syncLotsFromSupabase` (3 tests): scenario B (new device, no override —
  provenance populated), scenario C (existing override — never overwritten),
  scenario D (no `green_lots` join at all — no throw, other fields still
  sync).

Mocks `@/lib/supabase/browserClient` and uses the same minimal in-memory
`localStorage` stand-in established in `lib/journey/store.test.ts` (no
jsdom in this project).

## TSC

`npx tsc --noEmit` — clean, no errors.

## VITEST

`npx vitest run` — **32/32 passed** (23 pre-existing + 9 new in
`lotsStore.test.ts`).

## BUILD

`npm run build` — succeeded, all 39 routes generated.

## BROWSER E2E

**NOT RUN — browser integration intentionally not used.** A follow-up
session explicitly instructed not to attempt or retry the Claude-in-Chrome
connection for this block, and confirmed that browser unavailability is
not grounds to leave a block with fully passing `tsc`/`vitest`/`build`
uncommitted. The clean/empty-cache scenario (scenario B) this task
originally asked to verify live is covered instead by an automated test
(`lotsStore.test.ts`'s `"B: populates provenance for a Lot with no
pre-existing local cache entry"`) — a real live-browser pass on a genuinely
clean device remains open for manual verification later, at the user's
discretion, per this session's own instruction.

## FILES CHANGED

- `lib/data/lotsStore.ts` — the fix itself (query, type, mapping, `rowToLot` export).
- `lib/data/lotsStore.test.ts` — new test file.

No other file was touched. Confirmed via `git diff --stat` against `HEAD`
that `lib/data/lotsStore.ts`'s entire diff belongs to this block alone (no
interleaving with any other in-flight, uncommitted work) — safe to stage
directly, no surgical baseline-extraction needed. The repository carries
substantial unrelated uncommitted work from earlier session blocks the
user never asked to commit; `git status`/`git diff` were checked before
staging and none of it was included (confirmed by `git status --short`
immediately after staging: only these two files show as staged, `A`/`M`,
everything else remains `M`/`??`).

## COMMIT HASH

`1de9600a52e3a6725818437062364380e183c9f5` — "fix: sync canonical lot provenance"

## BRANCH

`main`

## PUSH RESULT

Pushed successfully (`1e76fb6..1de9600  main -> main`). Independently
verified via `git fetch origin main` followed by `git rev-parse HEAD` and
`git rev-parse origin/main` — both resolve to
`1de9600a52e3a6725818437062364380e183c9f5`. The commit is present on
`origin/main`.

---

**STATUS: PASS**

`tsc`, `vitest` (32/32, including 9 new targeted tests covering exactly
the scenarios this task named: full provenance, missing Green Lot, missing
Coffee, no-fallback edge case, partial-response non-clobbering, existing
local-override preservation, and the A–D cache-interaction scenarios), and
`build` all pass. Browser E2E was intentionally not run this session, per
explicit instruction, and is not treated as blocking given full automated
validation passed.

**GIT: COMMITTED AND PUSHED** — commit `1de9600` on `main`, verified
present on `origin/main`.
