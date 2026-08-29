import type { TastingRecord } from '@/lib/types/coffee';
import { computeFavoriteProcesses, computeFavoriteRegions, computeTasteProfile } from '@/lib/utils/tasteProfile';
import { FlavorRadar } from './FlavorRadar';

// "Вкусовой Паспорт" — the enthusiast journal's own profile-card summary of
// how this person tastes: averaged acidity/sweetness/body/bitterness from
// their highly-rated cups, plus the regions and processing methods they
// keep coming back to. Mirrors the server-side aggregate in
// public.users.taste_profile / favorite_regions / favorite_processes (see
// supabase/migrations/0004_taste_profile.sql), computed client-side for now
// since the journal isn't wired to Supabase yet.
export function TastePassportCard({ records }: { records: TastingRecord[] }) {
  const profile = computeTasteProfile(records);
  const regions = computeFavoriteRegions(records);
  const processes = computeFavoriteProcesses(records);

  if (profile.sampleSize === 0) return null;

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5 reveal-fade">
      <p className="section-label mb-1">Вкусовой Паспорт</p>
      <p className="text-xs text-ink-400 mb-5">
        По {profile.sampleSize} дегустациям с оценкой 4★ и выше
      </p>

      <FlavorRadar
        series={[
          {
            label: 'Ваш вкус',
            color: 'var(--color-rating)',
            values: [profile.acidity, profile.sweetness, profile.body, profile.bitterness],
          },
        ]}
      />

      <div className="flex flex-col gap-1.5 mt-4 mb-5">
        {(
          [
            ['Кислотность', profile.acidity],
            ['Сладость', profile.sweetness],
            ['Плотность', profile.body],
            ['Горечь', profile.bitterness],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-xs">
            <span className="text-ink-700">{label}</span>
            <span className="data-value text-ink-400">{value.toFixed(1)}/5</span>
          </div>
        ))}
      </div>

      {regions.length > 0 && (
        <div className="mb-4">
          <p className="section-label mb-2">Топ регионов</p>
          <ul className="flex flex-wrap gap-1.5">
            {regions.map((region) => (
              <li
                key={region.label}
                className="rounded-full border border-ink-200 bg-parchment-200 px-2.5 py-1
                           text-[11px] text-ink-700"
              >
                {region.label} · {region.count}
              </li>
            ))}
          </ul>
        </div>
      )}

      {processes.length > 0 && (
        <div>
          <p className="section-label mb-2">Любимая обработка</p>
          <ul className="flex flex-wrap gap-1.5">
            {processes.map((process) => (
              <li
                key={process.label}
                className="rounded-full border border-gold-400 text-gold-500 px-2.5 py-1
                           text-[11px] uppercase tracking-widest2"
              >
                {process.label} · {process.count}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
