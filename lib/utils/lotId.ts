// Accepts whatever a guest/staff member pastes or types into a manual lot
// lookup — a bare id ("LOT-XO-COL-004"), a full passport URL
// ("https://coffee-passport.onrender.com/passport/LOT-XO-COL-004"), or just
// its path ("/passport/LOT-XO-COL-004") — and extracts the clean lot id.
// A real QR code encodes the full URL, so this is what lets pasting that
// whole link into the manual-entry fallback still resolve correctly.
export function extractLotId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // A lot id always starts with "LOT-" (see lib/data/lots.ts) — pull that
  // pattern out from anywhere in the pasted text first. This is the most
  // reliable signal and also covers pastes messier than a clean URL (extra
  // words, a forwarded message, stray punctuation).
  const idMatch = trimmed.match(/(LOT-[A-Za-z0-9-]+)/i);
  if (idMatch) return idMatch[1].toUpperCase();

  // Fallback for anything that slips past that pattern: treat it as a
  // URL/path and take the last segment.
  const withoutQuery = trimmed.split(/[?#]/)[0];
  const segments = withoutQuery.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? '';

  return lastSegment.trim().toUpperCase();
}
