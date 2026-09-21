import { BREWING_METHODS, type BrewingMethodId, type Lot, type TastingRecord } from '@/lib/types/coffee';
import { UNSPECIFIED_BARISTA_ID } from '@/lib/data/baristas';

// Primary tasting handed over from XO COFFEE Store.
//
// Store opens  /passport/<passport_public_id>#<fragment>  and the fragment
// carries the guest's post-purchase rating. A fragment (not a query string)
// on purpose: it is never sent to the server, so the rating stays out of
// access logs and analytics. No personal data is part of the format.
//
//   #src=xo-store&v=1&acidity=3&sweetness=4&body=3&overall=5
//     &brew=v60&note=<url-encoded text>&id=<optional idempotency key>
//
//   src        required, must be "xo-store"
//   v          required, must be "1"
//   acidity    required, integer 1-5
//   sweetness  required, integer 1-5
//   body       required, integer 1-5
//   overall    required, integer 1-5   ("понравилось" → TastingRecord.rating)
//   brew       optional, one of BREWING_METHODS ids; absent → "custom"
//   note       optional, trimmed, at most XO_NOTE_MAX_LENGTH chars
//   id         optional, [A-Za-z0-9_-]{1,64}; Store's own stable key for this
//              rating (e.g. order-item id). Without it the key is derived
//              from the payload itself.
//
// Any invalid field rejects the whole payload — nothing is partially saved.

export const XO_SOURCE = 'xo-store';
export const XO_FORMAT_VERSION = '1';
export const XO_NOTE_MAX_LENGTH = 500;

export interface XoStoreTasting {
  acidity: number;
  sweetness: number;
  body: number;
  overall: number;
  brewMethod: BrewingMethodId;
  note: string;
  id: string | null;
}

export type XoParseResult =
  | { status: 'none' } // fragment is not an XO Store handoff at all
  | { status: 'invalid'; reason: string }
  | { status: 'ok'; tasting: XoStoreTasting };

const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const BREW_IDS = new Set<string>(BREWING_METHODS.map((method) => method.id));

function parseScore(value: string | null): number | null {
  if (value === null || !/^[1-5]$/.test(value)) return null;
  return Number(value);
}

export function parseXoStoreFragment(hash: string): XoParseResult {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return { status: 'none' };
  const params = new URLSearchParams(raw);
  if (params.get('src') !== XO_SOURCE) return { status: 'none' };
  if (params.get('v') !== XO_FORMAT_VERSION) return { status: 'invalid', reason: 'unsupported version' };

  const acidity = parseScore(params.get('acidity'));
  const sweetness = parseScore(params.get('sweetness'));
  const body = parseScore(params.get('body'));
  const overall = parseScore(params.get('overall'));
  if (acidity === null || sweetness === null || body === null || overall === null) {
    return { status: 'invalid', reason: 'scores must be integers 1-5' };
  }

  const brew = params.get('brew');
  if (brew !== null && !BREW_IDS.has(brew)) return { status: 'invalid', reason: 'unknown brew method' };

  const note = (params.get('note') ?? '').trim();
  if (note.length > XO_NOTE_MAX_LENGTH) return { status: 'invalid', reason: 'note too long' };

  const id = params.get('id');
  if (id !== null && !KEY_PATTERN.test(id)) return { status: 'invalid', reason: 'bad id' };

  return {
    status: 'ok',
    tasting: {
      acidity,
      sweetness,
      body,
      overall,
      brewMethod: (brew ?? 'custom') as BrewingMethodId,
      note,
      id,
    },
  };
}

// Reference implementation of the sender side, so Store and the tests build
// exactly the format the parser accepts.
export function buildXoStoreFragment(input: {
  acidity: number;
  sweetness: number;
  body: number;
  overall: number;
  brew?: string;
  note?: string;
  id?: string;
}): string {
  const params = new URLSearchParams({
    src: XO_SOURCE,
    v: XO_FORMAT_VERSION,
    acidity: String(input.acidity),
    sweetness: String(input.sweetness),
    body: String(input.body),
    overall: String(input.overall),
  });
  if (input.brew) params.set('brew', input.brew);
  if (input.note) params.set('note', input.note);
  if (input.id) params.set('id', input.id);
  return `#${params.toString()}`;
}

// Local, per-device record of handoffs already turned into tastings. Keyed by
// lot + (Store's id | payload hash), NOT by user: the same physical link
// re-opened after sign-in must not create a second tasting for the same
// rating that a guest claim already carried into the account.
const IMPORTED_KEY = 'coffee-passport:xo-imports';
const IMPORTED_CAP = 200;

function payloadHash(t: XoStoreTasting): string {
  const s = `${t.acidity}|${t.sweetness}|${t.body}|${t.overall}|${t.brewMethod}|${t.note}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function xoImportKey(lotId: string, t: XoStoreTasting): string {
  return `${lotId}:${t.id ?? payloadHash(t)}`;
}

function readImported(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(IMPORTED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function writeImported(keys: string[]) {
  try {
    window.localStorage.setItem(IMPORTED_KEY, JSON.stringify(keys.slice(-IMPORTED_CAP)));
  } catch {
    // Storage unavailable — worst case a re-opened link imports once more.
  }
}

export function buildTastingInput(
  lot: Pick<Lot, 'id' | 'roasterId'>,
  t: XoStoreTasting
): Omit<TastingRecord, 'id' | 'userId' | 'createdAt'> {
  return {
    lotId: lot.id,
    roasterId: lot.roasterId,
    // The Store purchase happened at no known cafe / barista — the same
    // "not specified" values the rest of the app already accepts.
    coffeeShopId: '',
    baristaId: UNSPECIFIED_BARISTA_ID,
    baristaRating: 0,
    baristaNote: '',
    brewingMethod: t.brewMethod,
    rating: t.overall,
    sensoryTags: [],
    subDescriptors: {},
    bodyTexture: null,
    defects: [],
    liked: '',
    disliked: '',
    note: t.note,
    // Store does not ask about bitterness; 0 = "not rated", same as the
    // read-boundary backfill in lib/journey/store.ts.
    guestFlavorProfile: { acidity: t.acidity, sweetness: t.sweetness, body: t.body, bitterness: 0 },
    drinkCategory: '',
    drinkType: '',
    customDrinkName: '',
    milkBaseType: null,
    cowMilkType: null,
    isLactoseFree: false,
    fatContentPercent: null,
    plantMilkType: null,
    milkBalance: null,
    coffeeReadability: null,
    creaminess: null,
    aftertaste: null,
    // Never shared without an explicit opt-in.
    isPublic: false,
  };
}

// Saves the handoff as an ordinary tasting for `userId` (the anonymous id for
// a guest — picked up by the existing claim on sign-up — or the account id).
// `lot` must be a lot that really exists; the caller resolves it.
export function importXoStoreTasting(
  lot: Pick<Lot, 'id' | 'roasterId'>,
  tasting: XoStoreTasting,
  userId: string,
  save: (input: Omit<TastingRecord, 'id' | 'userId' | 'createdAt'>, userId: string) => TastingRecord
): 'imported' | 'duplicate' {
  const key = xoImportKey(lot.id, tasting);
  const seen = readImported();
  if (seen.includes(key)) return 'duplicate';
  // Mark first: the check and the mark are synchronous, so a second
  // invocation in the same tick (Strict Mode effect replay) sees the key.
  writeImported([...seen, key]);
  save(buildTastingInput(lot, tasting), userId);
  return 'imported';
}
