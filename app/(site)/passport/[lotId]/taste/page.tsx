'use client';

import { useEffect, useRef, useState } from 'react';
import { useLots } from '@/lib/data/useLots';
import { useCoffeeShops } from '@/lib/data/useCoffeeShops';
import { useRoasters } from '@/lib/data/useRoasters';
import { getBaristasForShop } from '@/lib/data/baristas';
import {
  emptyDrinkSelectionDraft,
  FILTER_ALTERNATIVE_TO_BREWING_METHOD,
  isDrinkSelectionComplete,
  type BrewingMethodId,
  type DrinkSelectionDraft,
  type FilterAlternativeDrinkTypeId,
  type Lot,
} from '@/lib/types/coffee';
import { LocationStep } from '@/components/coffee/LocationStep';
import { BaristaSelector } from '@/components/coffee/BaristaSelector';
import { RatingInput } from '@/components/coffee/RatingInput';
import { BrewingMethodSelector } from '@/components/coffee/BrewingMethodSelector';
import { DrinkTypeSelector } from '@/components/coffee/DrinkTypeSelector';
import { TastingForm, type TastingFormValues } from '@/components/coffee/TastingForm';
import { addTastingRecord, getSnapshot as getJourneySnapshot } from '@/lib/journey/store';
import { markJustRevealed } from '@/lib/journey/revealFlag';
import { markPinJustActivated } from '@/lib/journey/mapFlag';
import { consumePendingShop, markPendingShop } from '@/lib/journey/pendingShopFlag';
import { consumePendingRoaster, markPendingRoaster } from '@/lib/journey/pendingRoasterFlag';
import { getMergedLotById } from '@/lib/data/lotsStore';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { useCurrentUser } from '@/lib/auth/currentUser';
import { FarmerPinningModal } from '@/components/coffee/FarmerPinningModal';

