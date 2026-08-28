// Accepts whatever a guest/staff member pastes or types into a manual lot
// lookup — a bare id ("LOT-XO-COL-004"), a full passport URL
// ("https://coffee-passport.onrender.com/passport/LOT-XO-COL-004"), or just
// its path ("/passport/LOT-XO-COL-004") — and extracts the clean lot id.
// A real QR code encodes the full URL, so this is what lets pasting that
// whole link into the manual-entry fallback still resolve correctly.
export function extractLotId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  const withoutQuery = trimmed.split(/[?#]/)[0];
  const segments = withoutQuery.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? '';

  return lastSegment.trim().toUpperCase();
}
