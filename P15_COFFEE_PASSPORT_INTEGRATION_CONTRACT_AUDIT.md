# P15 — Coffee Passport Integration Contract Audit

Scope: this audit covers **only** Coffee Passport, as it exists in this
repository today. XO COFFEE is treated as an external, independently
deployed application that will *consume* whatever contract this document
defines. No merge, no shared codebase, no second Coffee Passport.

---

## 1. Executive Summary

**The target chain (QR → public Lot → anonymous tasting → rating →
optional registration → personal Coffee Passport) already works, end to
end, in the current codebase — with one real gap.**

- The canonical Lot identifier already exists, is immutable, and is
  already the QR/URL payload: `public.lots.public_id` (text,
  e.g. `LOT-XO-ETH-001`), exposed at the route `/passport/[lotId]`.
- That route and every table behind it (`lots`, `coffees`, `green_lots`,
  `reference_roast_profiles`, `reference_taste_profiles`,
  `cafe_menu_entries`) is readable by `anon` — no login, no middleware
  gate, no RLS restriction. `middleware.ts` only guards `/admin*`.
- Tasting has **no `orderNumber` field anywhere in this codebase**. It
  never did — that concern is real in XO COFFEE's old flow, but it does
  not exist in `TastingRecord` / `public.checkins` here. There is no
  fake-order workaround to avoid, because there is nothing to work
  around.
- Anonymous tasting is fully supported today: a guest with no account
  gets a stable per-browser id (`localStorage` `coffee-passport:anon-id`),
  can complete the entire blind-tasting flow, and the result is saved to
  `localStorage` immediately. It only fails to reach Supabase, by design
  (`checkins.owner_user_id` is a foreign key into `auth.users`, so an
  anonymous id can never write there — RLS backstops this too).
- When the guest later signs up or logs in on the **same device**,
  `claimAnonymousUserData` re-tags every local anonymous record to the
  real account id and pushes it to Supabase. This is not a proposed
  design — it is already implemented and wired into
  `CurrentUserProvider`.

**The one real gap:** there is no in-flow UI prompt after a tasting result
that says "Save this to your Coffee Passport → sign up / log in." The
save already happens silently (to local storage) regardless of auth
state, and the claim-on-login mechanism already exists — but nothing in
the finish screen (`FarmerPinningModal`) or `/journey` currently tells an
anonymous guest that logging in in the future will pull this tasting into
a durable account. That is a small, additive UI change, not an
architecture change.

**Verdict: READY WITH SMALL CHANGE.**

---

## 2. Current Architecture

Chain, as it exists in code:

```
Roaster
  └─ public.coffees        (origin identity, owned by roaster)
       └─ public.green_lots (one physical green-coffee purchase)
            └─ public.lots   (canonical commercial product — THE Lot)
                 ├─ public.reference_roast_profiles (roaster's declared roast intent, versioned)
                 ├─ public.roast_batches             (actual roast events, insert-only/immutable)
                 └─ public.reference_taste_profiles  (roaster's declared taste target, versioned)

public.coffee_shops (Café) ──< public.cafe_menu_entries >── public.lots
   (join table: coffee_shop_id + lot_id, unique pair — never a Lot copy)

public.checkins (Guest tasting/check-in)
   owner_user_id → auth.users(id)   [REQUIRED, real Supabase user]
   lot_id        → text             [= lots.public_id, NOT a FK]
   coffee_shop_id, roaster_id, barista_id → text, NOT FKs
```

Two parallel storage layers exist for almost everything guest-facing:
`localStorage` (always-available cache / offline-first, and the *only*
store an anonymous guest ever writes to) and Supabase (source of truth
once a real account exists). `lib/data/lotsStore.ts`,
`lib/data/canonicalLotStore.ts`, and `lib/journey/store.ts` are the sync
points.

`app/(site)/passport/[lotId]/page.tsx` is a **client component**
(`'use client'`) — there is no server-side auth check, no `getServerSideProps`-equivalent gate, nothing in `middleware.ts` touching this path. Everything that decides "can this visitor see this Lot" happens by Supabase RLS on the `anon` role, which grants unconditional `select` on `lots` (0025).

---

## 3. Canonical Lot Identity

