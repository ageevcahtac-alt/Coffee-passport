import { ROAST_TYPE_LABELS, type Lot, type Roaster, type RoastProfile } from '@/lib/types/coffee';

// Guest-facing "Профиль обжарки" card — a friendlier, marketing-style
// summary of the roaster's REFERENCE/target profile for this lot, distinct
// from RoastingTab's technical BT/ET/RoR log chart (real logged data,
// still shown further down the page for anyone who wants it). Deliberately
// shows no dates or batch numbers anywhere — RoastProfile.createdAt is
// never read here, and the curve below plots shape only (0-100% of roast
// duration), never a clock or calendar.
export function RoastProfileSummaryCard({
  lot,
  roaster,
  profile,
}: {
  lot: Lot;
  roaster: Roaster;
  profile: RoastProfile | null;
}) {
  if (!profile) return null;

  return (
    <div className="rounded-md border border-gold-400/50 bg-parchment-100 p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs uppercase tracking-widest2 text-ink-400 mb-1">{roaster.name}</p>
          <h2 className="font-display text-lg text-ink-900 leading-tight">Профиль обжарки</h2>
        </div>
        <span
          className="shrink-0 rounded-full border border-gold-400 text-gold-500 text-[11px]
                     uppercase tracking-widest2 px-2.5 py-1"
        >
          {ROAST_TYPE_LABELS[lot.roastType]}
        </span>
      </div>

      <TargetCurve chargeTemp={profile.chargeTemp} dropTemp={profile.dropTemp} />

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm mt-5 mb-5">
        <MetricRow label="DTR" value={profile.dtrPercent !== null ? `${profile.dtrPercent.toFixed(1)}%` : '—'} />
        <MetricRow
          label="Степень (Agtron)"
          value={profile.agtronNumber !== null ? String(profile.agtronNumber) : '—'}
        />
      </div>

      {profile.agtronNumber !== null && <AgtronGauge value={profile.agtronNumber} />}

      {profile.notes && (
        <p className="text-sm text-ink-700 leading-relaxed mt-5 pt-5 border-t border-ink-100">{profile.notes}</p>
      )}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-400">{label}</dt>
      <dd className="data-value text-ink-900">{value}</dd>
    </div>
  );
}

const AGTRON_MIN = 25; // darkest specialty roasts
const AGTRON_MAX = 95; // lightest / near-unroasted reference end

function AgtronGauge({ value }: { value: number }) {
  const clamped = Math.max(AGTRON_MIN, Math.min(AGTRON_MAX, value));
  const percent = ((clamped - AGTRON_MIN) / (AGTRON_MAX - AGTRON_MIN)) * 100;

  return (
    <div>
      <div
        className="relative h-3 rounded-full"
        style={{ background: 'linear-gradient(90deg, #3B2415 0%, #7A5330 40%, #B8863B 70%, #E4C596 100%)' }}
        role="meter"
        aria-label="Степень обжарки по шкале Agtron"
        aria-valuemin={AGTRON_MIN}
        aria-valuemax={AGTRON_MAX}
        aria-valuenow={clamped}
      >
        <span
          className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-parchment-100 border-2 border-ink-900 shadow"
          style={{ left: `${percent}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-ink-400 mt-1.5">
        <span>Тёмная</span>
        <span>Светлая</span>
      </div>
    </div>
  );
}

// A single smooth reference curve — the "shape" of the target roast, not a
// timed log: x is 0-100% of total roast duration, y is interpolated
// between charge and drop temperature with a gentle peak-and-settle shape
// typical of a roast curve. Purely illustrative (no logged BT/ET points,
// no clock time) — RoastingTab below renders the real logged curve for
// lots that have one.
function TargetCurve({ chargeTemp, dropTemp }: { chargeTemp: number; dropTemp: number }) {
  const width = 400;
  const height = 120;
  const padX = 12;
  const padY = 16;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padY * 2;

  const minTemp = Math.min(chargeTemp, dropTemp) - 5;
  const maxTemp = Math.max(chargeTemp, dropTemp) + 5;
  const y = (temp: number) => padY + innerHeight - ((temp - minTemp) / (maxTemp - minTemp)) * innerHeight;
  const x = (percent: number) => padX + (percent / 100) * innerWidth;

  // Charge → a slightly-overshot developing phase → settles at drop, drawn
  // as one smooth cubic curve through four control percentages.
  const p0 = { x: x(0), y: y(chargeTemp) };
  const p1 = { x: x(35), y: y(chargeTemp + (dropTemp - chargeTemp) * 0.55) };
  const p2 = { x: x(70), y: y(dropTemp - (dropTemp - chargeTemp) * 0.05) };
  const p3 = { x: x(100), y: y(dropTemp) };

  const path = `M${p0.x},${p0.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Эталонная кривая обжарки">
      <defs>
        <linearGradient id="roast-target-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#B8863B" stopOpacity={0.25} />
          <stop offset="100%" stopColor="#B8863B" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${path} L${p3.x},${padY + innerHeight} L${p0.x},${padY + innerHeight} Z`} fill="url(#roast-target-fill)" />
      <path d={path} fill="none" stroke="#B8863B" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={p0.x} cy={p0.y} r={3.5} fill="#1C1410" />
      <circle cx={p3.x} cy={p3.y} r={3.5} fill="#1C1410" />
      <text x={p0.x} y={height - 2} fontSize={10} fill="#8A7A68">
        Charge
      </text>
      <text x={p3.x} y={height - 2} fontSize={10} fill="#8A7A68" textAnchor="end">
        Drop
      </text>
    </svg>
  );
}
