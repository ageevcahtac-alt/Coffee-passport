'use client';

'use client';

import Link from 'next/link';
import { BREWING_METHODS } from '@/lib/types/coffee';
import { useBrewingRecipes } from '@/lib/data/useBrewingRecipes';
import { getMergedLotById } from '@/lib/data/lotsStore';
import { RecipeCard } from '@/components/coffee/RecipeCard';

// The enthusiast's own logged/adapted recipes across every lot — a
// cross-lot view of what's shown per-lot on the Extraction tab's Community
// group (see components/coffee/ExtractionTab.tsx). Renders the full
// RecipeCard (not just a summary row) so the extraction-yield chart and
// "Мой TDS" input are actually reachable from /journey, not only from a
// Lot Card's Extraction tab.
export function MyRecipesShelf({ userId }: { userId: string }) {
  const recipes = useBrewingRecipes()
    .filter((recipe) => recipe.authorType === 'enthusiast' && recipe.authorId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (recipes.length === 0) return null;

  return (
    <div className="max-w-md mx-auto w-full mb-6">
      <p className="section-label mb-4">Мои рецепты</p>
      <div className="flex flex-col gap-5">
        {recipes.map((recipe) => {
          const lot = getMergedLotById(recipe.lotId);
          const methodLabel = BREWING_METHODS.find((method) => method.id === recipe.brewingMethodId)?.label ?? recipe.brewingMethodId;
          if (!lot) return null;

          return (
            <div key={recipe.id}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <Link
                  href={`/passport/${lot.id}`}
                  className="text-sm text-ink-900 font-medium underline underline-offset-2 hover:text-gold-500"
                >
                  {lot.name}
                </Link>
                <span className="text-xs text-ink-400 shrink-0">{methodLabel}</span>
              </div>
              <RecipeCard recipe={recipe} currentUserId={userId} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
