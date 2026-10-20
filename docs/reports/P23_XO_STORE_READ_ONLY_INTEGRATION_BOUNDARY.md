# P23 — Coffee Passport Read-Only XO Roasting Integration Boundary

## 1. Executive Summary

Built one new, additive, read-only server endpoint —
`GET /api/integrations/xo-store/lots` — that returns every Canonical Lot
owned by `roaster-xo` (XO COFFEE Roasting), scoped by the existing
`public.lots.roaster_id` ownership column, resolved via the existing
`public.roasters.slug` anchor. The roaster is hardcoded server-side; the
endpoint accepts no caller-supplied roaster parameter, so it structurally
cannot become a general "Lots by any roaster" surface. Authentication is
a server-to-server bearer secret (`XO_STORE_INTEGRATION_SECRET`), same
shape as the existing `EVENTS_CRON_SECRET` pattern already in this repo.
No new table, no new migration, no change to Canonical Lot architecture,
RLS, tasting, claim logic, café menus, or the public Passport route.

Live-verified against the real Supabase project (dev server, real
request/response, not mocked): the endpoint returns exactly the 2 real
active XO Lots (`LOT-XO-ETH-001`, `LOT-XO-COL-004`) and correctly excludes
the 4 draft P16 test fixtures and both North Star Lots — see §13.

## 2. Existing Ownership Primitive

Unchanged from P20 — reused, not reinvented:

- `public.lots.roaster_id` (uuid, FK → `public.roasters.id`) —
  the real ownership column.
- `public.roasters.slug` (text, unique) — the stable, human-readable
  anchor; `roaster-xo` resolves to `XO COFFEE Roasting`'s uuid. This is
  the same bridge pattern `0025_canonical_lot_rls.sql`'s
  `is_roaster_staff_for()` already uses to go from a stable text anchor
  to the real uuid, applied here for a read instead of a write policy.
- `public.lots.status` (`draft`/`testing`/`active`/`archived`) and
  `public.lots.in_roaster_catalog` (boolean) — both pre-existing, used
  as the eligibility filter (§7), no new status invented.

No ownership system was created or modified.

## 3. Existing Data Access

`listCanonicalLotsForRoaster(roasterUuid)`
(`lib/data/canonicalLotStore.ts:178`) already implements exactly "every
Canonical Lot owned by roaster X" — `.from('lots').select('*').eq('roaster_id', roasterUuid)`
— and is already in production use (Phase 4.5.5 roaster dashboard
catalog). It was **not imported directly**: it is a `'use client'` module
built for a signed-in roaster's own browser session (no server-context
use, no status/in_roaster_catalog filter, returns the full internal row
shape). The new route reimplements the same `roaster_id`-scoped filter
shape server-side, plus the two eligibility filters this specific
integration needs, rather than repurposing a client-only function or
duplicating unrelated SQL. The `green_lots(coffees(...))` nested-select
for origin fields mirrors `lib/data/lotsStore.ts`'s
`syncLotsFromSupabase()` join shape exactly (same relationship path,
same columns subset) — not a new join pattern.

## 4. Integration Endpoint

```
GET /api/integrations/xo-store/lots
```

File: `app/api/integrations/xo-store/lots/route.ts`. Location chosen by
following this repo's existing convention (`app/api/<feature>/route.ts`,
e.g. `app/api/events`, `app/api/cron/*`) with an `integrations/xo-store/`
prefix so the path itself documents scope and consumer — no other
`app/api` route in this repo mixes multiple concerns under one path, and
this one is deliberately not named `/api/lots` (which would read as a
general Lots API this explicitly is not, per §6).

`export const dynamic = 'force-dynamic'` is set — same fix
`app/api/events/route.ts` already applies, for the same reason: Next.js's
App Router caches GET fetches by default, which would otherwise let a
newly-created Lot serve a stale (missing) snapshot for an arbitrary TTL,
defeating the "no deploy needed" requirement.

## 5. Endpoint Contract

```json
{
  "lots": [
    {
      "public_id": "LOT-XO-ETH-001",
      "name": "Ethiopia Guji",
      "country": "Ethiopia",
      "region": "Guji",
      "variety": "Heirloom",
      "process": "Washed",
      "q_grade": 87
    }
  ]
}
```

