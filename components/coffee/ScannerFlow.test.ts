import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A small deterministic hook/ref harness exercises callbacks and camera-loop
// lifecycle in Node. It deliberately makes no claims about browser rendering.
const harness = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0, effects: [] as (() => void)[], cleanups: [] as (() => void)[],
  push: vi.fn(), syncLots: vi.fn(), syncMenu: vi.fn(), getLot: vi.fn(), menu: vi.fn(), decode: vi.fn(),
  useLots: vi.fn(), journeyRecords: [] as unknown[],
}));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useRef: (initial: unknown) => {
    const i = harness.cursor++;
    return harness.slots[i] ??= { current: initial };
  },
  useState: (initial: unknown) => {
    const i = harness.cursor++;
    if (!(i in harness.slots)) harness.slots[i] = initial;
    return [harness.slots[i], (value: unknown) => {
      harness.slots[i] = typeof value === 'function' ? value(harness.slots[i]) : value;
    }];
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const i = harness.cursor++;
    const old = harness.slots[i] as unknown[] | undefined;
    if (!old || deps.some((value, index) => value !== old[index])) {
      harness.effects.push(() => { const cleanup = effect(); if (cleanup) harness.cleanups.push(cleanup); });
      harness.slots[i] = deps;
    }
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: harness.push }) }));
vi.mock('@/lib/data/lotsStore', () => ({ syncLotsFromSupabase: harness.syncLots, getMergedLotById: harness.getLot }));
vi.mock('@/lib/data/cafeMenuStore', () => ({ syncCafeMenuFromSupabase: harness.syncMenu, getMenuLotIds: harness.menu }));
vi.mock('@/lib/data/useLots', () => ({ useLots: harness.useLots }));
vi.mock('@/lib/data/roasters', () => ({ getRoasterById: () => undefined }));
vi.mock('jsqr', () => ({ default: harness.decode }));
vi.mock('@/lib/auth/currentUser', () => ({ useCurrentUser: () => ({ userId: 'guest-1', ready: true }) }));
vi.mock('@/lib/journey/useJourney', () => ({ useJourney: () => harness.journeyRecords }));
vi.mock('@/lib/journey/mapFlag', () => ({ consumePinJustActivated: () => null }));
vi.mock('@/components/coffee/CoffeeBeltMap', () => ({ CoffeeBeltMap: () => null }));
vi.mock('@/components/coffee/CoffeeJourney', () => ({ CoffeeJourney: () => null }));
vi.mock('@/components/coffee/EventsBoard', () => ({ EventsBoard: () => null }));
vi.mock('@/components/coffee/TrophyShelf', () => ({ TrophyShelf: () => null }));
vi.mock('@/components/coffee/BarUpdatesPanel', () => ({ BarUpdatesPanel: () => null }));
vi.mock('@/components/coffee/CoffeeShopProfileCard', () => ({ CoffeeShopProfileCard: () => null }));
vi.mock('@/components/coffee/TastingRecordCard', () => ({ TastingRecordCard: () => null }));
vi.mock('@/components/coffee/TastingDetailModal', () => ({ TastingDetailModal: () => null }));
vi.mock('@/components/coffee/TastePassportCard', () => ({ TastePassportCard: () => null }));

import { QrScanner } from './QrScanner';
import { ScanLotModal } from './ScanLotModal';
import ScanPage from '@/app/(site)/scan/page';
import JourneyPage from '@/app/(site)/journey/page';
import { CoffeeBeltMap } from './CoffeeBeltMap';
import { CoffeeJourney } from './CoffeeJourney';

type Node = React.ReactElement<Record<string, unknown>>;
function nodes(tree: React.ReactNode): Node[] {
  if (!React.isValidElement(tree)) return [];
  const element = tree as Node;
  return [element, ...React.Children.toArray(element.props.children as React.ReactNode).flatMap(nodes)];
}
function render(component: () => React.ReactNode) {
  harness.cursor = 0;
  return nodes(component());
}
function effects() { harness.effects.splice(0).forEach(effect => effect()); }
function scanner(tree: Node[]) {
  return tree.find(node => node.type === QrScanner)!.props as {
    onDecode: (text: string) => void | Promise<void>; resetKey: number;
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  harness.slots = []; harness.cursor = 0; harness.effects = []; harness.cleanups = [];
  vi.clearAllMocks();
  harness.syncLots.mockResolvedValue(undefined); harness.syncMenu.mockResolvedValue(undefined);
  harness.getLot.mockReturnValue(undefined); harness.menu.mockReturnValue([]);
  harness.useLots.mockReturnValue([]); harness.journeyRecords = [];
  vi.stubGlobal('React', React);
});
afterEach(() => { harness.cleanups.forEach(cleanup => cleanup()); vi.unstubAllGlobals(); });

