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