'use client';

import { useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLotById } from '@/lib/data/lots';
import { COFFEE_SHOPS } from '@/lib/data/coffeeShops';
import { getBaristasForShop } from '@/lib/data/baristas';
import type { BrewingMethodId, Lot } from '@/lib/types/coffee';
import { CoffeeShopSelector } from '@/components/coffee/CoffeeShopSelector';
import { BaristaSelector } from '@/components/coffee/BaristaSelector';
import { RatingInput } from '@/components/coffee/RatingInput';
import { BrewingMethodSelector } from '@/components/coffee/BrewingMethodSelector';
import { TastingForm, type TastingFormValues } from '@/components/coffee/TastingForm';
import { addTastingRecord } from '@/lib/journey/store';

type Step = 'shop' | 'barista' | 'brew' | 'taste' | 'saved';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

export default function TasteLotPage({ params }: { params: { lotId: string } }) {
  const lot = getLotById(params.lotId);
  if (!lot) {
    notFound();
    return null;
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

  function handleSave(values: TastingFormValues) {
    if (!coffeeShopId || !baristaId || !brewingMethod) return;
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
    setStep('saved');
  }

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

        {step === 'saved' && (
          <div className="text-center py-16">
            <p className="text-4xl mb-4" aria-hidden="true">✓</p>
            <h1 className="font-display text-2xl text-ink-900 mb-3">Сохранено</h1>
            <p className="text-ink-500 text-sm mb-8 max-w-xs mx-auto">
              {lot.name} добавлен в ваше кофейное путешествие.
            </p>
            <Link
              href="/journey"
              className="inline-flex items-center justify-center rounded-md bg-ink-900
                         text-parchment-100 font-body font-medium text-sm px-6 py-4
                         hover:bg-ink-800 transition-colors"
            >
              Моё кофейное путешествие
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