describe('QR entry points', () => {
  it('/scan delegates a real non-seed lot directly to its passport', () => {
    const tree = render(ScanPage);
    scanner(tree).onDecode('https://coffee.example/passport/LOT-REMOTE-123');
    expect(harness.push).toHaveBeenCalledWith('/passport/LOT-REMOTE-123');
  });

  it('modal awaits both catalog and menu sync, then reads their fresh snapshots', async () => {
    const lots = deferred(); const menu = deferred();
    harness.syncLots.mockReturnValue(lots.promise); harness.syncMenu.mockReturnValue(menu.promise);
    const tree = render(() => ScanLotModal({ onClose: () => {} })); effects();
    const pending = scanner(tree).onDecode('LOT-REMOTE-123');
    lots.resolve(); await Promise.resolve();
    expect(harness.getLot).not.toHaveBeenCalled(); expect(harness.push).not.toHaveBeenCalled();
    harness.getLot.mockReturnValue({ id: 'LOT-REMOTE-123' }); harness.menu.mockReturnValue(['LOT-REMOTE-123']);
    menu.resolve(); await pending;
    expect(harness.getLot).toHaveBeenCalledWith('LOT-REMOTE-123');
    expect(harness.push).toHaveBeenCalledWith('/passport/LOT-REMOTE-123');
  });

  it('unknown local lot delegates to the passport instead of false rejection', async () => {
    const tree = render(() => ScanLotModal({ onClose: () => {} })); effects();
    await scanner(tree).onDecode('LOT-REMOTE-123');
    expect(harness.push).toHaveBeenCalledWith('/passport/LOT-REMOTE-123');
  });

  it('menu rejection offers retry and the next decode can succeed', async () => {
    harness.getLot.mockReturnValue({ id: 'LOT-REMOTE-123' });
    let tree = render(() => ScanLotModal({ onClose: () => {} })); effects();
    await scanner(tree).onDecode('LOT-REMOTE-123');
    expect(harness.push).not.toHaveBeenCalled();
    tree = render(() => ScanLotModal({ onClose: () => {} }));
    const retry = tree.find(node => node.type === 'button' && node.props.children === 'Сканировать ещё раз')!;
    (retry.props.onClick as () => void)();
    tree = render(() => ScanLotModal({ onClose: () => {} }));
    expect(scanner(tree).resetKey).toBe(1);
    harness.menu.mockReturnValue(['LOT-REMOTE-123']);
    await scanner(tree).onDecode('LOT-REMOTE-123');
    expect(harness.push).toHaveBeenCalledWith('/passport/LOT-REMOTE-123');
  });
});

describe('new-device journey catalog loading', () => {
  it('syncs on mount and keeps the parent subscribed so refreshed lots resolve map/history context', async () => {
    const ownRecord = { id: 'tasting-1', userId: 'guest-1', lotId: 'LOT-REMOTE-123', coffeeShopId: 'shop-pilot' };
    const otherRecord = { ...ownRecord, id: 'private-other', userId: 'guest-2' };
    harness.journeyRecords = [ownRecord, otherRecord];
    let tree = render(JourneyPage);
    expect(tree.find(node => node.type === CoffeeBeltMap)!.props.pins).toEqual([]);
    expect(tree.find(node => node.type === CoffeeJourney)!.props.records).toEqual([ownRecord]);
    effects();
    expect(harness.syncLots).toHaveBeenCalledOnce();
    await Promise.resolve();
    harness.getLot.mockReturnValue({ id: 'LOT-REMOTE-123', country: 'Эфиопия' });
    // Model the subscription notification's next render, not a browser mount.
    tree = render(JourneyPage); effects();
    expect(harness.useLots).toHaveBeenCalledTimes(2);
    expect(harness.syncLots).toHaveBeenCalledOnce();
    expect(tree.find(node => node.type === CoffeeBeltMap)!.props.pins).toEqual([
      { country: 'Эфиопия', coffeeShopId: 'shop-pilot', justActivated: false },
    ]);
    expect(tree.find(node => node.type === CoffeeJourney)!.props.records).toEqual([ownRecord]);
  });
});

describe('camera callback and retry lifecycle', () => {
  it('uses the latest callback and resumes decoding after reset without reopening the camera', async () => {
    const frames = new Map<number, FrameRequestCallback>(); let frameId = 0;
    const stop = vi.fn(); const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const initial = vi.fn(); const fresh = vi.fn();
    const mount = render(() => QrScanner({ onDecode: initial }));
    for (const node of mount) {
      const ref = (node as unknown as { ref?: { current: unknown } }).ref;
      if (node.type === 'video' && ref) ref.current = { readyState: 4, HAVE_ENOUGH_DATA: 4, videoWidth: 1, videoHeight: 1, play: async () => {} };
      if (node.type === 'canvas' && ref) ref.current = { getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }) };
    }
    effects(); await Promise.resolve(); await Promise.resolve();
    render(() => QrScanner({ onDecode: fresh })); effects();
    harness.decode.mockReturnValue({ data: 'LOT-REMOTE-123' });
    const tick = frames.values().next().value!; frames.clear(); tick(0);
    expect(initial).not.toHaveBeenCalled(); expect(fresh).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    render(() => QrScanner({ onDecode: fresh, resetKey: 1 })); effects();
    expect(frames.size).toBe(1);
    frames.values().next().value!(0);
    expect(fresh).toHaveBeenCalledTimes(2);
    expect(getUserMedia).toHaveBeenCalledOnce(); expect(stop).not.toHaveBeenCalled();
  });
});
