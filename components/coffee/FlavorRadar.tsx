import { FLAVOR_AXES } from '@/lib/types/coffee';

export interface RadarSeries {
  label: string;
  color: string; // any valid CSS color, incl. var(--color-*)
  values: number[]; // one per FLAVOR_AXES entry, 0-5, same order
}

const LEVELS = [1, 2, 3, 4, 5];

// Short forms so the two longest axis labels don't clip the viewBox at
// small chart sizes — the full words are still used everywhere else
// (numeric breakdowns, form labels).
const RADAR_LABELS: Record<string, string> = {
  acidity: 'Кислотн.',
  sweetness: 'Сладость',
  body: 'Плотн.',
  bitterness: 'Горечь',
};

// A small spider/radar chart for comparing two (or more) flavor profiles at
// a glance — used both for a single guest vs. the roaster's reference
// (TasteComparison) and for a shop's averaged guest read vs. that same
// reference (roaster dashboard analytics), so the two views read as the
// same visual language.
export function FlavorRadar({ series, size = 200 }: { series: RadarSeries[]; size?: number }) {
  const center = size / 2;
  const maxRadius = size * 0.28;
  const axisCount = FLAVOR_AXES.length;

  function pointFor(axisIndex: number, value: number): [number, number] {
    const angle = -Math.PI / 2 + (axisIndex * (Math.PI * 2)) / axisCount;
    const radius = (Math.max(0, Math.min(5, value)) / 5) * maxRadius;
    return [center + radius * Math.cos(angle), center + radius * Math.sin(angle)];
  }

  function ringPoints(level: number): string {
    return FLAVOR_AXES.map((_, i) => pointFor(i, level).join(',')).join(' ');
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full max-w-[220px] mx-auto"
      role="img"
      aria-label={`Радар вкуса: ${series.map((s) => s.label).join(' и ')}`}
    >
      {LEVELS.map((level) => (
        <polygon
          key={level}
          points={ringPoints(level)}
          fill="none"
          stroke="var(--color-ink-200)"
          strokeWidth={level === 5 ? 1 : 0.5}
        />
      ))}

      {FLAVOR_AXES.map((axis, i) => {
        const [x, y] = pointFor(i, 5);
        return (
          <line
            key={axis.key}
            x1={center}
            y1={center}
            x2={x}
            y2={y}
            stroke="var(--color-ink-200)"
            strokeWidth={0.5}
          />
        );
      })}

      {series.map((s) => (
        <polygon
          key={s.label}
          points={s.values.map((v, i) => pointFor(i, v).join(',')).join(' ')}
          fill={s.color}
          fillOpacity={0.16}
          stroke={s.color}
          strokeWidth={1.5}
        />
      ))}

      {FLAVOR_AXES.map((axis, i) => {
        const [x, y] = pointFor(i, 6);
        return (
          <text
            key={axis.key}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={8}
            fill="var(--color-ink-400)"
          >
            {RADAR_LABELS[axis.key] ?? axis.label}
          </text>
        );
      })}
    </svg>
  );
}
