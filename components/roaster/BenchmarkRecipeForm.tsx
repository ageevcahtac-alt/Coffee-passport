'use client';

import type { BrewingRecipe, Lot, Roaster } from '@/lib/types/coffee';
import { PRO_GRINDER_MODELS } from '@/lib/types/coffee';
import { ProRecipeForm } from '@/components/coffee/ProRecipeForm';

// The roaster's official default extraction recipe for a brewing method —
// the "gold standard" enthusiasts and coffee shops read against. See
// components/coffee/ProRecipeForm.tsx for the shared field set.
export function BenchmarkRecipeForm({
  lot,
  roaster,
  initialRecipe,
  onSave,
  onCancel,
}: {
  lot: Lot;
  roaster: Roaster;
  initialRecipe?: BrewingRecipe;
  onSave: (recipe: Omit<BrewingRecipe, 'id' | 'createdAt'>) => void;
  onCancel?: () => void;
}) {
  return (
    <ProRecipeForm
      lot={lot}
      authorType="roaster"
      authorId={roaster.id}
      authorName={roaster.name}
      isBenchmark
      grinderOptions={PRO_GRINDER_MODELS}
      initialRecipe={initialRecipe}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}
