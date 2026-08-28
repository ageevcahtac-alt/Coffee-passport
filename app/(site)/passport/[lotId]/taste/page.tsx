'use client';

import { useEffect, useRef, useState } from 'react';
import { useLots } from '@/lib/data/useLots';
import { COFFEE_SHOPS } from '@/lib/data/coffeeShops';
import { getBaristasForShop } from '@/lib/data/baristas';
import type { BrewingMethodId, Lot } from '@/lib/types/coffee';
import { CoffeeShopSelector } from '@/components/coffee/CoffeeShopSelector';
import { BaristaSelector } from '@/components/coffee/BaristaSelector';
import { RatingInput } from '@/components/coffee/RatingInput';
import { BrewingMethodSelector } from '@/components/coffee/BrewingMethodSelector';
import { TastingForm, type TastingFormValues } from '@/components/coffee/TastingForm';
import { addTastingRecord, getSnapshot as getJourneySnapshot } from '@/lib/journey/store';
import { markJustRevealed } from '@/lib/journey/revealFlag';
import { markPinJustActivated } from '@/lib/journey/mapFlag';
import { consumePendingShop } from '@/lib/journey/pendingShopFlag';
import { getMergedLotById } from '@/lib/data/lotsStore';
import { getRoasterById } from '@/lib/data/roasters';
import { FarmerPinningModal } from '@/components/coffee/FarmerPinningModal';

type Step = 'shop' | 'barista' | 'brew' | 'taste';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

export default function TasteLotPage({ params }: { params: { lotId: string } }) {
  const lots = useLots();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const lot = lots.find((candidate) => candidate.id === params.lotId);

  if (!lot) {
    if (!mounted) return null;
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl text-ink-900 mb-2">Лот не найден</h1>
        <p className="text-ink-500 text-sm">Проверьте ссылку или отсканируйте другой QR-код.</p>
      </main>
    );
  }

  return <TasteLotFlow lot={lot} />;
}

