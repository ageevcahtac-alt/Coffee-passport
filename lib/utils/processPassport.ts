import type {
  ProcessDetail,
  ProcessFamily,
  SustainabilityBadgeId,
} from '@/lib/types/coffee';

// Process Passport core (PRODUCT_BACKLOG.md #3) — pure, unit-testable mapping
// helpers behind the ProcessPassportCard read side and the LotBuilderForm
// write side, same "pure function, no dependency" pattern as
// lib/utils/extraction.ts and lib/utils/grindConvert.ts.

export const PROCESS_FAMILY_LABELS: Record<ProcessFamily, string> = {
  washed: 'Мытая',
  natural: 'Натуральная',
  honey: 'Хани',
  anaerobic: 'Анаэробная',
  'co-ferment': 'Коферментация',
  other: 'Другая',
};

// Priority order matters: an experimental process named together with a
// classic one ("Washed Anaerobic", "Honey Co-ferment") resolves to the more
// specific/interesting family, and a plain "Natural" doesn't swallow the
// anaerobic phrase. Matching is per whole word (prefix only where a stem is
// explicitly marked) — so "полумытая" is not swallowed by the washed keyword
// "мытая", and "unwashed" doesn't read as washed. This only pre-selects a
// form field the roaster can still override, so a rare false positive costs
// one click, not a wrong guest-facing fact.
interface KeywordRule {
  word: string;
  // Stems match any word they start with (inflected forms: анаэробная,
  // анаэробную…). Unmarked keywords must equal the whole word.
  prefix?: boolean;
}

const FAMILY_KEYWORDS: { family: ProcessFamily; keywords: KeywordRule[] }[] = [
  {
    family: 'co-ferment',
    keywords: [
      { word: 'коферментация', prefix: true },
      { word: 'кофермент', prefix: true },
      { word: 'совферментация', prefix: true },
      { word: 'coferment', prefix: true },
      { word: 'co-ferment' },
    ],
  },
  {
    family: 'anaerobic',
    keywords: [
      { word: 'анаэробн', prefix: true },
      { word: 'anaerobic', prefix: true },
    ],
  },
  { family: 'washed', keywords: [{ word: 'мытая' }, { word: 'мытый' }, { word: 'washed' }] },
  {
    family: 'honey',
    keywords: [
      { word: 'хани' },
      { word: 'медовая' },
      { word: 'медовый' },
      { word: 'honey' },
      { word: 'pulped' },
      { word: 'полумытая' },
    ],
  },
  {
    family: 'natural',
    keywords: [
      { word: 'натуральная' },
      { word: 'натуральный' },
      { word: 'сухая' },
      { word: 'сухой' },
      { word: 'natural' },
      { word: 'dry' },
    ],
  },
];

// Maps a roaster's free-text Lot.process ("Washed", "Анаэробная натуральная"…)
// to a structured family for the form's pre-select when editing a legacy lot.
// Returns null on no match — the form then leaves the family unselected
// instead of guessing. The read side never calls this: guests see only what
// the roaster explicitly entered.
export function inferProcessFamily(processText: string): ProcessFamily | null {
  // Hyphens are dropped so "co-ferment" tokenizes as one word; everything
  // else is split into letter sequences, so boundaries come for free.
  const text = processText.trim().toLowerCase().replace(/-/g, '');
  if (!text) return null;
  const words = text.match(/[a-zа-яё]+/g) ?? [];
  for (const { family, keywords } of FAMILY_KEYWORDS) {
    for (const { word, prefix } of keywords) {
      if (words.some((w) => (prefix ? w.startsWith(word) : w === word))) return family;
    }
  }
  return null;
}

// Form input stays a text field (roasters may type "5", "5 дней", "72 ч");
// only a plain positive integer is a trustworthy day count — anything else
// (0, negatives, fractions, huge values, letters) means "didn't say", not
// "garbage number shown to guests". Over a year is a typo, not a process.
export function parseFermentationDays(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const days = Number(trimmed);
  if (!Number.isSafeInteger(days) || days <= 0 || days > 365) return null;
  return days;
}

export function formatFermentationDays(days: number): string {
  const mod100 = Math.abs(days) % 100;
  const mod10 = Math.abs(days) % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${days} дней`;
  if (mod10 === 1) return `${days} день`;
  if (mod10 >= 2 && mod10 <= 4) return `${days} дня`;
  return `${days} дней`;
}

// The card renders only when the roaster actually entered something —
// badges alone are enough, as is any filled processDetail field.
export function hasProcessPassportContent(
  detail: ProcessDetail | undefined,
  badges: SustainabilityBadgeId[] | undefined
): boolean {
  if (badges && badges.length > 0) return true;
  if (!detail) return false;
  return Boolean(
    detail.family || detail.fermentationDays !== null || detail.vessel.trim() || detail.roasterNote.trim()
  );
}