Three identifiers exist on a Lot; only one is the external contract.

| Identifier | Type | Where | Immutable? | Use externally? |
|---|---|---|---|---|
| `public.lots.id` | `uuid` | DB primary key | Yes | **No** — internal PK, never appears in a URL, never returned to a guest. Used only for FK joins (`reference_roast_profiles.lot_id`, `reference_taste_profiles.lot_id`, `roast_batches.lot_id`) and as `canonicalLotId` in local React state. |
| `public.lots.public_id` | `text`, `unique` | Same row | **Yes** — never updated by any write path (`updateCanonicalLotFields` in `lib/data/canonicalLotStore.ts` explicitly excludes it; see its own comment: changing origin/identity "means creating a new... Lot, a distinct, explicit operation, never a plain UPDATE"). Generated once at creation (`createCanonicalLot`, server-checked for uniqueness against the full live table, not a per-browser guess). | **Yes — this is the canonical external identifier.** Format: `LOT-{ROASTER}-{COUNTRY}-{NNN}` (e.g. `LOT-XO-ETH-001`), produced by `generatePublicLotId`. |
| Local `Lot.id` (pre-canonical / seed data, `lib/data/lotsStore.ts`) | `text` | localStorage / seed array | Same value as `public_id` for every canonical-era Lot — `generateLotId()`'s local format and the server's `generatePublicLotId()` format are deliberately identical, and `rowToLot` maps `id: row.public_id`. | Same string as above. This is the value already used as the route param `[lotId]` throughout the app. |

**Answer: `public_id` (a stable text string, not a uuid) is the real
canonical identifier. It is already what the QR code encodes and what the
route param is.** No new identifier is needed and none should be created.

The internal `lots.id` uuid must **never** be handed to an external
system — it isn't resolvable through any public route, isn't what RLS
policies are written against for guest-facing lookups by identifier, and
leaking it would only invite a second, redundant identity scheme.

---

## 4. Public Lot Route

```
/passport/[lotId]
```

`lotId` route param = `public_id` (e.g. `/passport/LOT-XO-ETH-001`).
Confirmed concretely:

- Route file: `app/(site)/passport/[lotId]/page.tsx`.
- `params.lotId` is looked up both against the local Lot cache
  (`useLots().find(candidate => candidate.id === params.lotId)`) and,
  independently, against Supabase by `public_id`
  (`syncLotsFromSupabase(params.lotId)` →
  `query.eq('public_id', publicId)` in `lib/data/lotsStore.ts`).
- QR/PDF generation (`app/dashboard/roaster/page.tsx`,
  `handleDownloadPdf`/`handleCopyLink`) builds the URL as
  `${window.location.origin}/passport/${lot.id}` — no query string,
  no extra params.
- Manual-entry fallback (`lib/utils/lotId.ts extractLotId`) accepts a
  bare id, a full URL, or a path, and always resolves back to the same
  `LOT-...` id — confirms this is treated as *the* addressable identifier
  app-wide, not an implementation detail.

A second, sibling route continues the same identifier:
`/passport/[lotId]/taste` (the tasting flow itself).

---

## 5. Anonymous Access

**Fully public. No account, no session, no token required to view a Lot.**

- `middleware.ts` matcher is `['/admin/:path*', '/api/admin/:path*']`
  only. `/passport/*` is untouched by middleware.
- `LotPassportPage` is a client component with no auth guard; it renders
  for any visitor once `lot` resolves.
- Every table the passport page reads from — `lots`, `coffees`,
  `green_lots`, `reference_roast_profiles`, `reference_taste_profiles`,
  `roast_batches`, `cafe_menu_entries`, `checkins_community_view` — has an
  explicit `for select using (true)` policy plus `grant select ... to
  anon, authenticated` (migrations 0025, 0017, 0026, 0031).
- The one gate a first-time visitor hits is **not** an auth gate: it's
  `LocationStep` ("Где вы пробуете этот лот сегодня?") — a product step
  asking which café the guest is at, held in component state, not
  persisted, not blocking on identity.
- `BlindTastingLock` (shown before any tasting exists for this
  lot+shop+user) is also not an auth gate — it gates the *reveal* of
  roaster/farmer data until a blind tasting is completed, independent of
  whether the guest is signed in.