// Blind-tasting flow, in the product's mandated order:
//   1. Scan QR (upstream — see /scan and ScanLotModal)
//   2. 'location' — coffee shop + roaster (accredited-partner autocompletes)
//   3. 'drink'    — what the guest is drinking (category → specific drink/
//                   method → milk tree for milk-based) — asked before taste
//                   so the Level 3 form below can adapt to it, but it's
//                   still "what did I order", not a taste judgement, so it
//                   doesn't compromise the blind read
//   4. 'taste'    — blind flavor assessment (priority: comes before any
//                   barista/prep detail so it stays uninfluenced)
//   5. 'barista'  — final step: how it was brewed + who made it + rating
type Step = 'location' | 'drink' | 'taste' | 'barista';

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
  const coffeeShops = useCoffeeShops();
  const roasters = useRoasters();
  const { userId, ready } = useCurrentUser();
  const [step, setStep] = useState<Step>('location');
  const [coffeeShopId, setCoffeeShopId] = useState<string | null>(null);
  const [roasterId, setRoasterId] = useState<string | null>(null);
  const [baristaId, setBaristaId] = useState<string | null>(null);
  const [baristaRating, setBaristaRating] = useState(0);
  const [baristaNote, setBaristaNote] = useState('');
  const [brewingMethod, setBrewingMethod] = useState<BrewingMethodId | null>(null);
  const [drinkSelection, setDrinkSelection] = useState<DrinkSelectionDraft>(emptyDrinkSelectionDraft());
  const [pendingTasteValues, setPendingTasteValues] = useState<TastingFormValues | null>(null);
  const [showPinningRitual, setShowPinningRitual] = useState(false);

  // If the guest already picked a shop + roaster on the passport page's
  // location gate (see markPendingShop/markPendingRoaster there), skip
  // asking again here — jump straight to the blind taste step. Guard with a
  // ref since the consume* calls delete as they read, and React Strict Mode
  // double-invokes effects in dev (same pattern as revealFlag/mapFlag
  // consumption elsewhere in this flow).
  const pendingChecked = useRef(false);
  useEffect(() => {
    if (!pendingChecked.current) {
      pendingChecked.current = true;
      const pendingShopId = consumePendingShop(lot.id);
      const pendingRoasterId = consumePendingRoaster(lot.id);
      if (pendingShopId && coffeeShops.some((shop) => shop.id === pendingShopId)) {
        setCoffeeShopId(pendingShopId);
        setRoasterId(pendingRoasterId ?? lot.roasterId);
        setStep('drink');
      }
    }
  }, [lot.id]);

  // Filter/Alternative's Level-2 pick already answers "how was it brewed" —
  // pre-fill brewingMethod from it so the later barista step opens with the
  // matching device already selected instead of asking the same question
  // twice. Milk/black-coffee drinks are always machine-espresso-based, so
  // that step opens pre-set to 'espresso' too, still editable either way.
  function handleConfirmDrink() {
    if (!isDrinkSelectionComplete(drinkSelection)) return;
    if (drinkSelection.drinkCategory === 'filter_alternative') {
      const drinkType = drinkSelection.drinkType as FilterAlternativeDrinkTypeId;
      const mapped = drinkType === 'custom' ? undefined : FILTER_ALTERNATIVE_TO_BREWING_METHOD[drinkType];
      setBrewingMethod(mapped ?? 'custom');
    } else {
      setBrewingMethod('espresso');
    }
    setStep('taste');
  }

  function handleSaveTaste(values: TastingFormValues) {
    setPendingTasteValues(values);
    setStep('barista');
  }

  function handleFinish() {
    if (!coffeeShopId || !baristaId || !brewingMethod || !pendingTasteValues || !userId) return;
    if (!isDrinkSelectionComplete(drinkSelection)) return;

    // Checked before the save so the just-added record doesn't count as
    // "already had this pin" — drives the pin-drop animation on the Coffee
    // Belt map (see CoffeeBeltMap) only the first time this exact
    // (country, coffee shop) combination appears. Pins are shop-colored, so
    // the same country tasted at two different shops carries two pins; the
    // same shop across two different roasters' lots in that country stays
    // one pin. Scoped to this user's own records — this is a per-account
    // map, not a shop's aggregate visit count.
    const hadPinBefore = getJourneySnapshot().some((record) => {
      if (record.userId !== userId) return false;
      if (record.coffeeShopId !== coffeeShopId) return false;
      return getMergedLotById(record.lotId)?.country === lot.country;
    });

    addTastingRecord(
      {
        lotId: lot.id,
        roasterId: roasterId ?? lot.roasterId,
        coffeeShopId,
        brewingMethod,
        baristaId,
        baristaRating,
        baristaNote,
        drinkCategory: drinkSelection.drinkCategory,
        drinkType: drinkSelection.drinkType,
        customDrinkName: drinkSelection.customDrinkName,
        milkBaseType: drinkSelection.milkBaseType,
        cowMilkType: drinkSelection.cowMilkType,
        isLactoseFree: drinkSelection.isLactoseFree,
        fatContentPercent: drinkSelection.fatContentPercent,
        plantMilkType: drinkSelection.plantMilkType,
        ...pendingTasteValues,
      },
      userId
    );

    if (!hadPinBefore) markPinJustActivated(lot.country, coffeeShopId);

    // The passport page still plays its own unlock/comparison reveal
    // whenever the guest lands there (via the ritual's × or a later visit).
    // Re-mark the same one-shot flags that got the guest INTO this flow
    // (consumed already, at mount) so the return trip to /passport/[lotId]
    // can skip its own check-in gate too — otherwise landing there via the
    // FarmerPinningModal's × always asked "Где вы пробуете этот лот
    // сегодня?" again before ever showing the just-saved TasteComparison.
    markJustRevealed(lot.id);
    markPendingShop(lot.id, coffeeShopId);
    markPendingRoaster(lot.id, roasterId ?? lot.roasterId);

    // Intercept the flow here instead of navigating away immediately — the
    // Farmer Pinning ritual (fullscreen modal) is now the reward moment;
    // its own buttons decide where the guest goes next.
    setShowPinningRitual(true);
  }

  const shop = coffeeShopId ? getCoffeeShopById(coffeeShopId) : undefined;

  return (
    <main className="min-h-dvh flex flex-col px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
          {lot.name}
        </p>

        {step === 'location' && (
          <>
            <h1 className="font-display text-2xl text-ink-900 mb-8">
              Где вы пробуете этот кофе?
            </h1>
            <LocationStep
              lot={lot}
              coffeeShops={coffeeShops}
              roasters={roasters}
              shopId={coffeeShopId}
              onShopChange={setCoffeeShopId}
              roasterId={roasterId ?? lot.roasterId}
              onRoasterChange={setRoasterId}
            />
            <button
              type="button"
              disabled={!coffeeShopId}
              onClick={() => setStep('drink')}
              className="mt-8 inline-flex items-center justify-center w-full rounded-md
                         bg-ink-900 text-parchment-100 font-body font-medium text-sm px-6 py-4
                         hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              Далее
            </button>
          </>
        )}

        {step === 'drink' && (
          <>
            <h1 className="font-display text-2xl text-ink-900 mb-8">Что вы пьёте?</h1>
            <DrinkTypeSelector value={drinkSelection} onChange={(patch) => setDrinkSelection((prev) => ({ ...prev, ...patch }))} />
            <div className="flex gap-3 mt-8">
              <button
                type="button"
                onClick={() => setStep('location')}
                className="inline-flex items-center justify-center rounded-md border
                           border-ink-200 text-ink-700 font-body font-medium text-sm px-6 py-4
                           hover:bg-parchment-300 transition-colors"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={!isDrinkSelectionComplete(drinkSelection)}
                onClick={handleConfirmDrink}
                className="flex-1 inline-flex items-center justify-center rounded-md
                           bg-ink-900 text-parchment-100 font-body font-medium text-sm px-6 py-4
                           hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                Далее
              </button>
            </div>
          </>
        )}

        {step === 'taste' && drinkSelection.drinkCategory && (
          <>
            <h1 className="font-display text-2xl text-ink-900 mb-8">Расскажите о чашке</h1>
            <TastingForm
              onSave={handleSaveTaste}
              submitLabel="Далее — работа бариста"
              drinkCategory={drinkSelection.drinkCategory}
            />
          </>
        )}

        {step === 'barista' && coffeeShopId && (
          <>
            <h1 className="font-display text-2xl text-ink-900 mb-2">Работа бариста</h1>
            <p className="text-xs text-ink-400 mb-8">Заключительный шаг — как был приготовлен кофе.</p>

            <p className="section-label mb-4">Способ приготовления</p>
            <BrewingMethodSelector value={brewingMethod} onChange={setBrewingMethod} />

            <p className="section-label mb-4 mt-8">Кто готовил?</p>
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
                onClick={() => setStep('taste')}
                className="inline-flex items-center justify-center rounded-md border
                           border-ink-200 text-ink-700 font-body font-medium text-sm px-6 py-4
                           hover:bg-parchment-300 transition-colors"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={!baristaId || !brewingMethod || !ready || !userId}
                onClick={handleFinish}
                className="flex-1 inline-flex items-center justify-center rounded-md
                           bg-ink-900 text-parchment-100 font-body font-medium text-sm px-6 py-4
                           hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                Сохранить дегустацию в дневник
              </button>
            </div>
          </>
        )}
      </div>

      {showPinningRitual && shop && <FarmerPinningModal lot={lot} shop={shop} baristaId={baristaId} />}
    </main>
  );
}
