import { describe, expect, it } from 'vitest';
import { resolveComparisonRoasterProfile } from './TasteComparison';
import type { RoasterFlavorProfile } from '@/lib/types/coffee';

// TASTE_INTENT_HISTORICAL_LINK_IMPLEMENTATION.md — covers the read-path
// version-selection rule TasteComparison delegates to, without rendering
// the component itself (no jsdom/react-dom in this project — see
// lib/journey/store.test.ts's own note on the same constraint). `fetchById`
// is always passed explicitly here, so this never touches the real
// getReferenceTasteProfileById/Supabase.

const currentActive: RoasterFlavorProfile = { acidity: 1, sweetness: 1, body: 1, bitterness: 1 };
const historicalVersion: RoasterFlavorProfile = { acidity: 5, sweetness: 5, body: 5, bitterness: 5 };

describe('resolveComparisonRoasterProfile', () => {
  it('F: falls back to the current active profile when the tasting has no linked reference', async () => {
    const result = await resolveComparisonRoasterProfile(
      { referenceTasteProfileId: null },
      currentActive,
      async () => historicalVersion
    );
    expect(result).toBe(currentActive);
  });

  it('falls back the same way when referenceTasteProfileId is simply absent (undefined)', async () => {
    const result = await resolveComparisonRoasterProfile({}, currentActive, async () => historicalVersion);
    expect(result).toBe(currentActive);
  });

  it('C: uses the linked historical version when present, even though it differs from the current active profile', async () => {
    const result = await resolveComparisonRoasterProfile(
      { referenceTasteProfileId: 'taste-v1' },
      currentActive,
      async (id) => {
        expect(id).toBe('taste-v1');
        return historicalVersion;
      }
    );
    expect(result).toBe(historicalVersion);
  });

  it('falls back to the current active profile when the linked version fails to resolve', async () => {
    const result = await resolveComparisonRoasterProfile(
      { referenceTasteProfileId: 'missing-or-deleted' },
      currentActive,
      async () => null
    );
    expect(result).toBe(currentActive);
  });
});
