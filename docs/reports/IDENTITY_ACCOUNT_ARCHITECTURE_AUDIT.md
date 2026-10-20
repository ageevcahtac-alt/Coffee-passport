# Identity / Account Architecture — Product Audit

Audit-first pass, no implementation. Traced actual code paths, not file
names or prior conclusions — including this project's own prior two
reports (`PUBLIC_COFFEE_PASSPORT_END_TO_END_AUDIT.md`,
`COMMUNITY_LAYER_PRODUCT_AUDIT.md`), which both stated "device-local
identity remains a conscious limitation... needs a new Identity/Account
Architecture." **That framing turns out to be incomplete** — see §9. This
report corrects it with what the code actually shows.

## 1. Current identity model

Two identifiers coexist, and they are **not** parallel identity systems —
one is real, one is a fallback for when the real one hasn't been used yet:

- **Anonymous per-browser id** (`getOrCreateAnonId()`, `lib/auth/currentUser.tsx`): a random UUID (or timestamp-based fallback) generated once and stored in `localStorage`. Stable across reloads on the same browser, gone on a new device or cleared storage. Used only as a placeholder `userId` for local-only stores when no real session exists.
- **Real Supabase Auth identity** (`auth.users.id`): resolved server-side in `app/(site)/layout.tsx` via `supabase.auth.getUser()` (a verified session, not a client claim) and passed into `CurrentUserProvider` as `authUserId`. This is the SAME `auth.users` row used by staff dashboards (`roaster_admin`/`cafe_admin`/`barista`) and by consumer accounts (`enthusiast`) — one auth system, branching only on `profiles.role`.

`useCurrentUser()` resolves to whichever of these is available: the real id when signed in, the anon id otherwise. Every personal store (`journey`/checkins, `brewingRecipesStore`, `equipmentStore`, `shopMutePreferencesStore`, `customCoffeeStore`, etc.) already keys its records by this one resolved `userId`, uniformly — there is no separate "guest record" shape vs. "account record" shape anywhere.

## 2. Current auth infrastructure — already live, already used

This is the section where the prior two reports under-investigated. Traced precisely:

