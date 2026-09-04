// Display-time country-name normalization for the catalog hierarchy (see
// components/coffee/CatalogHierarchy.tsx) — Lot.country is free text with
// no validation anywhere (confirmed: lib/data/coffeeBelt.ts is a 3-entry
// map-pin lookup that silently skips unknown countries, not a whitelist),
// so a typo like "Colambia" would otherwise get its own separate Level-1
// card instead of grouping with every correctly-spelled "Colombia" lot.
// This never rewrites Lot.country in storage — it only decides which
// group a lot's card falls under when rendering the catalog.

const CANONICAL_ORIGIN_COUNTRIES = [
  'Colombia',
  'Ethiopia',
  'Kenya',
  'Brazil',
  'Guatemala',
  'Honduras',
  'Costa Rica',
  'Panama',
  'El Salvador',
  'Nicaragua',
  'Peru',
  'Bolivia',
  'Ecuador',
  'Mexico',
  'Rwanda',
  'Burundi',
  'Tanzania',
  'Uganda',
  'Malawi',
  'Zambia',
  'Yemen',
  'Indonesia',
  'Vietnam',
  'India',
  'China',
  'Papua New Guinea',
  'Jamaica',
  'Dominican Republic',
  'Haiti',
  'Cuba',
];

// A close-enough match snaps to the canonical spelling; too different, and
// snapping would silently merge two genuinely different countries (e.g.
// "Congo" vs "Cuba"), which is worse than just leaving it alone — the
// threshold is fixed rather than proportional to string length for that
// reason, a short name has less room for "close but different."
const MAX_SNAP_DISTANCE = 2;

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) distances[i][0] = i;
  for (let j = 0; j < cols; j += 1) distances[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distances[i][j] = Math.min(
        distances[i - 1][j] + 1,
        distances[i][j - 1] + 1,
        distances[i - 1][j - 1] + cost
      );
    }
  }

  return distances[rows - 1][cols - 1];
}

function titleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Trims/case-folds always; snaps to the nearest CANONICAL_ORIGIN_COUNTRIES
// entry when within MAX_SNAP_DISTANCE edits, otherwise falls back to a
// title-cased version of the trimmed input (still groups "brazil" with
// "Brazil", just doesn't correct a country outside the canonical list).
export function normalizeCountryName(rawCountry: string): string {
  const trimmed = rawCountry.trim().replace(/\s+/g, ' ');
  if (!trimmed) return trimmed;

  const lower = trimmed.toLowerCase();
  let best: { country: string; distance: number } | null = null;

  for (const canonical of CANONICAL_ORIGIN_COUNTRIES) {
    const distance = levenshteinDistance(lower, canonical.toLowerCase());
    if (!best || distance < best.distance) best = { country: canonical, distance };
  }

  if (best && best.distance <= MAX_SNAP_DISTANCE) return best.country;
  return titleCase(trimmed);
}
