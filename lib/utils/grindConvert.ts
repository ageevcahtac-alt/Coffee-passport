import type { BrewingMethodId } from '@/lib/types/coffee';
import { GRIND_REFERENCE_TABLE } from '@/lib/data/grindReferenceTable';
import type { GrindConfirmation } from '@/lib/data/grindConfirmationsStore';

// Estimates an equivalent grind setting on a different grinder — the core
// logic behind the "Адаптировать под себя" hint in
// components/coffee/EnthusiastRecipeForm.tsx. Pure function, no store/DOM
// access, so it stays easy to test and reuse.
//
// Data-source priority (highest wins), documented for callers:
//   1. serverMedian — cross-device community median from the
//      grind_conversion_medians view (0038), consented rows only;
//   2. confirmations — this device's local crowd data (average);
//   3. GRIND_REFERENCE_TABLE — static per-model range interpolation.
// The caller (EnthusiastRecipeForm via useGrindServerMedians) passes
// whatever it has; every tier is optional.

export interface GrindEstimate {
  rawValue: number;
  unit: string;
  confidence: 'reference' | 'community';
  displayText: string;
}

export interface ServerMedianInput {
  value: number;
  count: number;
}

// Free-text settings ("клик 18", "деление 4.5", "750 микрон") — pull the
// first number out rather than requiring a clean numeric field.
export function parseLeadingNumber(text: string): number | null {
  // Defensive: callers pass trimmed user input, but the contract is "null
  // for anything unparsable" — never a throw on a null-ish runtime value.
  if (typeof text !== 'string') return null;
  const match = text.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function pluralizeMarks(count: number): string {
  return count === 1 ? 'отметка' : count < 5 ? 'отметки' : 'отметок';
}

export function estimateGrindSetting({
  fromModel,
  fromSettingText,
  toModel,
  brewingMethodId,
  confirmations,
  serverMedian,
}: {
  fromModel: string;
  fromSettingText: string;
  toModel: string;
  brewingMethodId: string;
  confirmations: GrindConfirmation[];
  // Tier 1 (see header): cross-device community median; null/undefined
  // skips straight to the local tiers.
  serverMedian?: ServerMedianInput | null;
}): GrindEstimate | null {
  if (!fromModel.trim() || !toModel.trim() || fromModel === toModel) return null;

  const unitFor = () => GRIND_REFERENCE_TABLE[toModel]?.[brewingMethodId as BrewingMethodId]?.unit ?? '';

  // Tier 1 — the server median outranks everything: it is consented,
  // cross-device community experience.
  if (serverMedian && Number.isFinite(serverMedian.value) && serverMedian.count > 0) {
    const rounded = roundToOneDecimal(serverMedian.value);
    return {
      rawValue: rounded,
      unit: unitFor(),
      confidence: 'community',
      displayText: `≈ ${rounded}${unitFor() ? ` ${unitFor()}` : ''} (по опыту сообщества, ${serverMedian.count} ${pluralizeMarks(serverMedian.count)}) — откалибруйте по вкусу`,
    };
  }

  // Prefer real adaptations the community has already logged for this
  // exact (fromModel, toModel, method) triple over the static reference.
  const relevantConfirmations = confirmations.filter(
    (confirmation) =>
      confirmation.fromModel === fromModel &&
      confirmation.toModel === toModel &&
      confirmation.brewingMethodId === brewingMethodId
  );
  const confirmedValues = relevantConfirmations
    .map((confirmation) => parseLeadingNumber(confirmation.toSetting))
    .filter((value): value is number => value !== null);

  if (confirmedValues.length > 0) {
    const average = confirmedValues.reduce((sum, value) => sum + value, 0) / confirmedValues.length;
    const unit = GRIND_REFERENCE_TABLE[toModel]?.[brewingMethodId as BrewingMethodId]?.unit ?? '';
    const rounded = roundToOneDecimal(average);
    return {
      rawValue: rounded,
      unit,
      confidence: 'community',
      displayText: `≈ ${rounded}${unit ? ` ${unit}` : ''} (по опыту сообщества, ${confirmedValues.length} ${pluralizeMarks(confirmedValues.length)}) — откалибруйте по вкусу`,
    };
  }

  // Fall back to the static reference-range interpolation: where does
  // fromSetting sit within fromModel's typical range for this method, and
  // what's the equivalent position in toModel's typical range?
  const fromRange = GRIND_REFERENCE_TABLE[fromModel]?.[brewingMethodId as BrewingMethodId];
  const toRange = GRIND_REFERENCE_TABLE[toModel]?.[brewingMethodId as BrewingMethodId];
  const fromValue = parseLeadingNumber(fromSettingText);
  if (!fromRange || !toRange || fromValue === null) return null;

  const span = fromRange.max - fromRange.min || 1;
  const relativePosition = Math.min(1, Math.max(0, (fromValue - fromRange.min) / span));
  const rounded = roundToOneDecimal(toRange.min + relativePosition * (toRange.max - toRange.min));

  return {
    rawValue: rounded,
    unit: toRange.unit,
    confidence: 'reference',
    displayText: `≈ ${rounded} ${toRange.unit} (справочно, откалибруйте по вкусу)`,
  };
}
