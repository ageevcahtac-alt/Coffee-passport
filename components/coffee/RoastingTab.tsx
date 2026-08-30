'use client';

import type { Lot } from '@/lib/types/coffee';
import { useRoastProfiles } from '@/lib/data/useRoastProfiles';
import { RoastCurveChart } from './RoastCurveChart';

// Read view for the Lot Card — see components/roaster/RoastProfileForm.tsx
// for the roaster-only create/edit flow that populates this.
export function RoastingTab({ lot }: { lot: Lot }) {
  const profiles = useRoastProfiles()
    .filter((profile) => profile.lotId === lot.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (profiles.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-ink-200 bg-parchment-100 p-5 text-center">
        <p className="text-sm text-ink-500">Обжарщик ещё не опубликовал профиль обжарки для этого лота.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {profiles.map((profile) => (
        <div key={profile.id} className="rounded-md border border-ink-200 bg-parchment-100 p-5">
          <RoastCurveChart
            points={profile.curve}
            chargeTemp={profile.chargeTemp}
            dropTemp={profile.dropTemp}
            firstCrackTimeSec={profile.firstCrackTimeSec}
            totalTimeSec={profile.totalTimeSec}
          />

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 mt-5 text-sm">
            <MetricRow label="Charge" value={`${profile.chargeTemp}°C`} />
            <MetricRow label="Drop" value={`${profile.dropTemp}°C`} />
            <MetricRow label="Общее время" value={formatDuration(profile.totalTimeSec)} />
            <MetricRow label="DTR" value={profile.dtrPercent !== null ? `${profile.dtrPercent.toFixed(1)}%` : '—'} />
          </dl>

          <p className="text-xs text-ink-400 mt-4">
            Машина: <span className="data-value text-ink-700">{profile.machineModel || '—'}</span>
          </p>

          {profile.notes && <p className="text-sm text-ink-700 mt-3 leading-relaxed">{profile.notes}</p>}
        </div>
      ))}
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

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
