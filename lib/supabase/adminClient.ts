import { createClient } from '@supabase/supabase-js';

// A plain (non-SSR, non-cookie) Supabase client for server-side route
// handlers that don't need a user session — the partner-requests API
// routes are gated by HTTP Basic Auth instead (see middleware.ts).
// Uses the anon key: there's no SUPABASE_SERVICE_ROLE_KEY configured for
// this project yet. See the RLS policy comments in
// supabase/migrations/0003_partner_requests.sql for the trust model this
// implies and how to tighten it later.
export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
