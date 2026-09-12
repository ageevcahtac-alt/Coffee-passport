// Shared bearer-token check for the XO Store read-only integration boundary
// (app/api/integrations/xo-store/lots) — same shape as
// lib/events/cronAuth.ts's isCronRequestAuthorized, kept as its own function
// rather than reused/generalized because it gates a different consumer with
// its own secret; conflating the two would make rotating one credential
// risk affecting the other. If XO_STORE_INTEGRATION_SECRET isn't
// configured, every request is rejected rather than left open by default.
export function isXoStoreIntegrationRequestAuthorized(request: Request): boolean {
  const secret = process.env.XO_STORE_INTEGRATION_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization');
  return header === `Bearer ${secret}`;
}
