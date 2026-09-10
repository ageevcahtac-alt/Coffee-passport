import { createClient } from '@supabase/supabase-js';

// A plain (non-SSR, non-cookie) Supabase client for server-side route
// handlers that don't need a user session — the partner-requests API
// routes are gated by HTTP Basic Auth instead (see middleware.ts).
//
// Production readiness hardening (see COFFEE_PASSPORT_PRODUCTION_READINESS_AUDIT.md):
// 0003_partner_requests.sql's own anon-key "acceptable for now" policies
// have been dropped by 0028_partner_requests_lockdown.sql — partner_requests
// is no longer readable/writable with the public anon key at all. This
// client therefore MUST use SUPABASE_SERVICE_ROLE_KEY (never exposed to the
// browser, never NEXT_PUBLIC_) to keep working; it throws loudly rather
// than silently falling back to the anon key, which after the RLS lockdown
// would just fail every read/update with a permission error anyway.
export function createAdminSupabaseClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'createAdminSupabaseClient: SUPABASE_SERVICE_ROLE_KEY is not set. The /admin CRM cannot read or update partner_requests without it (see 0028_partner_requests_lockdown.sql).'
    );
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
