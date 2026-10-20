# Identity Session Continuity — Implementation

Scope: connect the already-existing, already-working Identity/Account
infrastructure (`IDENTITY_ACCOUNT_ARCHITECTURE_AUDIT.md`) to the Passport
and tasting flow. No new auth system, no new tables, no new identity
concept — two integration gaps only.

## 1. Root cause — GAP 1 (Passport Login → Signup)

Traced the actual routing, not assumed it: `components/shared/Navbar.tsx`'s
"Log in" link (visible on every `(site)` page, including
`/passport/[lotId]` and `/passport/[lotId]/taste`, since they share
`app/(site)/layout.tsx`) pointed to `/auth/login`. That page
(`app/auth/login/page.tsx`) rendered its own standalone form, posting only
to `signInWithPassword` — **no signup tab, no link to one**. The only place
a new guest could actually create an account was
`components/site/EnthusiastAuthForm.tsx`, rendered exclusively on the
homepage (`app/(site)/page.tsx`). A guest who scanned a QR, landed on a
Lot's Passport, and clicked "Log in" hit a page that could not create them
an account — they'd have to already know to navigate back to `/` first,
losing their place, or discover the Passport with no memory of how they
got there once they came back a different way.

Additionally, the "Log in" link itself never carried any `next` — even
after fixing the signup path, a successful login/signup from the Passport
would have landed on `/journey` (the form's hardcoded default), not back
on the Lot the guest actually came to see.

## 2. Root cause — GAP 2 (anonymous tasting → signup continuity)

Traced the exact data flow end to end, per the task's own required trace:

- **Anonymous identity**: `getOrCreateAnonId()` (`lib/auth/currentUser.tsx`) — a random id in `localStorage['coffee-passport:anon-id']`, stable per browser, generated once.
- **Checkin creation**: `addTastingRecord()` (`lib/journey/store.ts`) — writes to the local `journey` array immediately (`userId` = whatever `useCurrentUser()` currently resolves to), then attempts a Supabase `checkins` insert.
- **Checkin ownership**: `checkins.owner_user_id references auth.users(id) on delete cascade` — an anonymous id can never satisfy this FK, so **an anonymous tasting can never reach Supabase at all**, confirmed again this pass (unchanged since the Community Layer audit) — it exists only in this one browser's `localStorage`.
- **Tasting history queries**: every reader (`useJourney()` on the Passport, `/journey`) filters `record.userId === currentUserId`. `currentUserId` is `useCurrentUser().userId` — the real `auth.users` id once signed in.
- **Session initialization**: `CurrentUserProvider`'s `useEffect` (`lib/auth/currentUser.tsx`), keyed on `[authUserId]` (resolved server-side per request via `supabase.auth.getUser()` in `app/(site)/layout.tsx`) — the exact point where "anonymous → authenticated" is detectable, already used for `reconcileUserScope`.
- **Login/signup callbacks**: `signInWithPassword`/`signUpWithPassword` (`app/auth/actions.ts`) — real Supabase Auth calls, then a `redirect(next)`, which forces the layout (and therefore `CurrentUserProvider`) to re-resolve `authUserId` fresh.
- **`reconcileUserScope`** (`lib/journey/userScope.ts`): the exact mechanism the task named — read precisely. It only acts `if (isAuthenticated)`, and only purges when the **previously-stored real account** (`localStorage['coffee-passport:active-user']`) differs from the new one. On a genuine anonymous→authenticated transition, `ACTIVE_USER_KEY` was never set, so its purge condition is false — **nothing is deleted, but nothing is migrated either.**

**Confirmed root cause**: the guest's pre-signup `journey` entries keep `userId = <old anon id>` forever. They are not deleted — they sit in `localStorage` untouched — but every reader now filters by the new real `userId`, which never matches the old anon id. The practical result, confirmed by reading the exact filter logic on the Passport page and `/journey`, is **permanent invisibility**, indistinguishable from data loss to the guest.

## 3. Existing architecture reused

Nothing new was built. Both fixes are wiring between pieces that already existed and already worked:

- `EnthusiastAuthForm` (existing component, existing `signInWithPassword`/`signUpWithPassword` actions, existing `profiles` auto-provisioning trigger) — reused verbatim, given two new optional props.
- `CurrentUserProvider`'s existing identity-transition effect (the same one `reconcileUserScope` already hooks into) — extended with one more step, using the store's own existing `read()`/`write()` primitives and the same best-effort Supabase-insert convention `addTastingRecord()` already uses.
- No migration, no new table, no new RLS policy, no new auth provider.

## 4. Exact ownership / reconciliation logic (GAP 2)

**`lib/journey/store.ts` — new `claimAnonymousTastings(anonUserId, realUserId)`**:

1. Reads the local `journey` array, filters to records where `userId === anonUserId`.
2. If none, no-op (returns immediately) — the common case for most sign-ins.
3. Otherwise, **re-tags them in place** (`userId: anonUserId → realUserId`) via the store's existing `write()` — a single, local, synchronous operation.
4. Attempts one batched `insert` of the re-tagged records into Supabase `checkins` (each row's `id` is the record's own already-generated real UUID, same convention `addTastingRecord` already uses) — best-effort: a failure is caught and logged, never thrown, exactly like every other Supabase write in this store. The local re-tag (step 3) already fixed this device's own view regardless of network outcome.

**Ownership proof, precisely as the task demanded**: `anonUserId` is read directly from this device's own `localStorage['coffee-passport:anon-id']` (via a new read-only `readExistingAnonId()`, deliberately never creating one) at the exact moment `authUserId` first becomes non-null. This is never a cross-device or cross-user operation — it can only ever touch records already sitting in the calling browser's own local cache, tagged with that same browser's own anonymous id. There is no server-side anonymous row to `UPDATE` (§2 — the FK structurally prevents one from ever existing), so there is no bulk/unsafe update of any kind, satisfying the task's explicit "if ownership can't be safely proven, don't migrate" instruction by construction: proof here *is* "this exact record is sitting in the browser that is, right now, authenticating" — the strongest ownership signal this architecture can produce, and the same standard `reconcileUserScope` itself already relies on for its own purge decisions.

**Wired into `lib/auth/currentUser.tsx`**: inside the existing `useEffect`, before `reconcileUserScope` runs — `if (isAuthenticated) { const anonId = readExistingAnonId(); if (anonId) void claimAnonymousTastings(anonId, resolvedId); }`.

**Idempotency / no duplicates**, verified precisely: the re-tag is destructive (records move, they are never copied), so once claimed, nothing remains tagged with the old anon id for a second call to find — including under React Strict Mode's dev-only double-invoke of effects (confirmed this doesn't race: the synchronous `read()`/`filter()`/`write()` prefix of an `async function` runs to completion, up to its first `await`, before the function yields — so a second, immediately-following invocation always sees the already-re-tagged state, no ref-guard needed). Each row's primary key is also the record's pre-existing UUID, so even a hypothetical repeat `insert` attempt would fail on the primary-key constraint rather than duplicate.

