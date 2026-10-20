# P16 — Anonymous Tasting → Save to Coffee Passport

Implements the single gap P15 identified: an anonymous guest who finishes
a blind tasting has no in-flow invitation to register and keep the
result. The claim mechanism (`claimAnonymousUserData` /
`claimAnonymousTastings`) already existed and already fires automatically
on login — this stage only makes that fact visible and actionable at the
moment it matters.

---

## 1. Source commit

```
5131774  P15: audit Coffee Passport integration contract
```

## 2. Result commit

Committed after this document, as:

```
P16: enable anonymous tasting save flow
```

## 3. Changed files

```
components/coffee/FarmerPinningModal.tsx   (+30 lines, -0 removed)
P16_ANONYMOUS_TASTING_SAVE_FLOW.md         (new — this file)
```

Nothing else. Confirmed via `git status` before committing that the two
pre-existing uncommitted files on this branch —
`app/(site)/passport/[lotId]/taste/page.tsx` (in-progress Community-Layer
opt-in checkbox) and `app/auth/actions.ts` (error-redirect query-string
fix) — were left exactly as found; neither was touched or included in
this change.

---

## 4. Existing mechanisms reused

Nothing new was built underneath the UI. Specifically reused, unchanged:

- **Anonymous UUID** — `getOrCreateAnonId()` /
  `localStorage['coffee-passport:anon-id']`
  (`lib/auth/currentUser.tsx`). The modal reads the guest's auth state
  through the same `useCurrentUser()` hook every other component uses;
  it does not touch the anon-id mechanism directly.
- **localStorage** — `lib/journey/store.ts`'s `addTastingRecord` /
  `coffee-passport:journey`. The tasting this modal celebrates was
  already saved here by the time the modal renders (`taste/page.tsx`
  calls `addTastingRecord` before setting `showPinningRitual`).
- **`claimAnonymousUserData` / `claimAnonymousTastings`**
  (`lib/journey/claimAnonymousData.ts`, `lib/journey/store.ts`) — fires
  automatically inside `CurrentUserProvider`
  (`lib/auth/currentUser.tsx`) the moment `authUserId` first becomes
  non-null on a device that already had an anonymous id. Not called
  directly by anything added in this stage — it is already wired to run
  on the very next full-page load after login, which is exactly what
  happens once the guest submits the auth form.
- **Auth flow** — `/auth/login` (`app/auth/login/page.tsx`) +
  `EnthusiastAuthForm` (`components/site/EnthusiastAuthForm.tsx`) +
  `signInWithPassword` / `signUpWithPassword` server actions
  (`app/auth/actions.ts`), including their existing `next` redirect
  (`safeNextPath`). The new CTA only constructs a URL to this existing
  page — no new auth code was written.

---

## 5. UX change

`components/coffee/FarmerPinningModal.tsx` — one new conditional block,
inserted between the existing "Кадр 3.5" (barista card) and "Кадр 4"
(gold "Перейти к карте путешествия" button), shown only when
`!isAuthenticated && !saveDismissed`:

```
Сохрани эту дегустацию в своём Coffee Passport — и собирай свою историю кофе.

[ Сохранить в Coffee Passport ]   (primary, gold)
Не сейчас                          (secondary, plain text link)
```

- **"Сохранить в Coffee Passport"** → `router.push('/auth/login?next=' +
  encodeURIComponent('/passport/' + lot.id))`. Confirmed by manual E2E
  test to navigate to
  `/auth/login?next=%2Fpassport%2FLOT-XO-ETH-001`.
- **"Не сейчас"** → sets local `saveDismissed` state to `true`, which
  only hides this one block. It does not close the modal, does not
  block navigation, and does not touch any tasting data — the guest's
  already-saved result is completely unaffected. The modal's existing
  "Перейти к карте путешествия" button and the × close button remain
  available exactly as before.
- For an authenticated guest (`isAuthenticated === true`), the block
  never renders — verified in the E2E pass (§8, Test 4).

