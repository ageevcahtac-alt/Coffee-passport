# Coffee Passport

Digital coffee passport + personal taste profile + coffee discovery platform.
Pilot roaster: XO Coffee. Architecture supports many roasters, shops, coffees, lots, users.

## Status: Step 3 of the build order — Auth wiring

Done so far:
- Next.js 14 (App Router) + TypeScript + Tailwind scaffolded
- Design tokens + type system in `tailwind.config.ts` / `app/globals.css` (rationale in `DESIGN.md`)
- Landing page (`app/(site)/page.tsx`)
- Supabase browser/server clients (`lib/supabase/`)
- Auth-aware middleware protecting `/dashboard`
- Full route skeleton for every MVP screen (empty placeholders, not yet built)
- Database migration (`supabase/migrations/0001_init_schema.sql`) — coffees vs. lots,
  Q-score on lots, reviews with **no unique constraint** on user+lot so every re-taste
  creates a new history entry, RLS policies
- Seed data for XO Coffee + 2 demo roasters/shops (`supabase/seed/seed.sql`)
- **Auth wiring (this step):**
  - Passwordless email magic-link sign in (`app/auth/login`, `app/auth/actions.ts`) — one
    flow shared by consumers and roaster dashboard users
  - `app/auth/callback/route.ts` exchanges the magic-link code for a session
  - `0002_auth_trigger.sql` auto-creates a `public.users` profile row on signup
  - `app/dashboard/layout.tsx` checks `roaster_members` and shows a clear
    "no roaster access" state instead of a blank/broken dashboard
  - `app/(site)/layout.tsx` + `components/shared/Navbar.tsx` — every consumer page now
    shows sign-in state (Log in / Journey · My taste · Sign out) via one shared route
    group, kept separate from the dashboard's own header so they don't double up

Not done yet (next steps):
- `npm install` (no network in this environment — run locally)
- Create the actual Supabase project, run both migrations, apply the seed
- **Enable Email auth (magic link) in Supabase Auth settings**, and set
  `Site URL` / redirect URLs to match your local + deployed origins
- Build out each route's real UI and data fetching
- QR scan flow, rating flow, taste profile calculation, recommendation engine
- Roaster dashboard CRUD + analytics

## Local setup

\```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npx supabase db push          # or paste 0001_init_schema.sql into the SQL editor
# then run supabase/seed/seed.sql in the Supabase SQL editor
npm run dev
\```

## Project structure

See `coffee-passport-mvp-plan.md` (shared earlier) for the full route/component map
and database schema rationale. `DESIGN.md` documents the visual design plan.

## Environment variables

See `.env.example` for the full list — copy it to `.env.local` and fill
in. Two groups quietly no-op without their values instead of breaking
anything, so it's easy to miss that they're not configured:

- `RESEND_API_KEY` / `PARTNER_NOTIFY_EMAIL` / `PARTNER_NOTIFY_FROM` —
  partner-lead email notifications (`app/api/partner-requests`). Without
  these, a lead is still saved to the database, it just doesn't send an
  email.
- `EVENTS_CRON_SECRET` / `EVENT_SOURCE_ICS_URLS` — see "Scheduled
  maintenance" below.

## Scheduled maintenance (events board)

The "Ближайшие мероприятия" board (`/api/events`,
`supabase/migrations/0014_events_module.sql`) needs a daily pass to
archive events whose `end_date` has passed and to pull new candidates
from any configured `.ics` calendar feeds. Both jobs live behind
secret-gated API routes (`app/api/cron/events-archive`,
`app/api/cron/events-aggregate`) — there's no cron built into this app
or into Render, so the actual scheduler is
`.github/workflows/events-cron.yml`, a GitHub Actions workflow. The
workflow itself is complete; it only needs two secrets set once to start
running:

1. **On the deployed app** (Render → your service → Environment), set
   `EVENTS_CRON_SECRET` to any long random string. This is the value
   both cron routes check for in the request's
   `Authorization: Bearer <secret>` header before doing anything —
   without it (or with the wrong value) they reply `401 Unauthorized`.
2. **On GitHub** (repo → Settings → Secrets and variables → Actions →
   "New repository secret"), add:
   - `APP_URL` — the deployed app's base URL, e.g.
     `https://coffee-passport.onrender.com` (no trailing slash)
   - `EVENTS_CRON_SECRET` — the exact same value you set in step 1
3. That's it, no code or workflow change needed. Once both secrets
   exist, the workflow runs automatically every day at 03:00 UTC, and
   can also be triggered on demand from the repo's **Actions** tab →
   "Events maintenance (archive + aggregate)" → **Run workflow**.

Optional: to actually pull events from somewhere instead of only ones
added by hand in `/dashboard/admin/events`, also set
`EVENT_SOURCE_ICS_URLS` on the deployed app to one or more comma-
separated `.ics` calendar feed URLs (see `lib/events/sources`).