## 5. Privacy guarantees (re-verified against this specific change)

- **`isPublic` is never read or written by `claimAnonymousTastings`** — only `userId` changes. A private tasting made before signup is inserted into Supabase still `is_public = false` (the column's own default, and the record's own already-decided value, both agree); an opted-in one keeps `is_public = true`. Confirmed by reading the exact spread (`{ ...record, userId: realUserId }` — every other field, `isPublic` included, passes through untouched).
- **Community anonymity is unaffected**: `checkins_community_view` (Community Layer pass) never selects `owner_user_id` regardless of what it's set to — reassigning ownership from "never in the DB" (anonymous) to "a real account" doesn't change the view's own column list.
- **No public identity is created**: the claimed rows are owned by a real `auth.users` id exactly like every other checkin that account creates going forward — nothing new is exposed about that id anywhere it wasn't already (§4 of the Identity audit: no display name is ever shown alongside a checkin, public or private).
- **Signup does not auto-publish anything** — confirmed above; also confirmed the reverse (a Community-opted-in anonymous tasting is not somehow un-published by this change) by the same untouched-field argument.

## 6. Logout / account isolation (traced, not assumed)

- **Account A → logout → Account B**: unaffected by this change. `reconcileUserScope`'s existing purge (`previousUserId !== newUserId`, both real) still fires exactly as before — re-verified the new claim step runs first but only ever touches anon-id-tagged records, which by definition can't include Account A's already-real-tagged records, so there is nothing for the claim step to interfere with here.
- **Anonymous → Account A → logout → new anonymous session**: logout resolves back to `getOrCreateAnonId()`, which returns the *same* pre-existing anon id (never regenerated on logout) — but by then, every record that anon id used to own has already been re-tagged to Account A (step 3 above is destructive), so the freshly-anonymous session finds zero matching records. Account A's history does not leak back into anonymous browsing on the same device.
- **Anonymous → Account A → logout → Account B (different real account)**: traced explicitly. The claim step for B's sign-in checks the same device anon id — but it has nothing left under that id either (already claimed by A), so it's a no-op; `reconcileUserScope` then purges A's (including the claimed-from-anonymous) records from local cache before B's session starts, exactly as it already did for any other cross-account switch. Confirmed: B ends up with neither A's original history nor A's claimed-from-anonymous history.

