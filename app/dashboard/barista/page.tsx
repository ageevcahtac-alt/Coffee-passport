'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getBaristaById } from '@/lib/data/baristas';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { useLots } from '@/lib/data/useLots';
import { useCafeMenuLotIds } from '@/lib/data/useCafeMenu';
import { useBrewingRecipes } from '@/lib/data/useBrewingRecipes';
import { addBrewingRecipe } from '@/lib/data/brewingRecipesStore';
import { BaristaRecipeForm } from '@/components/barista/BaristaRecipeForm';
import { BaristaFeedback } from '@/components/barista/BaristaFeedback';
import { BaristaLoyaltyPanel } from '@/components/loyalty/BaristaLoyaltyPanel';
import { useStaffSession } from '@/lib/auth/staffSession';
import { BREWING_METHODS, type Barista, type BrewingRecipe, type Lot } from '@/lib/types/coffee';

export default function BaristaDashboardPage() {
  const { baristaId, cafeId } = useStaffSession();
  const barista = baristaId ? getBaristaById(baristaId) : undefined;
  const shop = cafeId ? getCoffeeShopById(cafeId) : undefined;
  const lots = useLots();
  const menuLotIds = useCafeMenuLotIds(cafeId ?? '');
  const menuLots = lots.filter((lot) => menuLotIds.includes(lot.id));

  if (!barista || !shop) return null;

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-2xl mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
          {shop.name} · {shop.city}
        </p>
        <h1 className="font-display text-3xl text-ink-900 mb-10">{barista.name}</h1>

        <BaristaLoyaltyPanel shopId={cafeId ?? ''} />

        <BaristaFeedback baristaId={barista.id} />

        <p className="section-label mb-4">Мои рекомендации по лотам</p>
        {menuLots.length === 0 ? (
          <p className="text-sm text-ink-500">
            В меню кофейни пока нет лотов — рекомендации появятся, когда кофейня добавит зерно в меню.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {menuLots.map((lot) => (
              <LotRecipeRow key={lot.id} lot={lot} barista={barista} shopId={cafeId ?? ''} />
            ))}
          </div>
        )}

        <Link
          href="/dashboard/cafe"
          className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900 mt-10 inline-block"
        >
          ← Меню кофейни
        </Link>
      </div>
    </main>
  );
}

function LotRecipeRow({
  lot,
  barista,
  shopId,
}: {
  lot: Lot;
  barista: Barista;
  shopId: string;
}) {
  const shop = getCoffeeShopById(shopId);
  const myRecipes = useBrewingRecipes().filter(
    (recipe) => recipe.lotId === lot.id && recipe.authorType === 'barista' && recipe.authorId === barista.id
  );
  const [adding, setAdding] = useState(false);

  function handleSave(recipe: Omit<BrewingRecipe, 'id' | 'createdAt'>) {
    addBrewingRecipe(recipe);
    setAdding(false);
  }

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <h3 className="font-display text-lg text-ink-900 leading-tight mb-3">{lot.name}</h3>

      {myRecipes.length === 0 ? (
        <p className="text-sm text-ink-400 mb-3">Рекомендация ещё не опубликована.</p>
      ) : (
        <div className="flex flex-col gap-2 mb-3">
          {myRecipes.map((recipe) => {
            const methodLabel = BREWING_METHODS.find((method) => method.id === recipe.brewingMethodId)?.label ?? recipe.brewingMethodId;
            return (
              <div key={recipe.id} className="rounded-md border border-ink-100 bg-parchment-200 px-4 py-3">
                <p className="text-sm text-ink-900">
                  {methodLabel} · {recipe.doseG}г → {recipe.yieldG}г
                </p>
              </div>
            );
          })}
        </div>
      )}

      {adding && shop ? (
        <div className="mt-4">
          <BaristaRecipeForm
            lot={lot}
            barista={barista}
            shop={shop}
            onSave={handleSave}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
        >
          + Добавить рецепт под другой метод
        </button>
      )}
    </div>
  );
}