**Answer to §8's core question: the Lot is public. It does not require
authorization at any layer (middleware, RLS, server action, or
client-side check).**

---

## 6. Tasting Architecture

Entity: `TastingRecord` (`lib/types/coffee.ts`) / table `public.checkins`
(`supabase/migrations/0005_recipes_equipment_checkins.sql`).

Two-tier storage, both real, not a mock:

1. **`lib/journey/store.ts`** — `localStorage` key
   `coffee-passport:journey`. This is the *actual* read path the UI uses
   (`getSnapshot`/`useSyncExternalStore`); always available offline;
   always written to first, synchronously, on `addTastingRecord`.
2. **`public.checkins`** (Supabase) — written to *after* the local write,
   best-effort, only when the current user is authenticated (see §7 for
   why this is structural, not a bug).

`addTastingRecord(input, userId)`:
- Requires a `userId` string. This is **never** empty in practice by the
  time it's callable — `useCurrentUser()` always resolves to either the
  real Supabase auth id, or a generated anonymous UUID
  (`getOrCreateAnonId()`), before `ready` becomes true. The taste flow's
  own "Сохранить дегустацию" button is disabled until `ready && userId`.
- Requires `lotId`, `coffeeShopId`, `brewingMethod`, `baristaId`,
  a completed `drinkSelection`, and the taste-assessment values
  (`pendingTasteValues`) — i.e., the full blind-tasting form.
- Does **not** require: any order, any purchase reference, any café
  registration, any relationship to XO COFFEE at all.

Anonymous → registered handoff (`lib/journey/claimAnonymousData.ts`,
called from `CurrentUserProvider` in `lib/auth/currentUser.tsx` the
moment `authUserId` first becomes non-null on a device that already had
an anonymous id):

```
claimAnonymousUserData(anonId, realUserId)
  → claimAnonymousTastings (lib/journey/store.ts)
      - re-tags every local checkin record: userId = anonId → realUserId
      - re-write is destructive/idempotent (records aren't duplicated)
      - THEN inserts the now-real-owned rows into Supabase checkins
        (this is the first moment they can legally satisfy
        owner_user_id → auth.users(id) and RLS's auth.uid() = owner_user_id)
  → (plus equivalent claims for recipes, equipment, mute prefs,
     notification prefs, lot notification reads — not tasting-specific,
     out of scope here)
```

This is the exact "attach anonymous tasting to a later-registered Guest"
mechanic requested in §10.7 / §12 — already implemented, already wired to
fire automatically on first login on the same browser.

---

## 7. Order Dependency

**There is no `orderNumber` field, column, or concept anywhere in this
codebase.**

Verified by direct search (`orderNumber`, `order_number`) across the
entire repository: zero matches. `TastingRecord` / `checkins` has no
column referencing an order, a purchase, a receipt, or XO COFFEE at all.
`checkins.lot_id` is a plain `text` column (not even an FK to
`lots.public_id`), and `checkins.roaster_id` / `coffee_shop_id` /
`barista_id` are likewise free text, not FKs — the whole table is
deliberately decoupled from any purchase-path entity.

Direct answers to §10's questions:

1. Does `TastingRecord` require `orderNumber`? **No — the field doesn't
   exist.**
2. Why is it needed? **N/A.**
3. Is an order required to create a tasting? **No.**
4. Can a tasting be created from only `lotId`? **Yes — plus the
   product-required location/drink/taste/barista fields, none of which
   reference an order.**
5. Can an anonymous tasting be created? **Yes, locally — see §6/§11.**
6. Can a tasting be saved without a Guest account? **Yes — to
   `localStorage`, immediately, as a full record.** It cannot yet reach
   Supabase without an account (structural, via `owner_user_id`'s FK +
   RLS), but "saved" is true from the guest's own point of view: it
   persists across reloads on that device and renders in `/journey` and
   the passport's own "already tasted" branch.
7. Can an anonymous tasting later be attached to a registered Guest?
   **Yes — automatically, via `claimAnonymousUserData`, already wired.**

