'use client';

import { useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLotById } from '@/lib/data/lots';
import { COFFEE_SHOPS } from '@/lib/data/coffeeShops';
import type { BrewingMethodId, Lot } from '@/lib/types/coffee';
import { CoffeeShopSelector } from '@/components/coffee/CoffeeShopSelector';
import { BrewingMethodSelector } from '@/components/coffee/BrewingMethodSelector';
import { TastingForm, type TastingFormValues } from '@/components/coffee/TastingForm';
import { addTastingRecord } from '@/lib/journey/store';

type Step = 'shop' | 'brew' | 'taste' | 'saved';

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
  const [brewingMethod, setBrewingMethod] = useState<BrewingMethodId | null>(null);

  function handleSave(values: TastingFormValues) {
    if (!coffeeShopId || !brewingMethod) return;
    addTastingRecord({
      lotId: lot.id,
      roasterId: lot.roasterId,
      coffeeShopId,
      brewingMethod,
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
              onClick={() => setStep('brew')}
              className="mt-8 inline-flex items-center justify-center w-full rounded-md
                         bg-ink-900 text-parchment-100 font-body font-medium text-sm px-6 py-4
                         hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              Далее
            </button>
          </>
        )}

        {step === 'brew' && (
          <>
            <h1 className="font-display text-2xl text-ink-900 mb-8">Как приготовлен кофе?</h1>
            <BrewingMethodSelector value={brewingMethod} onChange={setBrewingMethod} />
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
