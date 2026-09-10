'use client';

import { useEffect, useMemo, useState } from 'react';
import { FLAVOR_AXES, type Lot, type RoasterFlavorProfile, type TastingRecord } from '@/lib/types/coffee';
import { getReferenceTasteProfileById } from '@/lib/data/canonicalLotStore';
import { compareDescriptors, getGuestDescriptorWords } from '@/lib/journey/tasteDescriptors';
import { StarRating } from './StarRating';
import { FlavorRadar } from './FlavorRadar';
import { PossibleInfluences } from './PossibleInfluences';

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

// Contextual Taste (COFFEE_PASSPORT_CONTEXTUAL_TASTE_UX.md) — this
// component used to open with a scored diff table (+N/-N, "совпадение")
// comparing only four abstract numeric axes, with the guest's own rating
// sat directly beside the roaster's Q-Score as if the two were the same
// kind of number. Neither guest descriptor words nor the roaster's
// declared descriptor list were ever shown here at all. Restructured
// around the actual words each side used — see §7 of that document for
// why "shared/different" beats a scored table on UX clarity, not looks.
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
  const [detailsExpanded, setDetailsExpanded] = useState(false);

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

  // Lot.descriptors is a live, roaster-editable field (no version history,
  // unlike reference_taste_profiles) — see the module comment above and
  // COFFEE_PASSPORT_CONTEXTUAL_TASTE_UX.md's disclosed limitation: this is
  // always "the profile as currently declared," not a frozen historical
  // snapshot of what it said the day this tasting was recorded.
  const comparison = useMemo(
    () => compareDescriptors(getGuestDescriptorWords(tasting.sensoryTags, tasting.subDescriptors), lot.descriptors),
    [tasting.sensoryTags, tasting.subDescriptors, lot.descriptors]
  );
  const hasDifference = comparison.guestOnly.length > 0 || comparison.referenceOnly.length > 0;
  const hasAnyDescriptors = comparison.guestDescriptors.length > 0 || comparison.referenceDescriptors.length > 0;

  return (
    <div
      className={`rounded-md border border-ink-200 bg-parchment-100 p-5 ${animate ? 'reveal-fade' : ''}`}
    >
      <p className="section-label mb-1">Ваше восприятие и профиль лота</p>
      <p className="text-xs text-ink-400 mb-5">Это не экзамен на правильный вкус.</p>

      <div className="mb-5">
        <p className="text-xs text-ink-400 mb-1.5">Насколько понравилась чашка?</p>
        <StarRating value={tasting.rating} label={`Ваша оценка ${tasting.rating} из 5`} />
      </div>

      {hasAnyDescriptors ? (
        <div className="mb-2">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs text-ink-400 mb-1.5">Ты почувствовал</p>
              <p className="text-sm text-ink-900 leading-relaxed">
                {comparison.guestDescriptors.length > 0 ? comparison.guestDescriptors.join(' · ') : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-400 mb-1.5">Профиль лота (текущий)</p>
              <p className="text-sm text-ink-900 leading-relaxed">
                {comparison.referenceDescriptors.length > 0 ? comparison.referenceDescriptors.join(' · ') : '—'}
              </p>
            </div>
          </div>

          {comparison.referenceDescriptors.length === 0 ? (
            <p className="text-xs text-ink-500">
              Обжарщик пока не указал дескрипторы вкуса для этого лота — сравнивать пока не с чем,
              но ваше собственное впечатление уже сохранено.
            </p>
          ) : (
            <>
              {comparison.shared.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-ink-400 mb-1">Совпало</p>
                  <p className="text-sm text-ink-900">{comparison.shared.join(' · ')}</p>
                </div>
              )}

              {hasDifference && (
                <div className="mb-3">
                  <p className="text-xs text-ink-400 mb-1">По-разному</p>
                  <p className="text-sm text-ink-700">
                    {[...comparison.guestOnly, ...comparison.referenceOnly].join(' · ')}
                  </p>
                </div>
              )}

              {!hasDifference && comparison.shared.length > 0 && (
                <p className="text-xs text-ink-500">
                  Ваше восприятие совпало с профилем лота — это тоже одна из историй, не «правильный
                  ответ».
                </p>
              )}

              {comparison.shared.length === 0 && hasDifference && (
                <p className="text-xs text-ink-500">
                  Слова разошлись полностью — и это нормально: даже один и тот же кофе раскрывается
                  по-разному.
                </p>
              )}

              {hasDifference && <PossibleInfluences />}
            </>
          )}
        </div>
      ) : (
        <p className="text-xs text-ink-500 mb-2">
          Вы сосредоточились на числовых ощущениях, а не на конкретных дескрипторах — это тоже
          валидный способ пробовать.
        </p>
      )}

      <div className="mt-5 border-t border-ink-200 pt-4">
        <button
          type="button"
          onClick={() => setDetailsExpanded((value) => !value)}
          aria-expanded={detailsExpanded}
          className="flex w-full items-center justify-between text-left text-xs text-ink-500 hover:text-ink-900 transition-colors"
        >
          <span>Подробнее о восприятии</span>
          <span aria-hidden="true" className="text-ink-300">
            {detailsExpanded ? '−' : '+'}
          </span>
        </button>

        {detailsExpanded && (
          <div className="mt-4">
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
                    <th className="text-left font-normal pb-2">Ось восприятия</th>
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
        )}
      </div>
    </div>
  );
}
