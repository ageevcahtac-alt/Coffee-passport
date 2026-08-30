import type { BrewingMethodId } from '@/lib/types/coffee';

// Approximate community/manufacturer-guide starting-point ranges per
// grinder model and brewing method, in that grinder's own native setting
// unit. This is NOT a physical micron-equivalence table — burr geometry
// differs too much between models for that to be honest. Instead
// lib/utils/grindConvert.ts uses these ranges to find *where a setting
// sits within its own grinder's typical range for a method* and maps that
// relative position onto the target grinder's typical range for the same
// method. Always a starting point, never a promise — every estimate is
// labeled "справочно, откалибруйте по вкусу" in the UI.
//
// A model/method combination that isn't realistic for that grinder (e.g.
// espresso on a filter-only Fellow Ode) is deliberately left out rather
// than filled with a guess — lib/utils/grindConvert.ts treats a missing
// entry as "hide the hint," not "assume zero."

export interface GrindRangeRef {
  min: number;
  max: number;
  unit: string;
}

type GrindReferenceTable = Record<string, Partial<Record<BrewingMethodId, GrindRangeRef>>>;

export const GRIND_REFERENCE_TABLE: GrindReferenceTable = {
  // Home grinders
  'Comandante C40': {
    espresso: { min: 5, max: 12, unit: 'клик' },
    aeropress: { min: 12, max: 20, unit: 'клик' },
    v60: { min: 20, max: 26, unit: 'клик' },
    chemex: { min: 24, max: 30, unit: 'клик' },
    batch_brew: { min: 22, max: 28, unit: 'клик' },
    cupping: { min: 24, max: 30, unit: 'клик' },
  },
  'Timemore C2/C3': {
    espresso: { min: 8, max: 14, unit: 'деление' },
    aeropress: { min: 14, max: 18, unit: 'деление' },
    v60: { min: 18, max: 22, unit: 'деление' },
    chemex: { min: 20, max: 24, unit: 'деление' },
    batch_brew: { min: 20, max: 24, unit: 'деление' },
  },
  '1Zpresso J-Max': {
    espresso: { min: 10, max: 25, unit: 'клик' },
    aeropress: { min: 25, max: 45, unit: 'клик' },
    v60: { min: 55, max: 70, unit: 'клик' },
    chemex: { min: 65, max: 80, unit: 'клик' },
    batch_brew: { min: 60, max: 75, unit: 'клик' },
  },
  'Baratza Encore/Sette': {
    // Bundled option covers two different scales in real life (filter-only
    // Encore vs. espresso-focused Sette) — only the filter range is
    // reasonably honest to publish here, so espresso is left out.
    aeropress: { min: 15, max: 20, unit: 'деление' },
    v60: { min: 20, max: 26, unit: 'деление' },
    chemex: { min: 24, max: 30, unit: 'деление' },
    batch_brew: { min: 22, max: 28, unit: 'деление' },
  },
  'Fellow Ode': {
    aeropress: { min: 3, max: 5, unit: 'деление' },
    v60: { min: 5, max: 7, unit: 'деление' },
    chemex: { min: 6, max: 8, unit: 'деление' },
    batch_brew: { min: 6, max: 8, unit: 'деление' },
    cupping: { min: 6, max: 8, unit: 'деление' },
  },
  DF64: {
    espresso: { min: 5, max: 15, unit: 'деление' },
    aeropress: { min: 18, max: 25, unit: 'деление' },
  },

  // Pro / commercial grinders
  'Mahlkönig EK43': {
    v60: { min: 6.5, max: 7.5, unit: 'дел. диска' },
    chemex: { min: 7.5, max: 8.5, unit: 'дел. диска' },
    batch_brew: { min: 7, max: 8, unit: 'дел. диска' },
    cupping: { min: 7, max: 8, unit: 'дел. диска' },
  },
  'Mahlkönig Peak': {
    espresso: { min: 20, max: 35, unit: 'дел.' },
    v60: { min: 55, max: 65, unit: 'дел.' },
    chemex: { min: 60, max: 70, unit: 'дел.' },
    batch_brew: { min: 55, max: 65, unit: 'дел.' },
    cupping: { min: 58, max: 68, unit: 'дел.' },
  },
  'Ditting KR804': {
    v60: { min: 4.5, max: 5.5, unit: 'дел.' },
    chemex: { min: 4.5, max: 5.5, unit: 'дел.' },
    batch_brew: { min: 4, max: 5, unit: 'дел.' },
    cupping: { min: 4, max: 5, unit: 'дел.' },
  },
  'Mythos One': {
    espresso: { min: 3.5, max: 5.5, unit: 'дел.' },
  },
  'Compak E10': {
    espresso: { min: 15, max: 25, unit: 'дел.' },
  },
};
