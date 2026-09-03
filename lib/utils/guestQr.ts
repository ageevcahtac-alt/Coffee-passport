// A guest's personal loyalty QR encodes their own auth.users id, prefixed
// so a barista's scanner can tell it apart from a lot QR (see
// lib/utils/lotId.ts's "LOT-" convention for the same idea on that side)
// without accidentally treating a stray scanned string as a guest id.
const GUEST_QR_PREFIX = 'coffeepassport-guest:';

export function buildGuestQrPayload(guestId: string): string {
  return `${GUEST_QR_PREFIX}${guestId}`;
}

// Accepts the prefixed payload this app itself generates, or a bare uuid
// typed/pasted manually — same "be liberal in what a manual fallback
// accepts" idea as extractLotId.
export function extractGuestId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith(GUEST_QR_PREFIX)) return trimmed.slice(GUEST_QR_PREFIX.length).trim();
  return trimmed;
}
