'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLots } from '@/lib/data/useLots';
import { getRoasterById } from '@/lib/data/roasters';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { saveLot } from '@/lib/data/lotsStore';
import { useBrewingRecipes } from '@/lib/data/useBrewingRecipes';
import { addBrewingRecipe } from '@/lib/data/brewingRecipesStore';
import { LotBuilderForm } from '@/components/roaster/LotBuilderForm';
import { SignatureRecipeForm } from '@/components/cafe/SignatureRecipeForm';
import { useStaffSession } from '@/lib/auth/staffSession';
import { BREWING_METHODS, type Lot } from '@/lib/types/coffee';

export default function CafeEditLotPage({ params }: { params: { lotId: string } }) {
  const router = useRouter();
  const { cafeId } = useStaffSession();
  const lots = useLots();
  // The lots list is seed data merged with localStorage, so the very first
  // client render (matching the server snapshot) may not yet include a lot
  // added moments ago — wait for hydration before deciding not found.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const lot = lots.find((candidate) => candidate.id === params.lotId);
  const roaster = lot ? getRoasterById(lot.roasterId) : undefined;
  const shop = cafeId ? getCoffeeShopById(cafeId) : undefined;

  const signatureRecipes = useBrewingRecipes().filter(
    (recipe) => lot && recipe.lotId === lot.id && recipe.authorType === 'coffee_shop' && recipe.authorId === cafeId
  );
  const [addingRecipe, setAddingRecipe] = useState(false);

  function handleSave(updated: Lot) {
    saveLot(updated);
    router.push('/dashboard/cafe');
  }

  if (!lot || !roaster || !shop) {
    if (!mounted) return null;
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl text-ink-900 mb-2">Лот не найден</h1>
        <p className="text-ink-500 text-sm">Возможно, он был удалён или ссылка неверна.</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
          {roaster.name}
        </p>
        <h1 className="font-display text-2xl text-ink-900 mb-8">Редактировать карточку лота</h1>
        <LotBuilderForm
          roaster={roaster}
          initialLot={lot}
          onSave={handleSave}
          onCancel={() => router.push('/dashboard/cafe')}
        />

        <div className="mt-14">
          <p className="section-label mb-4">Фирменный рецепт кофейни</p>
          {addingRecipe ? (
            <SignatureRecipeForm
              lot={lot}
              shop={shop}
              onSave={(recipe) => {
                addBrewingRecipe(recipe);
                setAddingRecipe(false);
              }}
              onCancel={() => setAddingRecipe(false)}
            />
          ) : (
            <>
              {signatureRecipes.length === 0 ? (
                <p className="text-sm text-ink-400 mb-4">Кофейня ещё не опубликовала свою адаптацию рецепта.</p>
              ) : (
                <div className="flex flex-col gap-2 mb-4">
                  {signatureRecipes.map((recipe) => {
                    const methodLabel = BREWING_METHODS.find((method) => method.id === recipe.brewingMethodId)?.label ?? recipe.brewingMethodId;
                    return (
                      <div key={recipe.id} className="rounded-md border border-ink-200 bg-parchment-100 p-4">
                        <p className="text-sm text-ink-900">{methodLabel} · {recipe.doseG}г → {recipe.yieldG}г</p>
                      </div>
                    );
                  })}
                </div>
              )}
              <button type="button" onClick={() => setAddingRecipe(true)}
                className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900">
                + Добавить рецепт под другой метод
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
