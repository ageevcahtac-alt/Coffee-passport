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
// anaerobic phrase. Matched lowercase as simple substrings — this only
// pre-selects a form field the roaster can still override, so a rare
// false positive costs one click, not a wrong guest-facing fact.
const FAMILY_KEYWORDS: { family: ProcessFamily; words: string[] }[] = [
  {
    family: 'co-ferment',
    words: ['коферментация', 'кофермент', 'совферментация', 'co-ferment', 'coferment'],
  },
  { family: 'anaerobic', words: ['анаэробн', 'anaerobic'] },
  { family: 'washed', words: ['мытая', 'мытый', 'washed'] },
  { family: 'honey', words: ['хани', 'медовая', 'медовый', 'honey', 'pulped natural', 'полумытая'] },
  { family: 'natural', words: ['натуральная', 'натуральный', 'сухая', 'сухой', 'natural', 'dry'] },
];

// Maps a roaster's free-text Lot.process ("Washed", "Анаэробная натуральная"…)
// to a structured family for the form's pre-select when editing a legacy lot.
// Returns null on no match — the form then leaves the family unselected
// instead of guessing. The read side never calls this: guests see only what
// the roaster explicitly entered.
export function inferProcessFamily(processText: string): ProcessFamily | null {
  const text = processText.trim().toLowerCase();
  if (!text) return null;
  for (const { family, words } of FAMILY_KEYWORDS) {
    if (words.some((word) => text.includes(word))) return family;
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
