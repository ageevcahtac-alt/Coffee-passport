import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consumePendingGrindSource, markPendingGrindSource } from './pendingGrindSourceFlag';

// One-shot sessionStorage carrier for the recipe-card -> taste-flow
// handoff (same idiom as pendingShopFlag). Corrupt or foreign payloads must
// degrade to "no source", never throw.

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

describe('pendingGrindSourceFlag', () => {
  beforeEach(() => {
    (globalThis as unknown as { window: { sessionStorage: MemoryStorage } }).window = {
      sessionStorage: new MemoryStorage(),
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('round-trips the source and consumes it one-shot', () => {
    markPendingGrindSource('LOT-1', { grinderModel: 'Mahlkönig EK43', grinderSetting: '7.2' });
    expect(consumePendingGrindSource('LOT-1')).toEqual({ grinderModel: 'Mahlkönig EK43', grinderSetting: '7.2' });
    // Second read is gone — a stale source can never attach to a later tasting.
    expect(consumePendingGrindSource('LOT-1')).toBeNull();
  });

  it('keys by lotId so another lot never sees this source', () => {
    markPendingGrindSource('LOT-1', { grinderModel: 'A', grinderSetting: '1' });
    expect(consumePendingGrindSource('LOT-2')).toBeNull();
    expect(consumePendingGrindSource('LOT-1')).not.toBeNull();
  });

  it.each(['not json', '{"grinderModel":42,"grinderSetting":"7"}', '{"grinderModel":"A"}'])(
    'returns null for corrupt payload %s instead of throwing',
    (raw) => {
      window.sessionStorage.setItem('coffee-passport:pending-grind-source:LOT-1', raw);
      expect(consumePendingGrindSource('LOT-1')).toBeNull();
    }
  );
});
