import { SENSORY_TAGS, type FlavorSubDescriptors, type SensoryTagId } from '@/lib/types/coffee';

// Contextual Taste (COFFEE_PASSPORT_CONTEXTUAL_TASTE_UX.md) — the reveal's
// core comparison is between the ACTUAL words a guest picked and the
// roaster's ACTUAL declared descriptors, not the four abstract numeric axes
// alone. This file is pure, deterministic, and dependency-free on purpose:
// no semantic similarity, no fuzzy/AI matching, no invented overlap. Two
// descriptors either match (same word, modulo case/whitespace) or they
// don't — per the product decision that a red-apple/citrus mismatch must
// never be silently upgraded to "close enough."

const SENSORY_TAG_LABELS: Record<SensoryTagId, string> = Object.fromEntries(
  SENSORY_TAGS.map((tag) => [tag.id, tag.label])
) as Record<SensoryTagId, string>;

// Every word a guest's pick actually communicates: the parent tag's own
// label for any tag with no sub-descriptor selected under it (this is the
// only signal that exists for a tag like `citrus`, which has no sub-list at
// all — see FLAVOR_SUB_DESCRIPTORS's own comment), plus every specific
// sub-descriptor word the guest drilled into. Order-preserving, so "what
// you picked first" still reads naturally when rendered.
export function getGuestDescriptorWords(
  sensoryTags: SensoryTagId[],
  subDescriptors: FlavorSubDescriptors
): string[] {
  const words: string[] = [];
  for (const tag of sensoryTags) {
    const subs = subDescriptors[tag];
    if (subs && subs.length > 0) {
      words.push(...subs);
    } else {
      words.push(SENSORY_TAG_LABELS[tag] ?? tag);
    }
  }
  return words;
}

function normalize(word: string): string {
  return word.trim().toLowerCase();
}

// Trims, drops empties, and drops duplicates (by normalized form) while
// keeping the first-seen original casing/spelling — so "Клубника" typed
// twice renders once, and comparison is never thrown off by a roaster's
// accidental repeat in their comma-separated field.
function dedupe(words: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of words) {
    const word = raw.trim();
    if (!word) continue;
    const key = normalize(word);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(word);
  }
  return result;
}

export interface DescriptorComparison {
  guestDescriptors: string[]; // deduped, trimmed, guest's own casing
  referenceDescriptors: string[]; // deduped, trimmed, roaster's own casing
  shared: string[]; // present (case/whitespace-insensitively) in both — rendered using the reference's own wording, since that's "the profile's word" for it
  guestOnly: string[]; // guest picked, not in the reference list
  referenceOnly: string[]; // roaster declared, guest didn't pick it
}

// Exact-match only, deliberately. No semantic similarity, no "close
// enough," no AI-assisted matching — see this file's header. A guest
// tasting "Красное яблоко" against a reference of "Цитрус" is a genuine,
// real difference, not a near-miss to be softened.
export function compareDescriptors(rawGuestDescriptors: string[], rawReferenceDescriptors: string[]): DescriptorComparison {
  const guestDescriptors = dedupe(rawGuestDescriptors);
  const referenceDescriptors = dedupe(rawReferenceDescriptors);

  const referenceByNorm = new Map(referenceDescriptors.map((word) => [normalize(word), word]));
  const guestNormSet = new Set(guestDescriptors.map(normalize));

  const shared: string[] = [];
  const guestOnly: string[] = [];
  for (const word of guestDescriptors) {
    const match = referenceByNorm.get(normalize(word));
    if (match) shared.push(match);
    else guestOnly.push(word);
  }

  const referenceOnly = referenceDescriptors.filter((word) => !guestNormSet.has(normalize(word)));

  return { guestDescriptors, referenceDescriptors, shared, guestOnly, referenceOnly };
}
