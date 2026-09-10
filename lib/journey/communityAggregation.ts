import { BREWING_METHODS, SENSORY_TAGS, type SensoryTagId } from '@/lib/types/coffee';
import type { CommunityTasting } from './store';

// Contextual Taste (COFFEE_PASSPORT_CONTEXTUAL_TASTE_UX.md, §9/§12) — "как
// его чувствовали другие" only tells a real story when there's enough real
// data behind it. These thresholds are deliberately conservative: if a lot
// only has a couple of opted-in community tastings, showing "most common
// perception" from 2 data points would manufacture a pattern that isn't
// there. Every function here is pure and works only from tastings already
// fetched (public.checkins_community_view, opt-in only) — no new query, no
// new privacy surface.

const SENSORY_TAG_LABELS: Record<SensoryTagId, string> = Object.fromEntries(
  SENSORY_TAGS.map((tag) => [tag.id, tag.label])
) as Record<SensoryTagId, string>;

const BREWING_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  BREWING_METHODS.map((method) => [method.id, method.label])
);

export interface DescriptorTally {
  label: string;
  count: number;
}

// Minimum opted-in tastings (with at least one descriptor each) before
// "most common perception" renders at all.
export const MIN_TASTINGS_FOR_COMMON_DESCRIPTORS = 3;

function tally(tastings: CommunityTasting[]): DescriptorTally[] {
  const counts = new Map<string, number>();
  for (const tasting of tastings) {
    for (const tag of tasting.sensoryTags) {
      const label = SENSORY_TAG_LABELS[tag] ?? tag;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// The single most common perceptions across every opted-in community
// tasting of this lot. Returns [] (never renders) below the minimum
// sample size, or if nobody who opted in picked any descriptor at all.
export function mostCommonDescriptors(tastings: CommunityTasting[], limit = 3): DescriptorTally[] {
  if (tastings.length < MIN_TASTINGS_FOR_COMMON_DESCRIPTORS) return [];
  return tally(tastings).slice(0, limit);
}

export interface BrewMethodDescriptorGroup {
  brewingMethodLabel: string;
  descriptors: DescriptorTally[];
  sampleSize: number;
}

// Minimum opted-in tastings for one specific brew method before it's
// included in the "восприятие меняется по способу приготовления"
// breakdown, and the minimum number of DISTINCT methods meeting that bar
// before the breakdown renders at all — a lot brewed only one way has
// nothing to contrast, so the section simply doesn't apply, not "not
// enough data."
const MIN_TASTINGS_PER_METHOD = 2;
const MIN_DISTINCT_METHODS = 2;

export function descriptorsByBrewMethod(tastings: CommunityTasting[]): BrewMethodDescriptorGroup[] {
  const byMethod = new Map<string, CommunityTasting[]>();
  for (const tasting of tastings) {
    if (!tasting.brewingMethod) continue;
    const group = byMethod.get(tasting.brewingMethod) ?? [];
    group.push(tasting);
    byMethod.set(tasting.brewingMethod, group);
  }

  const groups: BrewMethodDescriptorGroup[] = [];
  for (const [methodId, methodTastings] of byMethod.entries()) {
    if (methodTastings.length < MIN_TASTINGS_PER_METHOD) continue;
    const descriptors = tally(methodTastings);
    if (descriptors.length === 0) continue;
    groups.push({
      brewingMethodLabel: BREWING_METHOD_LABELS[methodId] ?? methodId,
      descriptors: descriptors.slice(0, 3),
      sampleSize: methodTastings.length,
    });
  }

  if (groups.length < MIN_DISTINCT_METHODS) return [];
  return groups.sort((a, b) => b.sampleSize - a.sampleSize);
}