Chosen deliberately minimal, per the brief's own instruction not to add
fields "just because the name seems convenient": `public_id` (identity,
§6), `name` (merchant display), and the four origin fields a merchant
needs to tell two Lots apart at a glance (`country`, `region`, `variety`,
`process` — sourced from the joined `coffees` row, defaulting to `''`
when a Lot has no linked Coffee yet, never `null`/omitted, so XO Store's
consumer never has to special-case a missing key). `q_grade` included
as-is (`number | null`) since it's a plain column on `lots` itself.
**Deliberately excluded**: the internal uuid `lots.id`, `roaster_id`,
`green_lot_id`, `status`, `in_roaster_catalog`, `descriptors`,
`roast_type`, `roast_profile_label`, `legacy_text_id`, all timestamps —
none of these are needed for "show a merchant this Lot so they can decide
whether to add it," and every one of them is either an internal
implementation detail or something Coffee Passport should be free to
change later without that being a contract-breaking change for XO Store.
Adding a field later is non-breaking; this list is deliberately small so
that decision stays available.

## 6. XO Ownership Filter

The roaster is **hardcoded** in the route file
(`const XO_ROASTER_SLUG = 'roaster-xo'`) and resolved to a uuid
server-side on every request — never accepted as a query parameter,
header value, or body field from the caller. This directly satisfies the
brief's §5 constraint: there is no `?roaster=`/`?roaster_id=` input at
all, so there is no way for a caller to ask this endpoint for a different
roaster's Lots, by design — not by convention, not by a filter that could
be bypassed, but because the code path that would need such a parameter
does not exist.

## 7. Status / Test Filtering

No new status was invented. The query filters on two pre-existing
columns together:

- `status = 'active'` — excludes `draft`, `testing`, `archived`. This is
  what excludes the four P16 E2E fixtures (`LOT-XO-ETH-002/003/004`,
  `LOT-XO-COL-001`, all `status: 'draft'`, per P18/P19) without any
  Lot-specific denylist.
- `in_roaster_catalog = true` — the roaster's own existing "still current
  in my own catalog" flag (`0022_canonical_lot_core.sql`'s own comment:
  "Roaster's own 'still in production' catalog flag"). Applied here
  because this endpoint's purpose is specifically "eligible for a
  merchant to newly pick up," which is a stricter question than "does a
  shop that already stocked this still get to show it" (the concern that
  flag's own schema comment is actually about) — so this application is
  a deliberate, documented choice, not an assumption that the two
  concerns are identical.

Both conditions are existing, already-meaningful columns — no schema
change, no new enum value, no `is_test`/`is_fixture` flag added.

## 8. Security Model

Reaffirming P20's own finding, load-bearing for this design: `public.lots`
grants `select` to `anon` with `using (true)`
(`0025_canonical_lot_rls.sql`) — RLS is intentionally fully public on this
table (a guest must read a Lot with no session), so **RLS provides zero
enforcement of "XO Store only sees XO's Lots."** That exclusivity is
provided entirely by this endpoint's own code (§6) and nothing else —
confirmed by design, not assumed.

Given that, the client used is deliberately the **anon key**, not the
service-role key (`lib/supabase/publicServerClient.ts`, new file): this
route only ever reads data RLS already makes public to anyone, so it has
no reason to hold an elevated credential — `SUPABASE_SERVICE_ROLE_KEY` is
never touched by this endpoint. This is a deliberate departure from
`app/api/events/route.ts`'s own precedent (which uses
`createAdminSupabaseClient()`, i.e. service role, for a table that is
*also* publicly readable) — least privilege was chosen over matching that
precedent, since the brief explicitly asked whether anon/public key use
is safe here (§6 of the brief) and it demonstrably is: this endpoint can
do nothing an anonymous guest's own browser could not already do by
calling the same tables directly.

`lib/supabase/adminClient.ts` (service role) and `lib/supabase/server.ts`
(cookie/session-bound SSR client) were both considered and rejected:
the former would grant unnecessary elevated access, the latter pulls in
`next/headers` cookie-jar machinery irrelevant to a stateless
server-to-server call with no Coffee Passport user session involved.
`lib/supabase/publicServerClient.ts` is a new, minimal, third option in
`lib/supabase/` created because none of the other two fit — not a
duplicate of either.

## 9. Authentication

**Option A from the brief** (server-to-server shared secret) — chosen
after inspecting the repo's own existing precedent for exactly this
shape: `lib/events/cronAuth.ts`'s `isCronRequestAuthorized()` already
implements "reject unless `Authorization: Bearer <SECRET_ENV_VAR>`
matches, fail-closed if unset" for the two events-cron routes. The new
`lib/integrations/xoStoreAuth.ts` (`isXoStoreIntegrationRequestAuthorized`)
mirrors that shape exactly, using its own new env var
(`XO_STORE_INTEGRATION_SECRET`) rather than sharing `EVENTS_CRON_SECRET`
— kept separate deliberately, so rotating one credential (a different
consumer, a different trust relationship) can never affect the other.
Fails closed: if the env var is unset, every request is rejected, not
silently left open.

No OAuth, no JWT, no per-request signing was introduced — the brief
explicitly asked not to over-build auth, and a single rotatable shared
secret is proportionate to "one known, trusted server-side consumer,"
matching what this codebase already does for its one other
external-service integration point.

