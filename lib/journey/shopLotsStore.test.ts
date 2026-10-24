import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TastingRecord } from '@/lib/types/coffee';
import { claimShopLotsForUser, getShopLotIds, saveShopLot, untastedShopLotIds } from './shopLotsStore';
import {
  parsePassportEntry,
  resolvePassportView,
  shouldMarkProfileSeen,
} from '@/app/(site)/passport/[lotId]/passportView';

// Отложенный каппинг: лот, открытый через «Я в магазине», остаётся в «Моём
// кофейном путешествии» как «Не попробован», пока гость его не оценит.
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

function tasting(lotId: string, userId: string): TastingRecord {
  return { lotId, userId } as TastingRecord;
}

describe('shopLotsStore', () => {
  beforeEach(() => vi.stubGlobal('window', { localStorage: new MemoryStorage() }));
  afterEach(() => vi.unstubAllGlobals());

  it('keeps a lot opened in the store, per user, newest first, once', () => {
    saveShopLot('user-a', 'lot-1');
    saveShopLot('user-a', 'lot-2');
    saveShopLot('user-a', 'lot-1');
    saveShopLot('user-b', 'lot-3');
    expect(getShopLotIds('user-a')).toEqual(['lot-1', 'lot-2']);
    expect(getShopLotIds('user-b')).toEqual(['lot-3']);
    expect(getShopLotIds('user-c')).toEqual([]);
  });

  it('ignores an unresolved user id', () => {
    saveShopLot('', 'lot-1');
    expect(getShopLotIds('')).toEqual([]);
  });

  it('shows only lots this user has not tasted yet', () => {
    saveShopLot('user-a', 'lot-1');
    saveShopLot('user-a', 'lot-2');
    const records = [tasting('lot-1', 'user-a'), tasting('lot-2', 'user-b')];
    expect(untastedShopLotIds('user-a', records)).toEqual(['lot-2']);
  });

  it('moves anonymous store lots to the account on sign-in, without duplicates', () => {
    saveShopLot('anon', 'lot-1');
    saveShopLot('anon', 'lot-2');
    saveShopLot('user-a', 'lot-2');
    claimShopLotsForUser('anon', 'user-a');
    expect(getShopLotIds('user-a').sort()).toEqual(['lot-1', 'lot-2']);
    expect(getShopLotIds('anon')).toEqual([]);
  });

  it('claimAnonymousUserData claims store lots too', () => {
    const claim = fs.readFileSync(path.join(__dirname, 'claimAnonymousData.ts'), 'utf8');
    expect(claim).toMatch(/claimShopLotsForUser\(anonUserId, realUserId\)/);
  });

  it('survives broken storage', () => {
    window.localStorage.setItem('coffee-passport:shop-lots', '{not json');
    expect(getShopLotIds('user-a')).toEqual([]);
    vi.stubGlobal('window', {});
    expect(() => saveShopLot('user-a', 'lot-1')).not.toThrow();
    expect(getShopLotIds('user-a')).toEqual([]);
  });
});

describe('store path saves the lot to the journey', () => {
  const page = fs.readFileSync(path.join(__dirname, '../../app/(site)/passport/[lotId]/page.tsx'), 'utf8');

  it('the passport page saves the lot when the store view opens', () => {
    expect(shouldMarkProfileSeen('lot-info')).toBe(true);
    expect(page).toMatch(/shouldMarkProfileSeen\(view\)[\s\S]{0,200}saveShopLot\(currentUserId, resolvedLotId\)/);
  });

  it('?entry=cafe from the journey button opens the blind path at the shop pick', () => {
    expect(page).toMatch(/parsePassportEntry\(searchParams\.get\('entry'\)\)/);
    const entry = parsePassportEntry('cafe');
    expect(entry).toBe('cafe');
    expect(resolvePassportView({ isPreview: false, entry, shopId: null, hasTastingHere: false, canonicalStatus: 'active' }))
      .toBe('location');
    expect(parsePassportEntry('shop')).toBe('shop');
    expect(parsePassportEntry('evil')).toBeNull();
    expect(parsePassportEntry(null)).toBeNull();
  });
});