## 7. Files changed

- `lib/journey/store.ts` — new `claimAnonymousTastings()`.
- `lib/auth/currentUser.tsx` — new read-only `readExistingAnonId()`; the existing effect now calls `claimAnonymousTastings()` before `reconcileUserScope()`.
- `components/site/EnthusiastAuthForm.tsx` — `next`/`errorRedirect` are now optional props (defaults reproduce the exact previous hardcoded values, so the homepage call site is unaffected).
- `app/auth/login/page.tsx` — rewritten to render `EnthusiastAuthForm` (with login **and** signup) instead of its own login-only form; reads/threads `next` through.
- `app/auth/actions.ts` — new `withErrorParam()` helper so an `errorRedirect` that already carries a `?next=...` query string gets `&error=...` appended correctly instead of a malformed second `?`; used by both `signInWithPassword` and `signUpWithPassword` (the dev-only `signInAsPilotStaff` already built its redirect URLs correctly and was left untouched).
- `components/shared/Navbar.tsx` — "Log in" (both desktop and mobile menu) now links to `/auth/login?next=<current path + query>` instead of a bare `/auth/login`.

**Not touched**: Canonical Lot architecture, Coffee/Green Lot, `public_id`, `roast_batches`, `reference_roast_profiles`, `reference_taste_profiles`, `checkins` schema/RLS (no migration — the existing "owner manages own checkins" policy and `checkins_community_view` are both unmodified), the Community Check-in opt-in mechanism itself, the QR flow, `requireStaffRole`/staff dashboards (their existing `/auth/login?next=...&error=...` redirects still land on the same route, now with a richer but functionally-compatible page — `signInWithPassword` is unchanged for them).

## 8. Tests / validation

No dedicated test files exist for auth, checkins, `reconcileUserScope`, Passport, or Community anywhere in this repository (confirmed via `**/*.test.ts(x)` glob — the only test file in the project is `lib/server/canonicalLot.test.ts`, unrelated to this area) — consistent with this project's established convention of not unit-testing I/O-shaped store functions. No new test was added, matching that same convention; every function touched here is either a thin prop default, a URL-string builder, or a store function whose correctness is argued directly in §4–6 above.

**`npx tsc --noEmit`** — passed, no output.