**This is the opposite of the failure mode §10/§24/§28 warn against.**
The order-scoping concern is real for XO COFFEE's legacy flow but does
not exist in Coffee Passport's own tasting model. No fake order, no
workaround, no order-shaped ID was ever introduced here — there was
never anything to route around.

---

## 8. Guest Registration

Auth: Supabase email/password (`app/auth/actions.ts` —
`signInWithPassword` / `signUpWithPassword`), server actions, no
anonymous Supabase auth session is ever created
(`supabase.auth.signInAnonymously` does not appear anywhere in the
codebase) — the "anonymous identity" is purely a client-side
`localStorage` UUID, never a Supabase Auth concept.

Registration is **not** gated behind any tasting step. It is a fully
independent action available from the app's normal auth entry points
(`/auth/login`) at any time, with a `next` redirect param
(`safeNextPath`) to return the guest to where they were.

`CurrentUserProvider` (`lib/auth/currentUser.tsx`) is the single place
that reacts to "auth state changed": the moment `authUserId` flips from
`null` to a real id, it (a) claims any anonymous local data on this
device via `claimAnonymousUserData`, then (b) reconciles user scope
(`reconcileUserScope`, purges any *other* account's leftover local data
from a previous sign-in on this same browser first), then (c) kicks off
Supabase syncs for checkins/recipes/baristas/mute-prefs/notification-prefs.

**What is missing:** an explicit, in-flow invitation. Today, finishing a
blind tasting (`handleFinish` in `taste/page.tsx`) always succeeds
silently for an anonymous guest and drops them into `FarmerPinningModal`,
which offers exactly two destinations — `/passport/[lotId]` (× button) or
`/journey` (gold CTA) — neither of which mentions authentication or
explains that the tasting is currently device-local only. A guest who
never happens to sign in on this same device/browser will not lose the
data, but will never be told it's at risk of not following them to a new
device, and will not be prompted toward the "save permanently" step the
target flow in §2/§12 describes as a deliberate product moment.

---

## 9. QR Contract

**What the QR must encode (already true today):**

```
https://{coffee-passport-production-domain}/passport/{public_id}
```

Concretely, as already generated by `handleDownloadPdf` /
`handleCopyLink` in `app/dashboard/roaster/page.tsx`:
`${window.location.origin}/passport/${lot.id}` — `lot.id` here is the
`public_id`. No query string is appended by any code path that builds
this URL today.

Confirmed absent from every URL-building call site (`grep` across `app/`
for URL construction patterns near `/passport/`): no `orderNumber`, no
customer id, no guest id, no session token, no temporary token. The QR is
already Lot-scoped only, exactly as required.

**Production domain:** not defined as a code constant anywhere
(`window.location.origin` is resolved at runtime client-side, which is
correct and domain-agnostic by construction). The only place a concrete
production domain appears in the repo is as example/documentation text —
`https://coffee-passport.onrender.com` — in `README.md`,
`.github/workflows/events-cron.yml` (the `APP_URL` GitHub Actions
secret), and a code comment in `lib/utils/lotId.ts`. There is no
`NEXT_PUBLIC_SITE_URL`, no `metadataBase` in `app/layout.tsx`, no
`robots.ts`/`sitemap.ts`. **This means: the app itself never hardcodes or
needs a production domain (QR generation reads it live from the browser),
but there is also no single source-of-truth constant an external system
like XO COFFEE could read from this codebase to learn "what is Coffee
Passport's production base URL" other than that same README/workflow
mention.** Recommend treating `https://coffee-passport.onrender.com` as
the confirmed production base until told otherwise, and flagging to the
product owner that this should live in an env var if XO COFFEE is going
to hardcode it too.

---

## 10. External Integration Contract

Minimal, already-sufficient surface for XO COFFEE to link a physical pack
to a specific Lot:

```
lotId        := public.lots.public_id   (e.g. "LOT-XO-ETH-001")
publicLotUrl := "{coffee-passport-base-url}/passport/{lotId}"
```

Nothing else is required. Specifically **not** needed:
- `lots.id` (internal uuid) — never resolvable through a public route,
  should never leave this codebase.
- Any Order/Customer/Guest identifier — the target chain is explicitly
  Lot-first, person-agnostic (§4 of the requirements: one Lot, many
  Guests).
