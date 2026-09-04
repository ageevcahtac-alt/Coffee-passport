import type { BrewingMethodId } from '@/lib/types/coffee';
import { GRIND_REFERENCE_TABLE } from '@/lib/data/grindReferenceTable';
import type { GrindConfirmation } from '@/lib/data/grindConfirmationsStore';

// Estimates an equivalent grind setting on a different grinder — the core
// logic behind the "Адаптировать под себя" hint in
// components/coffee/EnthusiastRecipeForm.tsx. Pure function, no store/DOM
// access, so it stays easy to test and reuse.

export interface GrindEstimate {
  rawValue: number;
  unit: string;
  confidence: 'reference' | 'community';
  displayText: string;
}

// Free-text settings ("клик 18", "деление 4.5", "750 микрон") — pull the
// first number out rather than requiring a clean numeric field.
export function parseLeadingNumber(text: string): number | null {
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
}: {
  fromModel: string;
  fromSettingText: string;
  toModel: string;
  brewingMethodId: string;
  confirmations: GrindConfirmation[];
}): GrindEstimate | null {
  if (!fromModel.trim() || !toModel.trim() || fromModel === toModel) return null;

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