**`npx vitest run`** (task specified `npm run vitest -- --run`; this project's `package.json` has no script named `vitest`, so the direct equivalent was used, as in the prior Community pass):
```
✓ lib/server/canonicalLot.test.ts (14 tests)
Test Files  1 passed (1)
     Tests  14 passed (14)
```

**`npm run build`** — passed, 39/39 static pages. `/auth/login` grew from 159 B to 1.33 kB (now a real client component, `EnthusiastAuthForm`, instead of a plain server-rendered form). Every page sharing `Navbar` shows a small shared-chunk size change (the new `usePathname`/`useSearchParams` calls) — expected, since Navbar is used almost everywhere.

## 9. Regression results (full matrix, reasoned from the code, not guessed)

**Anonymous**
- Single/multiple anonymous tastings: unaffected — `addTastingRecord` itself, and every anonymous read path, untouched.
- Anonymous private tasting: untouched field, stays private (§5).
- Anonymous Community opt-in tasting: untouched field, stays opted-in (§5) — the checkbox in `/passport/[lotId]/taste` is still only offered to a signed-in guest, unchanged from the Community Layer pass.

**Signup**
- Signup after one/multiple tastings: `claimAnonymousTastings` re-tags all of them in one pass (not one-at-a-time, no partial migration).
- History visible after signup: yes — re-tagged records immediately match the new real `currentUserId`, so `useJourney()`/`/journey` find them on the very next render (`write()` notifies the store's `useSyncExternalStore` subscribers synchronously).
- Privacy preserved / Community opt-in preserved: §5.

**Existing account**
- Login for an existing user with no local anonymous history on this device: `claimAnonymousTastings` finds nothing tagged with this device's own (different, unrelated) anon id — no-op, `syncCheckinsForUser` still pulls their real Supabase history exactly as before.
- No duplicate tastings: §4's idempotency argument; also, a returning user's *own* already-synced Supabase checkins are pulled by the pre-existing `syncCheckinsForUser`/`mergeById` (unchanged), which merges by `id` and was never touched by this pass.

**Account isolation**
- Logout, login another account: §6 — no leakage, purge behavior unchanged and re-verified compatible with the new claim step.

**Passport**
- QR → Passport: unaffected (no change to `/passport/[lotId]`'s own code).
- Login / Signup from Passport: now both reachable from the same "Log in" link (GAP 1).
- Return to Passport context: `next` now threads the exact originating path (plus query string) through Navbar → `/auth/login` → `EnthusiastAuthForm` → the server action's `redirect(next)`.

**Existing Community**
- Public check-ins remain anonymized: `checkins_community_view`'s column list is unmodified; re-owned rows carry no new identity signal into it.
- Private check-ins remain invisible: base `checkins` RLS (`owner manages own checkins`) is unmodified — untouched by this pass, no migration was written.
- Community recipes unaffected: `brewingRecipesStore`/`recipeVotesStore`/`ExtractionTab` — none of these files were touched.

## 10. Remaining architectural limitations (honestly flagged, not fixed)

- **Cross-tab race**: if a guest has two tabs open and signs in in one while the other is mid-render, there's a narrow window where the second tab's own `CurrentUserProvider` instance could run its claim check against a `localStorage` state that the first tab is simultaneously rewriting. Not specific to this feature — every `localStorage`-backed store in this app has the same inherent multi-tab caveat, and this project has never added cross-tab locking anywhere. Not fixed here, consistent with that established tolerance.
- **Best-effort Supabase sync**: if the batched insert in `claimAnonymousTastings` fails (offline, RLS misconfiguration, migration not applied), the claimed records stay correctly visible on *this* device (the local re-tag already happened) but won't appear on a second device until a retry succeeds — there is no retry queue, matching `addTastingRecord`'s own existing risk profile exactly. Not a regression introduced by this pass; the same characteristic already existed for every other checkin write in this app.
- **Scope, by design**: this pass covers `checkins`/tasting history only, per the task's explicit instruction not to expand scope. The identical "device-local history becomes invisible after signup" shape exists for `brewingRecipesStore`/`equipmentStore`/other personal stores `reconcileUserScope` already knows about — not addressed here, and not evidenced as urgent by this task; would be a separate, equally narrow follow-up if the product wants it.

Stopping here, as instructed — no accounts, profiles, social graph, followers, reputation, leaderboards, recommendations, or new Community features were added.
