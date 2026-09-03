// Shared bearer-token check for the two events cron routes
// (app/api/cron/events-archive, app/api/cron/events-aggregate). This IS
// the actual security boundary for both — see the trust-model note in
// supabase/migrations/0014_events_module.sql for why (no service-role
// key configured for this project). If EVENTS_CRON_SECRET isn't set,
// every request is rejected rather than left open by default.
export function isCronRequestAuthorized(request: Request): boolean {
  const secret = process.env.EVENTS_CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization');
  return header === `Bearer ${secret}`;
}