## 10. CORS / Server-to-Server Flow

No CORS headers were added, and none should be: this endpoint is designed
to be called **from XO Store's own backend**, never from a browser
running XO Store's frontend JS directly. The brief's own preferred model
—

```
Browser → XO Store server → Coffee Passport integration endpoint
```

— is enforced structurally, not just recommended: the bearer secret
(§9) must never be shipped into a browser bundle, so the *only* correct
caller is a server-side process that holds the env var. If XO Store's
own frontend called this endpoint directly, the secret would have to live
in XO Store's client bundle, which would defeat the entire auth model —
this is a reason to keep the flow server-to-server, not merely a
preference. No CORS allowlist was added because a same-origin browser
call was never the intended path; adding permissive CORS here would
actively invite the wrong flow.

## 11. Error Contract

| Condition | Status | Body |
|---|---|---|
| Missing/invalid `Authorization` header | 401 | `{"error":"Unauthorized"}` |
| `roaster-xo` lookup fails or returns no row | 500 | `{"error":"Failed to load lots"}` (detail logged server-side via `console.error`, never returned) |
| `lots` query fails | 500 | `{"error":"Failed to load lots"}` (same — no raw Supabase error text or stack trace ever reaches the response body) |
| Success | 200 | `{"lots": [...]}` (possibly empty array — an empty result is not an error) |
| Any method other than `GET` | 405 (Next.js App Router default) | Only `GET` is exported from the route file — no `POST`/`PUT`/`PATCH`/`DELETE` handler exists, so the framework itself rejects any other verb; confirmed by a test (§12) |

No internal Supabase/database error text or stack trace is ever exposed,
per the brief's explicit instruction — stricter than
`app/api/cron/events-archive/route.ts`'s own precedent (which does
return `error.message` to the caller); this endpoint's caller is an
external, separately-operated system, so the stricter of the two existing
in-repo precedents was chosen deliberately.

## 12. Tests

`app/api/integrations/xo-store/lots/route.test.ts` — 9 tests, mirroring
`app/api/events/route.test.ts`'s existing mocking convention (mock the
client-factory module, chain the same builder calls the route makes, call
the exported `GET` directly with a plain `Request`, no HTTP server or
jsdom needed).

- **Test 1** — returns XO-owned Lots (both fixture XO Lots present).
- **Test 2** — a North-Star-owned Lot fixture never appears in the
  response, even though it's present in the mocked table.
- **Test 3** — every returned item carries `public_id` as a non-empty
  string, and never carries the internal `id`/`roaster_id`.
- **Test 4** — a `draft`-status fixture (mirroring the real
  `TEST FLOW A` shape) is excluded.
- **Test 5** — a Lot added to the fixture data *after* the route module
  is authored (no code touched between the two assertions) appears in the
  response — the fixture-level proof requested by the brief for
  "no code change needed for a new Lot," since creating a real production
  Lot for a test is explicitly forbidden.
- Plus: no `Authorization` header → 401; wrong secret → 401; secret unset
  entirely → 401 (fail-closed); no `POST`/`PUT`/`PATCH`/`DELETE` export
  exists on the module.

All 9 pass (`npx vitest run app/api/integrations/xo-store/lots/route.test.ts`).

## 13. Live Verification

Ran against the real dev server (`npm run dev`) and the real live
Supabase project (same one P18/P19/P20 queried), not mocked:

```
$ curl -H "Authorization: Bearer <secret>" http://localhost:3000/api/integrations/xo-store/lots
{"lots":[
  {"public_id":"LOT-XO-COL-004","name":"Colombia Huila","country":"Colombia","region":"Huila","variety":"Castillo, Caturra","process":"Natural","q_grade":85.5},
  {"public_id":"LOT-XO-ETH-001","name":"Ethiopia Guji","country":"Ethiopia","region":"Guji","variety":"Heirloom","process":"Washed","q_grade":87}
]}
HTTP 200
```

Cross-checked against P18/P19's live inventory: XO owns 6 of the 8 live
rows; exactly 2 (`LOT-XO-ETH-001`, `LOT-XO-COL-004`) are `status: active`
+ `in_roaster_catalog: true`; the other 4 are the `draft` `TEST FLOW A–D`
fixtures. **The endpoint returned exactly those 2, no more, no fewer** —
matches expectation exactly, no IDs substituted or invented.

```
$ curl http://localhost:3000/api/integrations/xo-store/lots            → 401 {"error":"Unauthorized"}
$ curl -H "Authorization: Bearer wrong" ...                            → 401 {"error":"Unauthorized"}
```

`.env.local` (gitignored, not committed) was given a local-only
`XO_STORE_INTEGRATION_SECRET` value for this manual verification.

