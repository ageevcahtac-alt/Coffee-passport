import { describe, expect, it } from 'vitest';
import { clampPointToBand, computeExtraction, getControlChartBand } from './extraction';

// Extraction Dial-In Assistant (PRODUCT_BACKLOG #1) — the calc core shipped
// in 98bfb8e without tests; these pin it: the SCA control-chart formula,
// its null edges, the per-method bands, and the out-of-range clamp that
// keeps a mistyped TDS dot on the chart instead of outside the axes.

describe('computeExtraction', () => {
  // EY% = (TDS% × Yield_g) / Dose_g; strength is the TDS reading itself.
  it('computes extraction yield and strength with the standard formula', () => {
    // 15 g dose, 250 g yield, 1.32% TDS → EY 22.0%, strength 1.32%.
    expect(computeExtraction({ doseG: 15, yieldG: 250, tdsPercent: 1.32 })).toEqual({
      extractionYieldPercent: 22,
      strengthPercent: 1.32,
    });
  });

  it('rounds the yield to two decimals, keeping strength as measured', () => {
    const result = computeExtraction({ doseG: 18, yieldG: 300, tdsPercent: 1.23 });
    // (1.23 × 300) / 18 = 20.5 exactly.
    expect(result).toEqual({ extractionYieldPercent: 20.5, strengthPercent: 1.23 });
    const recurring = computeExtraction({ doseG: 16, yieldG: 240, tdsPercent: 1.31 });
    // 19.65 exactly — and a non-terminating case rounds, not truncates:
    const fuzzy = computeExtraction({ doseG: 17, yieldG: 251, tdsPercent: 1.27 });
    expect((1.27 * 251) / 17).not.toBe(Math.round(((1.27 * 251) / 17) * 100) / 100);
    expect(fuzzy?.extractionYieldPercent).toBe(Math.round(((1.27 * 251) / 17) * 100) / 100);
    expect(recurring?.extractionYieldPercent).toBe(19.65);
  });

  it.each([
    { doseG: 0, yieldG: 250, tdsPercent: 1.32 },
    { doseG: 15, yieldG: 0, tdsPercent: 1.32 },
    { doseG: 15, yieldG: 250, tdsPercent: 0 },
    { doseG: -15, yieldG: 250, tdsPercent: 1.32 },
    { doseG: 15, yieldG: 250, tdsPercent: -1.32 },
    { doseG: Number.NaN, yieldG: 250, tdsPercent: 1.32 },
    { doseG: 15, yieldG: Number.POSITIVE_INFINITY, tdsPercent: 1.32 },
  ])('returns null for meaningless input %o instead of a garbage chart point', (input) => {
    expect(computeExtraction(input)).toBeNull();
  });
});

describe('getControlChartBand', () => {
  it('gives filter methods the classic gold-cup band (18–22% EY, 1.15–1.35% strength)', () => {
    const band = getControlChartBand('v60');
    expect(band).toEqual({
      eyMin: 14,
      eyMax: 26,
      idealEyMin: 18,
      idealEyMax: 22,
      strengthMin: 0.8,
      strengthMax: 1.6,
      idealStrengthMin: 1.15,
      idealStrengthMax: 1.35,
    });
  });

  it('gives espresso its own strength scale (8–12% ideal, 4–14% visible)', () => {
    const band = getControlChartBand('espresso');
    expect(band).toMatchObject({
      idealEyMin: 18,
      idealEyMax: 22,
      strengthMin: 4,
      strengthMax: 14,
      idealStrengthMin: 8,
      idealStrengthMax: 12,
    });
  });

  it('falls back to the filter band for unknown methods rather than guessing', () => {
    // AeroPress/siphon and any future method id share the filter reference
    // by design (see the comment on getControlChartBand).
    expect(getControlChartBand('aeropress')).toEqual(getControlChartBand('v60'));
    expect(getControlChartBand('custom-method-42')).toEqual(getControlChartBand('v60'));
  });

  it('returns independent objects so mutating one band never leaks into the next call', () => {
    const first = getControlChartBand('v60');
    first.idealEyMax = 99;
    expect(getControlChartBand('v60').idealEyMax).toBe(22);
  });
});

describe('clampPointToBand', () => {
  const band = getControlChartBand('v60');

  it('passes in-range points through untouched, including the exact edges', () => {
    const inside = { extractionYieldPercent: 20, strengthPercent: 1.25 };
    expect(clampPointToBand(inside, band)).toEqual(inside);
    const onEdge = { extractionYieldPercent: 14, strengthPercent: 1.6 };
    expect(clampPointToBand(onEdge, band)).toEqual(onEdge);
  });

  it('pins a too-strong cup to the top edge instead of drawing outside the axes', () => {
    // A mistyped 3% TDS on the filter chart.
    expect(clampPointToBand({ extractionYieldPercent: 20, strengthPercent: 3 }, band)).toEqual({
      extractionYieldPercent: 20,
      strengthPercent: 1.6,
    });
  });

  it('pins under-extracted and over-extracted points to the x-range edges', () => {
    expect(clampPointToBand({ extractionYieldPercent: 8, strengthPercent: 1.2 }, band).extractionYieldPercent).toBe(14);
    expect(clampPointToBand({ extractionYieldPercent: 31, strengthPercent: 1.2 }, band).extractionYieldPercent).toBe(26);
  });

  it('respects the espresso band’s own scale', () => {
    const espressoBand = getControlChartBand('espresso');
    expect(clampPointToBand({ extractionYieldPercent: 20, strengthPercent: 2 }, espressoBand).strengthPercent).toBe(4);
    expect(clampPointToBand({ extractionYieldPercent: 20, strengthPercent: 16 }, espressoBand).strengthPercent).toBe(14);
  });
});