- A `status` field — `canonicalStatus === 'draft'` is already handled
  gracefully client-side (shows "обжарщик ещё готовит паспорт" instead of
  a broken page), so XO COFFEE does not need to pre-check status before
  printing a QR; the passport route degrades correctly on its own.

**Is there an API XO COFFEE can call?** No dedicated public API/endpoint
exists (`app/api/` contains only `admin`, `barista/[id]`,
`cron/*`, `events`, `partner-requests` — nothing Lot-related). The only
existing way to "get" a Lot today is:
1. **Recommended**: link to the public URL directly. This needs no new
   code on either side and is exactly what QR/print flows already do.
2. Technically possible but **not recommended**: an external system could
   query Supabase's PostgREST endpoint directly
   (`{SUPABASE_URL}/rest/v1/lots?public_id=eq.{id}`) using the public
   anon key, since RLS already grants `anon` select on `lots`. This works
   today without any new code, but it couples XO COFFEE to Coffee
   Passport's Supabase project/schema directly rather than to a stable
   contract, and exposes more columns (internal `id` uuid, `green_lot_id`,
   `roaster_id`, `status`, `legacy_text_id`) than XO COFFEE needs. **Do
   not use this as the integration path** — it's an accidental capability
   of the current RLS policy, not a designed contract.

If XO COFFEE ever needs *more* than "does this Lot exist / what's its
URL" (e.g. status, name, roaster) without going through Supabase
directly, that would be the trigger for a small dedicated
`GET /api/lots/[publicId]` route returning only the whitelisted public
fields — not built now, per §22/§24, but the natural next step if needed.

---

## 11. Target Flow

```
PHYSICAL PACK
      ↓
QR encodes: https://{base-url}/passport/{public_id}
      ↓
/passport/[lotId]  — public, no auth, RLS grants anon select   [WORKS TODAY]
      ↓
Guest picks a café (LocationStep — product step, not an auth gate)
      ↓
/passport/[lotId]/taste — blind tasting flow                    [WORKS TODAY]
      ↓
addTastingRecord(..., userId)
  userId = real auth id OR per-browser anon UUID                [WORKS TODAY]
  → written to localStorage immediately (always succeeds)
  → written to Supabase checkins only if authenticated (by design)
      ↓
Result / reveal (FarmerRevealCard, TasteComparison, FarmerPinningModal)  [WORKS TODAY]
      ↓
[GAP] No in-flow "Save to Coffee Passport → sign up" prompt here.
Guest can navigate to /auth/login on their own initiative at any time.
      ↓
Sign up / log in
      ↓
claimAnonymousUserData → claimAnonymousTastings                 [WORKS TODAY]
  re-tags local anon records to the real account, pushes to Supabase
      ↓
Guest Coffee Passport — personal tasting history, now durable
and synced across devices                                       [WORKS TODAY]
```

Everything works except the single labeled gap.

---

## 12. Gaps

Only one gap rises to "should be built next"; the rest are observations,
not blockers.

1. **No in-flow "save your tasting" registration prompt.** The claim
   mechanism exists and fires automatically, but nothing in
   `FarmerPinningModal` or the passport page's post-reveal state tells an
   anonymous guest "this is saved on this device; log in to keep it
   permanently / see it on another device." This is the one piece needed
   to make §2's `optional: "Save your tasting" → registration` step a
   real, visible product moment instead of an invisible side effect that
   only helps a guest who happens to sign up later on the same browser.
2. **No dedicated public Lot API.** Not currently needed (direct URL
   linking is sufficient and is the recommended contract), but if XO
   COFFEE ever needs Lot metadata server-to-server (not just a link to
   hand a human), there is nothing to call yet except direct Supabase
   REST access, which should not be the sanctioned path (§10).