- **`public.profiles`** (`0007_staff_profiles_rls.sql`) — one row per `auth.users` row, auto-created by a `security definer` trigger (`on_auth_user_created_profile`) on every signup, defaulting to `role: 'enthusiast'`. `email` is mirrored from `auth.users` at signup (`0012_loyalty_module.sql`); `display_name` is the one field a user may self-edit (`grant update (display_name)`, its own RLS policy). RLS lets a user read only their own profile row; role/cafe_id/roaster_id/barista_id are staff-assigned only, never self-service (no privilege-escalation path).
- **A complete, real, working consumer sign-up/sign-in flow already exists and is already live**: `components/site/EnthusiastAuthForm.tsx`, rendered directly on the homepage (`app/(site)/page.tsx`) — a login/signup toggle ("Войти"/"Регистрация") posting to real server actions (`app/auth/actions.ts`: `signInWithPassword`, `signUpWithPassword`, both calling real `supabase.auth.signInWithPassword`/`signUp`). Successful signup lands on `/journey`, already wired to read the new account's data.
- **The Navbar already surfaces this**: `components/shared/Navbar.tsx` shows a "Log in" link (`/auth/login`) to every anonymous visitor on every `(site)` page — including `/passport/[lotId]` and `/passport/[lotId]/taste`, since they share the same layout (`app/(site)/layout.tsx`) that renders `CurrentUserProvider` + `Navbar`. **The sign-in entry point is already reachable from the Passport today, not something that needs to be built from scratch.**
- **Real, persistent, cross-device value already exists for a signed-in enthusiast, in production-shaped code, today**: `brewingRecipesStore` (recipes + votes), `equipmentStore` (Garage setups), `shopMutePreferencesStore`, `baristaProfileStore`, and — most tellingly — an entire **loyalty module** (`0012_loyalty_module.sql`: `guest_shop_statuses`, `subscriptions`, `loyalty_transactions`, all keyed `guest_id = auth.uid()`, surfaced at `/loyalty` / Navbar's "Мои карты"). None of this is hypothetical or half-built; it's the same maturity level as the Canonical Lot work already audited and closed.
- **`checkins` itself already supports real-account persistence** (confirmed again this pass, unchanged from the Community Layer audit): `owner_user_id references auth.users(id) on delete cascade`, `syncCheckinsForUser(userId, isAuthenticated)` pulls a signed-in user's own rows on every session start, `addTastingRecord` already writes through to Supabase for a real account.

**Conclusion**: there is exactly one identity system in this app (Supabase Auth + `public.profiles`), it already has a real, live consumer-facing entry point, and every personal store this audit was asked to check already branches on it correctly. **Nothing here needs to be invented.**

## 3. Ownership model

Checked every `user_id`/`owner_user_id`/`owner_id`/`created_by` in the live schema (not `0001_init_schema.sql`'s `public.users`/`reviews`/`user_flavor_preferences` — see §9, that schema was **never applied**, confirmed by 0022's own migration comment cross-referencing "the Coffee Passport 2.0 Audit" and "Stage 3"):

| Data | Ownership key | Real FK to `auth.users`? |
|---|---|---|
| `checkins` (tasting/check-in) | `owner_user_id` | Yes, `on delete cascade` |
| `recipes` (enthusiast/barista) | `owner_user_id` (nullable — null for roaster/coffee_shop-authored) | Yes, where present |
| `equipment_garage` | `owner_user_id` (nullable, same pattern) | Yes, where present |
| `guest_shop_statuses`/`subscriptions`/`loyalty_transactions` | `guest_id` | Yes |
| `profiles` | `id` (same as `auth.users.id`, 1:1) | Is the identity anchor itself |
| `checkins.is_public` opted-in rows (Community Layer) | Still `owner_user_id` underneath; the anonymized view strips it | Yes, at the base table |

Ownership is already uniform and already real-account-based wherever it exists in the live schema. The only place ownership is currently **not** account-based is the client-side fallback (`getOrCreateAnonId`) used when there's no session — which every one of these tables' RLS already structurally rejects (an anon id can't satisfy `references auth.users(id)`), so an anonymous "owner" never actually reaches the database at all. Ownership isn't ambiguous; it's binary — either a real account owns a row in Supabase, or the data stays local-only.

## 4. Public vs. private identity

- **Private**: everything in §3's table, gated by `auth.uid() = owner_user_id`/`guest_id` RLS — unchanged, correct, re-confirmed this pass.
- **Public identity**: **does not exist anywhere in this app**, by design, confirmed twice now (once in the Community Layer audit, reconfirmed here at the schema level): `authorName` on a public `BrewingRecipe` is always the literal placeholder string `"Вы"` — every call site hardcodes it, there is no real display name ever shown to another user. `checkins_community_view` (Community Layer, previous pass) carries no identity column at all. `profiles.display_name` exists and is self-editable, but nothing outside the owner's own profile-read RLS policy and the one staff/loyalty-greeting policy (`0012`'s "staff read enthusiast display names," scoped to barista/cafe_admin only, for a real business reason — greeting a loyalty-card holder by name) ever exposes it. **No accidental public-identity surface exists to audit away.**

## 5. Existing Supabase / RLS architecture — reusable without a new system

Directly answers the task's central question ("what currently blocks moving device-local identity to account identity"):

**Nothing in the schema or RLS blocks it.** The blocker, precisely located:

1. A guest who starts at `/passport/[lotId]` (the QR entry point) is never invited to sign in *from that flow* — the Navbar's "Log in" link exists but takes them to `/auth/login`, a plain password-only form with **no signup toggle at all** (unlike the homepage's `EnthusiastAuthForm`, which has one). A brand-new guest clicking "Log in" from the Passport hits a dead end for creating an account unless they already know to go back to `/` first. This is a **discoverability/consistency gap between two existing auth entry points**, not a missing capability.
2. **Local-to-account history migration does not happen today, and produces a silent, confirmed data-loss-shaped bug**: traced `reconcileUserScope()` (`lib/journey/userScope.ts`) exactly. It only runs comparisons when `isAuthenticated` is already true, and only purges when the previous *real* account differs from the new one. For the actual "anonymous → just signed up" transition: `ACTIVE_USER_KEY` was never set (no prior real account), so the purge condition (`previousUserId && previousUserId !== newUserId`) is false — nothing is deleted — but nothing is *migrated* either. The guest's pre-signup `journey` entries keep `userId = <old anon id>` forever; every reader (`useJourney().filter(r => r.userId === currentUserId)`, now the *new* real id) can no longer find them. **Not deleted, but permanently invisible** — the practical experience is identical to data loss, confirmed by reading the exact filter logic used on the Passport page and `/journey`.