function TasteLotFlow({ lot }: { lot: Lot }) {
  const [step, setStep] = useState<Step>('shop');
  const [coffeeShopId, setCoffeeShopId] = useState<string | null>(null);
  const [baristaId, setBaristaId] = useState<string | null>(null);
  const [baristaRating, setBaristaRating] = useState(0);
  const [baristaNote, setBaristaNote] = useState('');
  const [brewingMethod, setBrewingMethod] = useState<BrewingMethodId | null>(null);
  const [showPinningRitual, setShowPinningRitual] = useState(false);

  // If the guest already picked a shop on the passport page's check-in gate
  // (see markPendingShop there), skip asking again here — jump straight to
  // the barista step. Guard with a ref since consumePendingShop deletes as
  // it reads, and React Strict Mode double-invokes effects in dev (same
  // pattern as revealFlag/mapFlag consumption elsewhere in this flow).
  const pendingShopChecked = useRef(false);
  useEffect(() => {
    if (!pendingShopChecked.current) {
      pendingShopChecked.current = true;
      const pendingShopId = consumePendingShop(lot.id);
      if (pendingShopId && COFFEE_SHOPS.some((shop) => shop.id === pendingShopId)) {
        setCoffeeShopId(pendingShopId);
        setStep('barista');
      }
    }
  }, [lot.id]);

  function handleSave(values: TastingFormValues) {
    if (!coffeeShopId || !baristaId || !brewingMethod) return;

    // Checked before the save so the just-added record doesn't count as
    // "already had this pin" — drives the pin-drop animation on the Coffee
    // Belt map (see CoffeeBeltMap) only the first time this exact
    // (country, roaster) combination appears. The same country can carry
    // more than one roaster's pin, so this is keyed by the pair, not just
    // the country.
    const hadPinBefore = getJourneySnapshot().some((record) => {
      const recordLot = getMergedLotById(record.lotId);
      return recordLot?.country === lot.country && recordLot?.roasterId === lot.roasterId;
    });

    addTastingRecord({
      lotId: lot.id,
      roasterId: lot.roasterId,
      coffeeShopId,
      brewingMethod,
      baristaId,
      baristaRating,
      baristaNote,
      ...values,
    });

    if (!hadPinBefore) markPinJustActivated(lot.country, lot.roasterId);

    // The passport page still plays its own unlock/comparison reveal
    // whenever the guest lands there (via the ritual's × or a later visit).
    markJustRevealed(lot.id);

    // Intercept the flow here instead of navigating away immediately — the
    // Farmer Pinning ritual (fullscreen modal) is now the reward moment;
    // its own buttons decide where the guest goes next.
    setShowPinningRitual(true);
  }

  const roaster = getRoasterById(lot.roasterId);

  return (
    <main className="min-h-dvh flex flex-col px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
          {lot.name}
        </p>

        {step === 'shop' && (
          <>
            <h1 className="font-display text-2xl text-ink-900 mb-8">
              Где вы пробуете этот кофе?
            </h1>
            <CoffeeShopSelector
              shops={COFFEE_SHOPS}
              value={coffeeShopId}
              onChange={setCoffeeShopId}
            />
            <button
              type="button"
              disabled={!coffeeShopId}
              onClick={() => setStep('barista')}
              className="mt-8 inline-flex items-center justify-center w-full rounded-md
                         bg-ink-900 text-parchment-100 font-body font-medium text-sm px-6 py-4
                         hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              Далее
            </button>
          </>
        )}

        {step === 'barista' && coffeeShopId && (
          <>
            <h1 className="font-display text-2xl text-ink-900 mb-8">Кто готовил? (Бариста)</h1>
            <BaristaSelector
              baristas={getBaristasForShop(coffeeShopId)}
              value={baristaId}
              onChange={setBaristaId}
            />

            {baristaId && (
              <div className="flex flex-col gap-8 mt-8">
                <div>
                  <p className="section-label mb-4">Оценка бариста</p>
                  <RatingInput value={baristaRating} onChange={setBaristaRating} />
                </div>
                <div>
                  <label htmlFor="barista-note" className="section-label mb-4 block">
                    Пожелание бариста (необязательно)
                  </label>
                  <textarea
                    id="barista-note"
                    rows={2}
                    value={baristaNote}
                    onChange={(event) => setBaristaNote(event.target.value)}
                    placeholder="Отличная экстракция! Спасибо за позитив"
                    className={fieldClasses}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-8">
              <button
                type="button"
                onClick={() => setStep('shop')}
                className="inline-flex items-center justify-center rounded-md border
                           border-ink-200 text-ink-700 font-body font-medium text-sm px-6 py-4
                           hover:bg-parchment-300 transition-colors"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={!baristaId}
                onClick={() => setStep('brew')}
                className="flex-1 inline-flex items-center justify-center rounded-md
                           bg-ink-900 text-parchment-100 font-body font-medium text-sm px-6 py-4
                           hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                Далее
              </button>
            </div>
          </>
        )}

        {step === 'brew' && (
          <>
            <h1 className="font-display text-2xl text-ink-900 mb-8">Как приготовлен кофе?</h1>
            <BrewingMethodSelector value={brewingMethod} onChange={setBrewingMethod} />
            <div className="flex gap-3 mt-8">
              <button
                type="button"
                onClick={() => setStep('barista')}
                className="inline-flex items-center justify-center rounded-md border
                           border-ink-200 text-ink-700 font-body font-medium text-sm px-6 py-4
                           hover:bg-parchment-300 transition-colors"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={!brewingMethod}
                onClick={() => setStep('taste')}
                className="flex-1 inline-flex items-center justify-center rounded-md
                           bg-ink-900 text-parchment-100 font-body font-medium text-sm px-6 py-4
                           hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                Далее
              </button>
            </div>
          </>
        )}

        {step === 'taste' && (
          <>
            <h1 className="font-display text-2xl text-ink-900 mb-8">Расскажите о чашке</h1>
            <TastingForm onSave={handleSave} />
          </>
        )}
      </div>

      {showPinningRitual && roaster && <FarmerPinningModal lot={lot} roaster={roaster} />}
    </main>
  );
}