3. **No single source-of-truth production base URL constant** in code —
   QR generation resolves it live from `window.location.origin` (fine
   for the app's own use), but nothing exports it as a constant an
   external system or a script could read. Currently only recoverable
   from README/workflow doc text.
4. **Two uncommitted, unrelated in-flight changes** on this branch as of
   this audit (see §14) touch the tasting flow and auth redirect
   handling — neither introduces an order dependency or an auth
   requirement; both are small, additive, and consistent with everything
   described above (see diffs reviewed in this audit).

---

## 13. Recommended Next Implementation Stage

Scoped narrowly, consistent with §22's "audit first" instruction — described here, not built in this pass:

1. Add a small, explicit "Save to Coffee Passport" moment for an
   anonymous guest at the natural end of the tasting result (e.g. inside
   `FarmerPinningModal`, or as a banner on `/passport/[lotId]`'s
   post-reveal state, gated on `!isAuthenticated`): short copy + a link to
   `/auth/login?next=/passport/{lotId}` (or `/journey`). No schema change,
   no new table, no new auth mechanism — `claimAnonymousUserData` already
   does the actual work the instant the guest completes that login.
2. If/when XO COFFEE needs Lot metadata outside of a human-facing link,
   add a narrow `GET /api/lots/[publicId]` route returning only
   `{ publicId, name, status, publicUrl }` (or similar), explicitly not
   the raw `lots` row — keeps the external contract stable even if the
   internal schema changes later.
3. Consider promoting the production base URL into a
   `NEXT_PUBLIC_SITE_URL` (or similar) env var for documentation/tooling
   clarity — purely a housekeeping change, not required for the flow to
   work, since QR generation itself already resolves the URL correctly
   at runtime.

None of these require touching `checkins`' schema, RLS, the Canonical Lot
model, or introducing any order/purchase concept.

---

## 14. Explicit Non-Goals (this audit did not do these)

- Did not modify the tasting engine, its schema, or its RLS policies.
- Did not create a new Lot identifier, integration ID, QR ID, or shadow
  Lot — `public_id` was found to already be sufficient (§3).
- Did not create any API route.
- Did not introduce Supabase anonymous auth or any fake-order/fake-user
  workaround.
- Did not merge or reference XO COFFEE's codebase — this document
  describes only what Coffee Passport already exposes.
- Left the two pre-existing uncommitted working-tree changes
  (`app/(site)/passport/[lotId]/taste/page.tsx` — an in-progress
  Community-Layer opt-in checkbox; `app/auth/actions.ts` — an
  error-redirect query-string fix) untouched; both were read and
  confirmed unrelated to, and consistent with, every conclusion above.

---

## Appendix — Target vs. Current (§25 table)

| Area | Сейчас (Now) | Нужно (Needed) | Gap |
|---|---|---|---|
| Canonical Lot ID | `lots.public_id`, immutable, server-generated, already the URL/QR payload | Stable | **None** |
| Public Lot URL | `/passport/[lotId]`, no auth, RLS-public | Yes | **None** |
| Anonymous access | Fully public read (`middleware.ts` doesn't touch it; RLS grants `anon` select everywhere needed) | Yes | **None** |
| Anonymous tasting | Fully completable, saved to `localStorage` under a stable per-browser anon id; Supabase write deferred until auth (by FK design) | Yes | **None** functionally; UX doesn't tell the guest this is happening |
| Rating | Full blind-tasting + barista rating flow, no order/account precondition | Yes | **None** |
| Save after registration | `claimAnonymousUserData`/`claimAnonymousTastings` auto-fires on first login on the same device | Yes | **None** mechanically; **missing** the in-flow prompt that invites the guest to do it (§12.1) |
| Guest account | Supabase email/password auth, independent of tasting flow | Yes | **None** |
| QR compatibility | QR already encodes `origin + /passport/{public_id}`, no extra params | Yes | **None** |
| Order dependency | **Does not exist** — no `orderNumber` field anywhere in the schema or types | No | **None** (already satisfied) |
| Café / Barista | Café references Lots via `cafe_menu_entries` join (no copy); Barista/method/rating captured on `checkins`; water/machine detail lives in the separate `BrewingRecipe` model | Existing, referenced not duplicated | **None** |

---

## Final Answer (§23)

## READY WITH SMALL CHANGE

The full chain — QR → public Lot → anonymous user → tasting → rating →
result → optional registration → save → Guest Coffee Passport — is
already architecturally supported end to end, including the
anonymous-to-registered data claim. The one missing piece is a UI
prompt inviting the guest to register after tasting; the underlying
mechanism for that prompt to hook into already exists and requires no
schema or auth changes.