## 14. Files Changed

New files:
- `app/api/integrations/xo-store/lots/route.ts` — the endpoint.
- `app/api/integrations/xo-store/lots/route.test.ts` — its tests.
- `lib/integrations/xoStoreAuth.ts` — bearer-secret check.
- `lib/supabase/publicServerClient.ts` — anon-key, non-cookie server
  client for this and any future similarly-scoped public read route.

Modified:
- `.env.example` — documents `XO_STORE_INTEGRATION_SECRET` (empty value,
  same convention as `EVENTS_CRON_SECRET`).

Not modified: no migration, no existing route, no existing data-access
function (`listCanonicalLotsForRoaster` untouched), no RLS policy, no
type in `lib/types/database.ts`, no test file other than the new one. The
two pre-existing uncommitted files
(`app/(site)/passport/[lotId]/taste/page.tsx`, `app/auth/actions.ts`)
were not opened or touched.

**Migrations changed: no. Runtime changes: yes, additive only** (one new
route, reachable only with a correct bearer secret; nothing existing
changes behavior).

## 15. Exact P24 Plan

P24 is XO COFFEE Store-side work, per the brief's own framing. Concretely:

1. **Connect a real database** to XO Store (currently none — confirmed in
   P20) and add exactly one new table there, shaped like P20 §9's
   `store_products`: XO's own commercial fields (price, availability,
   publish state) plus one plain text column,
   `canonical_lot_public_id`, holding this endpoint's `public_id` by
   value (not a cross-database FK — not possible across separate Supabase
   projects). **Do not** apply the dormant
   `20260911120000_coffee_passport_foundation.sql` design (P20 §3/§14) —
   it defines a second, independent Canonical Lot system and must not
   become the home for this pointer.
2. **Store a copy of `XO_STORE_INTEGRATION_SECRET`** as a server-only env
   var in XO Store's deployment (never `NEXT_PUBLIC_*`, never in a client
   bundle) and call this endpoint **from XO Store's own server**
   (Route Handler / server action / server component), never from its
   browser bundle — per §10.
3. **Build one small merchant-facing screen** in XO Store that calls this
   endpoint server-side, lists the Lots not yet present in
   `store_products`, and lets a human create a new (default-unpublished)
   `store_products` row pointing at the chosen `public_id`. Validate the
   picked `public_id` is actually present in the endpoint's current
   response at the moment of creation (defends against a stale/typo'd
   value, since the FK-by-value link has no database-level constraint —
   P20 §14).
4. **Migrate `Catalog.tsx`** (and the other three current static-`LOTS`
   consumers) to read published `store_products` rows instead of
   `src/data/lots.json` — the one place existing XO Store code changes,
   changing once, not per future Lot.

No further Coffee Passport-side work is implied by P24 — this endpoint is
already the complete boundary on this side; P24 consumes it, it does not
extend it.

---

## 16. Git discipline

**Starting commit:** `37c15358ec0aeda9068ef74a4aeac1419654e7ab`
(`main`, 2 ahead of `origin/main`).

**Pre-existing state, confirmed via `git status` before any change:**
```
 M app/(site)/passport/[lotId]/taste/page.tsx
 M app/auth/actions.ts
?? (P15/P16/P18/P19/P20's own report files, unchanged throughout)
```
Neither modified file was opened or touched during P23.

**Files changed by P23** (see §14 for the full breakdown):
```
 M .env.example
?? app/api/integrations/xo-store/lots/route.ts
?? app/api/integrations/xo-store/lots/route.test.ts
?? lib/integrations/xoStoreAuth.ts
?? lib/supabase/publicServerClient.ts
?? P23_XO_STORE_READ_ONLY_INTEGRATION_BOUNDARY.md
```

- **Migrations changed:** No.
- **Runtime changes:** Yes — one new, additive API route; no existing
  route, page, or data-access function changed behavior.
- **Tests:** 9 new tests added, all passing; full suite
  `npm test` → 152/152 passed across 19 files (one test,
  `lib/journey/userScope.test.ts`, timed out once under full-suite load
  and was confirmed to pass in isolation and on a clean re-run of the
  full suite — a pre-existing timing-sensitive test unrelated to this
  change, not something P23 introduced).
- **Build:** `npm run build` succeeded — 37 routes, including the new
  `ƒ /api/integrations/xo-store/lots`.
- **Typecheck:** `npx tsc --noEmit` — clean, 0 errors.

A single focused commit was made for this stage (not pushed, per Step
24). Final `git status` after the commit:

```
## main...origin/main [ahead 3]
 M app/(site)/passport/[lotId]/taste/page.tsx
 M app/auth/actions.ts
?? (the same pre-existing report files as before, untouched)
```