No other component was touched. `taste/page.tsx`'s `handleFinish` (which
decides whether a tasting can be saved at all) is unchanged; this stage
only adds a link inside the modal that already appears after that save
succeeds.

---

## 6. Registration behavior

Registration is **never** a precondition to see a result — confirmed by
the existing code path being entirely unchanged: `handleFinish` in
`taste/page.tsx` already allows any resolved `userId` (real or
anonymous) to save, and this stage adds nothing before that point.
Registration is offered exactly once, after the result already exists,
as an explicit choice with an equally visible way to decline
("Не сейчас"). It is copy-only, framed as "save this" rather than
"unlock this" or "continue" — matching §4/§17's hard requirement not to
gate or coerce.

An already-authenticated guest never sees any registration prompt in
this flow (§16) — confirmed in Test 4.

---

## 7. Claim behavior

Unchanged from what P15 found already implemented — this stage did not
modify `claimAnonymousUserData`, `claimAnonymousTastings`, or any of
their call sites. What the E2E pass (§8) newly confirms is that the
existing mechanism actually produces the exact chain P16 requires:

```
finish tasting (anonymous)
  → addTastingRecord(..., anonId)      [localStorage only — confirmed]
  → "Сохранить в Coffee Passport"
  → /auth/login?next=/passport/{lotId}
  → signUpWithPassword (server action)
  → redirect(next)                      [full page load]
  → CurrentUserProvider: authUserId now non-null
      → claimAnonymousUserData(anonId, realUserId)
          → claimAnonymousTastings: every local record with
            userId === anonId is re-tagged to realUserId,
            then inserted into public.checkins
  → guest lands on /passport/{lotId}, now authenticated
  → /journey (or a reload of any page) re-fetches from Supabase
    and shows the claimed tasting(s)
```

Verified directly (§8, Test 3/Test 5) — not inferred — that **both**
anonymous tastings recorded before registration (not just the most
recent one) were re-tagged and reached the real `checkins` table.

---

## 8. E2E results

All five scenarios run manually against the local dev build
(`npm run dev`, real Supabase project, real signup) using
`LOT-XO-ETH-001` — a live browser session, not a mock.

### Test 1 — Anonymous
`/passport/LOT-XO-ETH-001` → tasting flow → finish. Result: tasting
saved to `localStorage` under a fresh per-browser anon id (confirmed by
reading `coffee-passport:journey` directly — new record present,
`userId` equal to `coffee-passport:anon-id`), `FarmerPinningModal`
renders with the new "Сохранить в Coffee Passport" / "Не сейчас" block
visible. **Pass.**

### Test 2 — Skip
From the same modal, clicked "Не сейчас". Result: the save block
disappears; the modal's existing "Перейти к карте путешествия" CTA and
× close remain fully functional; no registration occurred; no tasting
data was altered or lost. **Pass.**

### Test 3 — Register
Repeated the tasting flow (second anonymous tasting, same browser),
this time clicking "Сохранить в Coffee Passport". Landed on
`/auth/login?next=%2Fpassport%2FLOT-XO-ETH-001` (confirmed exact URL).
Completed signup via the existing form (no email-confirmation gate on
this Supabase project, so a session was granted immediately). Redirected
straight to `/passport/LOT-XO-ETH-001` per `next`, now authenticated
("Sign out" in nav). Read `localStorage` afterward: **both** of this
session's anonymous tasting records now carry the new real account's
`userId`. Reloaded `/journey` with network logging on — two `GET
.../rest/v1/checkins?...owner_user_id=eq.{realUserId}` requests returned
`200`, and the merged local records came back with Postgres-formatted
`created_at` timestamps (`+00:00`), confirming they now live in
`public.checkins` server-side, not only in the local cache. **Pass.**

