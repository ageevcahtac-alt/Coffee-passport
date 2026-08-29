'use client';

import { useMemo, useState } from 'react';
import type { RoasterFlavorProfile, TastingRecord } from '@/lib/types/coffee';
import {
  computeFavoriteProcesses,
  computeFavoriteRegions,
  computeTasteProfile,
  tasteMatchPercent,
} from '@/lib/utils/tasteProfile';
import { FlavorRadar } from './FlavorRadar';

// Collapsed-by-default "Вкусовой профиль гостя" widget for the B2B side —
// dropped next to one guest review (components/cafe/GuestFeedback.tsx,
// components/roaster/LotGuestAnalytics.tsx) so a partner can see this
// guest's overall taste leanings, not just the one cup being reviewed, and
// whether the lot in front of them matches those leanings.
export function GuestTasteProfileWidget({
  guestUserId,
  allRecords,
  currentLotProfile,
}: {
  guestUserId: string;
  allRecords: TastingRecord[];
  currentLotProfile?: RoasterFlavorProfile;
}) {
  const [open, setOpen] = useState(false);

  const guestRecords = useMemo(
    () => allRecords.filter((record) => record.userId === guestUserId),
    [allRecords, guestUserId]
  );

  const profile = useMemo(() => computeTasteProfile(guestRecords), [guestRecords]);
  const regions = useMemo(() => computeFavoriteRegions(guestRecords, 3), [guestRecords]);
  const processes = useMemo(() => computeFavoriteProcesses(guestRecords, 3), [guestRecords]);

  const match = currentLotProfile ? tasteMatchPercent(profile, currentLotProfile) : null;

  return (
    <div className="mt-3 pt-3 border-t border-ink-100">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="text-xs text-ink-500 underline underline-offset-2">
          Вкусовой профиль гостя
        </span>
        {match !== null && (
          <span
            className={`data-value text-[11px] shrink-0 ml-3 ${
              match >= 70 ? 'text-gold-500' : 'text-ink-400'
            }`}
          >
            Совпадение с лотом: {match}%
          </span>
        )}
      </button>

      {open && (
        <div className="mt-3">
          {profile.sampleSize === 0 ? (
            <p className="text-xs text-ink-400">
              Пока недостаточно высоко оценённых дегустаций для профиля.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-4 mb-3">
                <FlavorRadar
                  size={140}
                  series={[
                    { label: 'Гость', color: 'var(--color-rating)', values: [profile.acidity, profile.sweetness, profile.body, profile.bitterness] },
                    ...(currentLotProfile
                      ? [
                          {
                            label: 'Этот лот',
                            color: 'var(--color-gold-500)',
                            values: [
                              currentLotProfile.acidity,
                              currentLotProfile.sweetness,
                              currentLotProfile.body,
                              currentLotProfile.bitterness,
                            ],
                          },
                        ]
                      : []),
                  ]}
                />
                <p className="text-[11px] text-ink-400 flex-1">
                  На основе {profile.sampleSize} высоко оценённых дегустаций
                </p>
              </div>

              {regions.length > 0 && (
                <div className="mb-2">
                  <p className="text-[11px] uppercase tracking-widest2 text-ink-400 mb-1.5">
                    Топ регионов
                  </p>
                  <p className="text-xs text-ink-700">
                    {regions.map((r) => `${r.label} (${r.count})`).join(' · ')}
                  </p>
                </div>
              )}

              {processes.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-widest2 text-ink-400 mb-1.5">
                    Любимая обработка
                  </p>
                  <p className="text-xs text-ink-700">
                    {processes.map((p) => `${p.label} (${p.count})`).join(' · ')}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
