import type { RoastCurvePoint } from '@/lib/types/coffee';

// Inline responsive SVG — no chart library, matching the app's existing
// pure-SVG convention (see CoffeeBeltMap) and the DESIGN.md mono/hairline
// cupping-form aesthetic. Static (no hover JS): the key metrics are already
// shown as text alongside this chart in RoastingTab.
const WIDTH = 600;
const HEIGHT = 260;
const PAD_LEFT = 36;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 12;

export function RoastCurveChart({
  points,
  chargeTemp,
  dropTemp,
  firstCrackTimeSec,
  totalTimeSec,
}: {
  points: RoastCurvePoint[];
  chargeTemp: number;
  dropTemp: number;
  firstCrackTimeSec: number | null;
  totalTimeSec: number;
}) {
  if (points.length === 0) return null;

  const maxTime = Math.max(totalTimeSec, ...points.map((p) => p.timeSec), 1);
  const temps = points.flatMap((p) => [p.bt, p.et]).filter((v): v is number => v !== null);
  temps.push(chargeTemp, dropTemp);
  const minTemp = Math.min(...temps) - 10;
  const maxTemp = Math.max(Math.max(...temps) + 10, minTemp + 1);

  const rors = points.map((p) => p.ror).filter((v): v is number => v !== null);
  const maxRor = rors.length ? Math.max(...rors.map(Math.abs), 1) : 1;

  const innerWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const x = (timeSec: number) => PAD_LEFT + (timeSec / maxTime) * innerWidth;
  const yTemp = (temp: number) => PAD_TOP + innerHeight - ((temp - minTemp) / (maxTemp - minTemp)) * innerHeight;
  const yRor = (ror: number) => PAD_TOP + innerHeight - ((ror + maxRor) / (maxRor * 2)) * innerHeight;

  function pathFor(getValue: (p: RoastCurvePoint) => number | null, yFn: (v: number) => number) {
    const segments: string[] = [];
    let active = false;
    for (const point of points) {
      const value = getValue(point);
      if (value === null) {
        active = false;
        continue;
      }
      segments.push(`${active ? 'L' : 'M'}${x(point.timeSec).toFixed(1)},${yFn(value).toFixed(1)}`);
      active = true;
    }
    return segments.join(' ');
  }

  const btPath = pathFor((p) => p.bt, yTemp);
  const etPath = pathFor((p) => p.et, yTemp);
  const rorPath = pathFor((p) => p.ror, yRor);

  const dtrStartX = firstCrackTimeSec !== null ? x(firstCrackTimeSec) : null;
  const dtrEndX = x(maxTime);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label="Кривая обжарки: BT, ET, RoR">
        {dtrStartX !== null && (
          <rect
            x={dtrStartX}
            y={PAD_TOP}
            width={Math.max(0, dtrEndX - dtrStartX)}
            height={innerHeight}
            fill="#DCB97D"
            opacity={0.3}
          />
        )}

        <line
          x1={PAD_LEFT}
          y1={PAD_TOP + innerHeight}
          x2={WIDTH - PAD_RIGHT}
          y2={PAD_TOP + innerHeight}
          stroke="#C7B9A6"
          strokeWidth={1}
        />

        {etPath && <path d={etPath} fill="none" stroke="#6E5C48" strokeWidth={1.5} />}
        {rorPath && <path d={rorPath} fill="none" stroke="#5C6B4F" strokeWidth={1} strokeDasharray="4 3" opacity={0.8} />}
        {btPath && <path d={btPath} fill="none" stroke="#B8863B" strokeWidth={2} />}

        <circle cx={x(points[0]?.timeSec ?? 0)} cy={yTemp(chargeTemp)} r={3} fill="#1C1410" />
        <circle cx={x(maxTime)} cy={yTemp(dropTemp)} r={3} fill="#1C1410" />
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-ink-400">
        <LegendDot color="#B8863B" label="BT" />
        <LegendDot color="#6E5C48" label="ET" />
        <LegendDot color="#5C6B4F" label="RoR" dashed />
      </div>
    </div>
  );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-3 h-0"
        style={{ borderTop: dashed ? `2px dashed ${color}` : `2px solid ${color}` }}
      />
      {label}
    </span>
  );
}