### Test 4 — Existing guest
While signed in as the account created in Test 3, repeated the full
tasting flow again. `FarmerPinningModal` rendered **without** the
save/registration block — only the pre-existing "Перейти к карте
путешествия" CTA — confirming an authenticated guest is never shown an
irrelevant "create an account" prompt. **Pass.**

### Test 5 — Multiple anonymous tastings
Covered by the same run as Test 3: two separate anonymous tastings
(different café/drink/barista selections) were recorded under the same
anon id before registration. After signup, both were confirmed
re-tagged and present server-side — not just the most recent one.
**Pass.**

---

## 9. Regression checks

- **TypeScript** (`npx tsc --noEmit`) — clean, no errors, both before and
  after the change.
- **ESLint** — this project has no ESLint config committed
  (`.eslintrc*` / `eslint.config*` absent); `npm run lint` (`next lint`)
  prompts an interactive first-time setup wizard rather than running.
  This is a pre-existing condition of the repository, not something this
  stage introduced or attempted to fix (out of scope); the interactive
  prompt was not answered, so no config file was created.
- **`npm test`** (`vitest run`) — **143/143 passed**, 18 test files,
  including `lib/journey/claimAnonymousData.test.ts` (8 tests covering
  the exact claim orchestration this stage depends on) and
  `lib/journey/store.test.ts` — both unaffected since no store/claim
  code was touched.
- **`npm run build`** (`next build`) — succeeded, all 36 routes compiled
  and prerendered/generated without error, including
  `/passport/[lotId]` and `/passport/[lotId]/taste`.
- **Manual E2E** — see §8, all 5 scenarios pass against a live dev
  server and a real Supabase project (not mocked).

---

## 10. Remaining gaps

Real, not busywork:

1. **No dedicated public Lot API** (carried over from P15, unrelated to
   this stage) — still only relevant if XO COFFEE ever needs Lot
   metadata server-to-server rather than a human-facing link.
2. **Email confirmation is environment-dependent.** This stage's E2E
   registration test worked because the Supabase project used for
   testing does not require email confirmation on signup — the same
   condition `signInAsPilotStaff` in `app/auth/actions.ts` already
   documents for the dev role-switcher. If "Confirm email" is enabled on
   a given environment, `signUpWithPassword` still redirects to `next`,
   but the guest won't have an active session (and therefore no claim)
   until they click the confirmation link and are routed through
   `/auth/callback`. This is pre-existing behavior of the whole app's
   auth system, not something this stage changed or could reasonably
   change — flagging it because it directly affects whether "Save"
   feels instant for a given deployment.
3. **`saveDismissed` is component-local state only.** Dismissing the
   prompt is per-tasting-modal-instance, not remembered across future
   tastings — an anonymous guest will see the same prompt again after
   their next tasting. This matches §4/§14/§17's explicit "never gate,
   always a value-first offer, one clear skip" requirement (repetition
   is the point — it is not urgent nagging, since it only ever appears
   after a result already exists and is always skippable), so this is a
   deliberate choice, not an oversight — noted here so it can be revisited
   if product feedback says otherwise.
4. **Test artifact left in the shared Supabase project**: the manual E2E
   pass created one real enthusiast account
   (`p16-test-claim@example.com`) to prove the claim chain end-to-end.
   Not deleted — this session has no admin/service-role access to remove
   a Supabase Auth user, and the project already carries similar
   `*@test.com` pilot fixtures by design (see `lib/auth/pilotStaff.ts`).
   Flagging it explicitly rather than leaving it silent.

---

## Non-goals honored (per P16 §12/§13/§25)

- Tasting engine, `TastingRecord`, `public.checkins` schema — untouched.
- Anonymous UUID / localStorage model — untouched.
- `claimAnonymousUserData` / `claimAnonymousTastings` — untouched, only
  exercised through their existing trigger point.
- RLS, auth system, Canonical Lot model — untouched.
- No new table, no new auth mechanism, no new Lot entity, no cross-device
  or email-based anonymous identity, no temporary server account.
