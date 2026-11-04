// The classic SCA "brewing control chart" math: Extraction Yield % is
// derived from dose, yield, and the brewed cup's TDS% (a refractometer
// reading) — not from the water's mineral TDS (see BrewingRecipe.waterTds
// vs. measuredTdsPercent in lib/types/coffee.ts, which are different
// metrics by two orders of magnitude and must never be conflated).
//
//   Extraction Yield % = (TDS% × Yield_g) / Dose_g
//
// "Strength" on the control chart is just the measured TDS% itself.

export interface ExtractionInput {
  doseG: number;
  yieldG: number;
  tdsPercent: number;
}

export interface ExtractionResult {
  extractionYieldPercent: number;
  strengthPercent: number;
}

export function computeExtraction({ doseG, yieldG, tdsPercent }: ExtractionInput): ExtractionResult | null {
  // Non-finite guard first: NaN fails every <= 0 check and Infinity passes
  // it, so a runtime-bad reading would otherwise plot a garbage point
  // (NaN/Infinity on the chart) — same defensive contract as
  // parseLeadingNumber in lib/utils/grindConvert.ts.
  if (!Number.isFinite(doseG) || !Number.isFinite(yieldG) || !Number.isFinite(tdsPercent)) return null;
  if (doseG <= 0 || yieldG <= 0 || tdsPercent <= 0) return null;
  const extractionYieldPercent = (tdsPercent * yieldG) / doseG;
  return {
    extractionYieldPercent: Math.round(extractionYieldPercent * 100) / 100,
    strengthPercent: tdsPercent,
  };
}

export interface ControlChartBand {
  eyMin: number;
  eyMax: number;
  idealEyMin: number;
  idealEyMax: number;
  strengthMin: number;
  strengthMax: number;
  idealStrengthMin: number;
  idealStrengthMax: number;
}

// Espresso runs at a much higher TDS% than filter/immersion methods (less
// water per gram of coffee), so it needs its own axis scale and ideal
// band. Every other brewing method shares the classic filter gold-cup
// target — a reasonable reference even for methods (AeroPress, siphon)
// that don't have their own official SCA chart.
export function getControlChartBand(brewingMethodId: string): ControlChartBand {
  if (brewingMethodId === 'espresso') {
    return {
      eyMin: 14,
      eyMax: 26,
      idealEyMin: 18,
      idealEyMax: 22,
      strengthMin: 4,
      strengthMax: 14,
      idealStrengthMin: 8,
      idealStrengthMax: 12,
    };
  }
  return {
    eyMin: 14,
    eyMax: 26,
    idealEyMin: 18,
    idealEyMax: 22,
    strengthMin: 0.8,
    strengthMax: 1.6,
    idealStrengthMin: 1.15,
    idealStrengthMax: 1.35,
  };
}

// Pins a point to the chart's visible range so a mistyped refractometer
// reading (e.g. 3% TDS on the filter chart) plots at the band's edge
// instead of outside the axes — the cup IS off the scale, and the reader
// should see that, not lose the dot. Values inside the range pass through
// untouched (including the exact edges).
export function clampPointToBand(point: ExtractionResult, band: ControlChartBand): ExtractionResult {
  return {
    extractionYieldPercent: Math.min(band.eyMax, Math.max(band.eyMin, point.extractionYieldPercent)),
    strengthPercent: Math.min(band.strengthMax, Math.max(band.strengthMin, point.strengthPercent)),
  };
}
