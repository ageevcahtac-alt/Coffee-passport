'use client';

import Link from 'next/link';
import { BREWING_METHODS } from '@/lib/types/coffee';
import { useBrewingRecipes } from '@/lib/data/useBrewingRecipes';
import { getMergedLotById } from '@/lib/data/lotsStore';

// The enthusiast's own logged/adapted recipes across every lot — a
// cross-lot view of what's shown per-lot on the Extraction tab's Community
// group (see components/coffee/ExtractionTab.tsx).
export function MyRecipesShelf({ userId }: { userId: string }) {
  const recipes = useBrewingRecipes()
    .filter((recipe) => recipe.authorType === 'enthusiast' && recipe.authorId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (recipes.length === 0) return null;

  return (
    <div className="max-w-md mx-auto w-full mb-6">
      <p className="section-label mb-4">Мои рецепты</p>
      <div className="flex flex-col gap-3">
        {recipes.map((recipe) => {
          const lot = getMergedLotById(recipe.lotId);
          const methodLabel = BREWING_METHODS.find((method) => method.id === recipe.brewingMethodId)?.label ?? recipe.brewingMethodId;
          if (!lot) return null;

          return (
            <Link
              key={recipe.id}
              href={`/passport/${lot.id}`}
              className="rounded-md border border-ink-200 bg-parchment-100 p-4 block hover:border-gold-400 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-base text-ink-900 leading-tight">{lot.name}</h3>
                  <p className="text-xs text-ink-400 mt-1">{methodLabel}</p>
                </div>
                <span className="data-value text-xs text-ink-400 shrink-0">
                  {recipe.doseG}г → {recipe.yieldG}г
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
