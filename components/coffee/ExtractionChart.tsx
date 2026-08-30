import type { BrewingMethodId } from '@/lib/types/coffee';
import { getControlChartBand } from '@/lib/utils/extraction';

// Inline responsive SVG — same no-chart-library convention as
// RoastCurveChart.tsx. Plots one or more (Extraction Yield %, Strength %)
// points against the classic SCA brewing control chart, with the "ideal"
// band shaded — a reference range, not a strict standard, per the caption
// shown alongside this chart in RecipeCard.
const WIDTH = 340;
const HEIGHT = 260;
const PAD_LEFT = 40;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 30;

export interface ExtractionPoint {
  label: string;
  extractionYieldPercent: number;
  strengthPercent: number;
  color: string;
}

export function ExtractionChart({
  brewingMethodId,
  points,
}: {
  brewingMethodId: BrewingMethodId;
  points: ExtractionPoint[];
}) {
  const band = getControlChartBand(brewingMethodId);
  const innerWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const x = (ey: number) => PAD_LEFT + ((ey - band.eyMin) / (band.eyMax - band.eyMin)) * innerWidth;
  const y = (strength: number) =>
    PAD_TOP + innerHeight - ((strength - band.strengthMin) / (band.strengthMax - band.strengthMin)) * innerHeight;

  const idealX = x(band.idealEyMin);
  const idealWidth = x(band.idealEyMax) - idealX;
  const idealY = y(band.idealStrengthMax);
  const idealHeight = y(band.idealStrengthMin) - idealY;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label="График экстракции: крепость к проценту экстракции">
        <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={PAD_TOP + innerHeight} stroke="#C7B9A6" strokeWidth={1} />
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP + innerHeight}
          x2={WIDTH - PAD_RIGHT}
          y2={PAD_TOP + innerHeight}
          stroke="#C7B9A6"
          strokeWidth={1}
        />

        <rect x={idealX} y={idealY} width={idealWidth} height={idealHeight} fill="#5C6B4F" opacity={0.15} />
        <rect x={idealX} y={idealY} width={idealWidth} height={idealHeight} fill="none" stroke="#5C6B4F" strokeWidth={1} strokeDasharray="3 3" />

        {points.map((point) => (
          <circle
            key={point.label}
            cx={x(point.extractionYieldPercent)}
            cy={y(point.strengthPercent)}
            r={5}
            fill={point.color}
            stroke="#1C1410"
            strokeWidth={1}
          />
        ))}

        <text
          x={PAD_LEFT}
          y={HEIGHT - PAD_BOTTOM + 14}
          fontSize={9}
          fill="#6E5C48"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {band.eyMin}%
        </text>
        <text
          x={WIDTH - PAD_RIGHT}
          y={HEIGHT - PAD_BOTTOM + 14}
          textAnchor="end"
          fontSize={9}
          fill="#6E5C48"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {band.eyMax}%
        </text>
        <text x={PAD_LEFT + innerWidth / 2} y={HEIGHT - 4} textAnchor="middle" fontSize={9} fill="#6E5C48">
          Экстракция, EY%
        </text>

        <text x={2} y={PAD_TOP + 8} fontSize={9} fill="#6E5C48" style={{ fontFamily: 'var(--font-mono)' }}>
          {band.strengthMax}%
        </text>
        <text x={2} y={PAD_TOP + innerHeight} fontSize={9} fill="#6E5C48" style={{ fontFamily: 'var(--font-mono)' }}>
          {band.strengthMin}%
        </text>
      </svg>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-[11px] text-ink-400">
        {points.map((point) => (
          <span key={point.label} className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: point.color }} />
            {point.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm border border-dashed border-moss-500 bg-moss-100" />
          Ориентировочная «идеальная» зона
        </span>
      </div>
    </div>
  );
}