Both are narrow, well-understood, additive-shaped gaps in the *connection* between existing pieces — not evidence that a new Identity/Account Architecture needs to be designed.

## 6. Minimal Identity Unit

Tested against the three offered shapes, using what the code actually needs rather than assuming one:

- `Person/Account → Passport → Tasting Experiences` and `Account → Tasting History → Community` both presuppose a "Passport" or "History" as a distinct owned entity separate from the account. The code doesn't support that: there is no `passports` table, no per-user "my passport" object — a guest's tasting history *is* just `checkins` rows filtered by `owner_user_id`, and "Community" *is* just `checkins.is_public = true` rows, also filtered by the same key. There's no intermediate entity to model.
- **The real minimal unit, confirmed by the schema**: `Account (auth.users + profiles) → owned rows (checkins, recipes, equipment, loyalty), each independently taggable private/public`. An "account's Coffee Passport" isn't a thing to build — it's just "this account's own `checkins`/`recipes` rows, queried by `owner_user_id`," exactly the query shape `syncCheckinsForUser`/`useJourney` already use. No new entity required.

**Identity vs. Ownership vs. Public identity vs. Anonymous identity, kept separate as asked:**
- **Identity** = one `auth.users` row + its `profiles` row (role, optional self-set `display_name`). Already exists.
- **Ownership** = a foreign key on each personal table (`owner_user_id`/`guest_id`). Already exists, already enforced by RLS.
- **Public identity** = deliberately nothing (§4) — confirmed correct, not a gap.
- **Anonymous identity** = the per-browser fallback id, correctly confined to local-only storage and never able to reach any RLS-protected table (§3) — confirmed correct, not a gap, and not something to "upgrade" into account identity by any client-side trick.

## 7. Existing-data migration implications (model only, not implemented)

The scenario the task asks about — device-local history, then an account is created — happens today (§5.2) with a **silent invisibility bug**, not a deliberate policy. The correct model, derivable directly from infrastructure that already exists and needs no new table:

