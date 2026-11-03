import { describe, expect, it } from 'vitest';
import { sharedTastingIsPublic } from './communityConsent';

// Community Layer (docs/reports/COMMUNITY_LAYER_PRODUCT_AUDIT.md) — the
// consent invariant, pinned as a pure-function matrix so the taste form can
// never wire the checkbox up "the wrong way around": a tasting becomes
// public only when a signed-in guest explicitly asked for it.

describe('sharedTastingIsPublic', () => {
  it('signed-in guest with the checkbox on → public', () => {
    expect(sharedTastingIsPublic(true, true)).toBe(true);
  });

  it('signed-in guest who left the checkbox off → private', () => {
    expect(sharedTastingIsPublic(true, false)).toBe(false);
  });

  it('anonymous guest always → private, even with consent state true', () => {
    // An anonymous checkin never reaches Supabase at all (checkins.owner_user_id
    // references auth.users(id)) — a "public" flag on it could never take
    // effect, so consent must never produce isPublic for a guest who is
    // not signed in.
    expect(sharedTastingIsPublic(false, true)).toBe(false);
  });

  it('anonymous guest with the checkbox off → private', () => {
    expect(sharedTastingIsPublic(false, false)).toBe(false);
  });
});
