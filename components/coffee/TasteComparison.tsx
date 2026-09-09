'use client';

import { useEffect, useState } from 'react';
import { FLAVOR_AXES, type Lot, type RoasterFlavorProfile, type TastingRecord } from '@/lib/types/coffee';
import { getReferenceTasteProfileById } from '@/lib/data/canonicalLotStore';
import { StarRating } from './StarRating';
import { FlavorRadar } from './FlavorRadar';

// TASTE_INTENT_HISTORICAL_LINK_IMPLEMENTATION.md — mirrors the Public
// Passport's own roast-intent pattern (app/(site)/passport/[lotId]/page.tsx):
// prefer the EXACT version this tasting was recorded against, over
// "whatever is active now." Pulled out as its own function (rather than
// inlined in the effect below) so the version-selection rule itself — not
// React's effect plumbing — is what gets unit tested. A tasting with no
// linked reference yet (recorded before this shipped, or claimed before its
// own async lookup resolved), or whose linked version fails to resolve,
// falls through to `fallback` (the lot's current active profile) exactly as
// every tasting behaved before this existed.
export async function resolveComparisonRoasterProfile(
  tasting: Pick<TastingRecord, 'referenceTasteProfileId'>,
  fallback: RoasterFlavorProfile,
  fetchById: (id: string) => Promise<RoasterFlavorProfile | null> = getReferenceTasteProfileById
): Promise<RoasterFlavorProfile> {
  const linkedId = tasting.referenceTasteProfileId ?? null;
  if (!linkedId) return fallback;
  const profile = await fetchById(linkedId);
  return profile ?? fallback;
}

export function TasteComparison({
  lot,
  tasting,
  animate = false,
}: {
  lot: Lot;
  tasting: TastingRecord;
  animate?: boolean;
}) {
  const [roasterProfile, setRoasterProfile] = useState<RoasterFlavorProfile>(lot.roasterFlavorProfile);

  useEffect(() => {
    let cancelled = false;
    resolveComparisonRoasterProfile(tasting, lot.roasterFlavorProfile).then((profile) => {
      if (!cancelled) setRoasterProfile(profile);
    });
    return () => {
      cancelled = true;
    };
  }, [tasting.referenceTasteProfileId, lot.roasterFlavorProfile]);

  const guestValues = FLAVOR_AXES.map(({ key }) => tasting.guestFlavorProfile[key]);
  const roasterValues = FLAVOR_AXES.map(({ key }) => roasterProfile[key]);

  return (
    <div
      className={`rounded-md border border-ink-200 bg-parchment-100 p-5 ${animate ? 'reveal-fade' : ''}`}
    >
      <p className="section-label mb-1">Ваши ощущения vs Задумка обжарщика</p>
      <p className="text-xs text-ink-400 mb-5">
        Сравнение вашей слепой оценки с эталонным профилем
      </p>

      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-ink-400 mb-1.5">Ваша оценка чашки</p>
          <StarRating value={tasting.rating} label={`Ваша оценка ${tasting.rating} из 5`} />
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-400 mb-1.5">Q-Score обжарщика</p>
          <span className="data-value text-lg text-gold-500">{lot.qGrade.toFixed(1)}</span>
        </div>
      </div>

      <FlavorRadar
        series={[
          { label: 'Вы', color: 'var(--color-rating)', values: guestValues },
          { label: 'Обжарщик', color: 'var(--color-gold-500)', values: roasterValues },
        ]}
      />

      <div className="flex items-center justify-center gap-4 mt-2 mb-5 text-xs text-ink-500">
        <span className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: 'var(--color-rating)' }}
          />
          Вы
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-gold-500 shrink-0" />
          Обжарщик
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-ink-400">
              <th className="text-left font-normal pb-2">Дескриптор</th>
              <th className="text-right font-normal pb-2">Эталон обжарщика</th>
              <th className="text-right font-normal pb-2">Ваша оценка</th>
              <th className="text-right font-normal pb-2">Разница</th>
            </tr>
          </thead>
          <tbody>
            {FLAVOR_AXES.map(({ key, label }, i) => {
              const diff = guestValues[i] - roasterValues[i];
              return (
                <tr key={key} className="border-t border-ink-200">
                  <td className="py-2 text-ink-700">{label}</td>
                  <td className="py-2 text-right data-value text-ink-900">{roasterValues[i]}/5</td>
                  <td className="py-2 text-right data-value text-ink-900">{guestValues[i]}/5</td>
                  <td
                    className={`py-2 text-right data-value ${
                      diff === 0 ? 'text-ink-400' : diff > 0 ? 'text-ink-900 font-medium' : 'text-ink-500'
                    }`}
                  >
                    {diff === 0 ? 'совпадение' : diff > 0 ? `+${diff}` : diff}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