1. On the transition from anonymous → newly authenticated (detectable: `reconcileUserScope` already receives exactly this signal, it just currently does nothing with the "no previous *real* account" case beyond setting `ACTIVE_USER_KEY`), the client already holds the outgoing anonymous id and the new real id in the same function call.
2. The locally-cached records tagged with the anonymous id could be re-tagged in place (`userId: newRealId`) rather than left stranded — a pure client-side, `localStorage`-only rewrite of already-local data, using the exact `write()`/`read()` primitives `journey/store.ts` already has.
3. Once re-tagged, the *existing* Supabase-write path (`addTastingRecord`'s insert, or a small "flush unsynced local records" pass) already knows how to push a `userId`-real-owned record to `checkins` — no new write path needed, only the trigger to run it for records that predate the sign-up.
4. **What NOT to do, confirmed by this audit**: never fabricate a merge across two *different* real accounts (that's already `reconcileUserScope`'s deliberately-purge case, for a real reason — shared-device privacy — and must stay untouched); never silently push anonymous-tagged history to Supabase without the ownership being a real, freshly-authenticated account (already structurally impossible, since the FK requires a real `auth.users` id at write time).

This is a genuine gap worth fixing eventually, but it is **client-side reconciliation logic**, not a schema, RLS, or auth change — confirming again this isn't Category C material.

## 8. Privacy model (minimal, as requested)

```
PRIVATE     → owner_user_id = auth.uid() only (checkins, recipes drafts, equipment, loyalty) — unchanged, already correct.
PASSPORT    → not a separate mechanism; "this Lot's Passport" is just a lot_id-scoped query already used everywhere (checkins_community_view filtered by lot_id, exactly as built in the Community Layer pass).
COMMUNITY   → explicit opt-in only (checkins.is_public / recipes.isPublic), anonymized at the view level, already correct, already shipped.
PUBLIC IDENTITY → does not exist, and nothing in this audit found a reason to create it — an account choosing a public identity (a real display name shown to others) is a distinct, larger, currently-unneeded feature, not a default.
```

No account-creation flow should ever auto-promote a private record to Community or attach a public identity — confirmed nothing in the current signup path (`signUpWithPassword`) does this; the `profiles` row it creates has no bearing on any `is_public` flag anywhere.

## 9. What can be reused (and correction of this block's own prior framing)

Everything: Supabase Auth, `public.profiles` (role model, auto-provisioning trigger, self-editable `display_name`), the homepage `EnthusiastAuthForm`, `CurrentUserProvider`/`useCurrentUser`, every personal store's existing `isAuthenticated` branch, the loyalty module as a proof this pattern already delivers real cross-device value in production-shaped code.

**Explicit correction**: `PUBLIC_COFFEE_PASSPORT_END_TO_END_AUDIT.md` (§6.1) and `COMMUNITY_LAYER_PRODUCT_AUDIT.md` (§5 Category C, §7.1) both concluded "device-local identity is a conscious architectural limitation requiring a separate Identity/Account major block." That conclusion was reached by observing the *anonymous fallback path* (`getOrCreateAnonId`) without checking whether a real account path already existed and was already wired to the same stores — it does, and it was. This wasn't a wrong instinct (the underlying observation — a guest with no account gets no cross-device value — is entirely correct and remains true), but the *architectural remedy* those reports implied ("needs new Identity/Account Architecture") was already unnecessary. This is exactly the failure mode this task's own instruction ("не предполагай архитектуру по названию файлов — проверь реальные data paths") was written to catch.

## 10. What is missing

Only two things, both narrow and additive:

1. **A signup-capable entry point reachable *from* the Passport/tasting flow** — today the Navbar's "Log in" link from `/passport/[lotId]` lands on a login-only page with no path to create an account; the working signup form only lives on `/`. Fixing this does not require new auth capability, only reusing `EnthusiastAuthForm` (or its `signUpWithPassword` action) somewhere reachable from the tasting flow.
2. **Local-to-account history reconciliation on first sign-up** (§7) — a client-side re-tagging step, using stores that already exist.

Neither requires a new table, a new RLS policy, a new auth provider, or a new concept of identity.

## 11. A/B/C classification

**A — existing auth infrastructure is already sufficient.** Supabase Auth + `profiles` + RLS + the enthusiast signup flow are complete, live, and already correctly wired into every personal store this audit checked (`checkins`, recipes, equipment, loyalty). No new identity/account architecture is needed.

The two items in §10 are small, real, evidenced gaps — but they are **connection/UX gaps between already-existing pieces** (surfacing an existing form in a new place; reconciling two already-existing local arrays on an already-detectable event), not a case for a new major Identity/Account Architecture block. They would be reasonably scoped as a small, later B-shaped follow-up if the product wants tasting history to survive an account being created mid-session — but per this audit's own instruction, nothing was implemented this pass.

**No Category C finding.** This is the significant, self-correcting result of this audit: the "device-local identity ceiling" flagged twice before is real as an *observation* (an anonymous guest genuinely gets no cross-device value) but false as an *architectural conclusion* (the fix is not a new system — it's turning on and connecting what already exists).

## 12. Recommendation for the next major block

**Do not open a new "Identity / Account Architecture" major block — there is nothing architectural left to design.** If the product wants to close the gap (an anonymous guest's tasting history should be able to become permanent), the right-sized next step is a small, targeted pass — not a new block — covering exactly §10's two items:

1. Make the existing enthusiast sign-up form reachable from the Passport/tasting flow (reuse `EnthusiastAuthForm`/`signUpWithPassword`, no new component category).
2. Add the local-to-account re-tagging step to the anonymous→authenticated transition already detected in `CurrentUserProvider`/`reconcileUserScope`.

Both are additive, both reuse existing tables/RLS/auth untouched, and neither requires touching Canonical Lot, Coffee/Green Lot, `public_id`, `roast_batches`, `reference_roast_profiles`, `reference_taste_profiles`, tasting persistence, Community Check-in, or the QR flow — consistent with this audit's own "do not touch" boundary.

## Validation

**`npx tsc --noEmit`** — passed, no output. No files were changed this pass.

**`npx vitest run`** (the task specified `npm run vitest -- --run`; this project's `package.json` has no `vitest` script by that name, so the equivalent direct command was used instead):
```
✓ lib/server/canonicalLot.test.ts (14 tests)
Test Files  1 passed (1)
     Tests  14 passed (14)
```

**`npm run build`** — passed, 39/39 static pages, no route added or removed, no size changes (no code touched).

Stopping here, as instructed — audit only, no implementation.
