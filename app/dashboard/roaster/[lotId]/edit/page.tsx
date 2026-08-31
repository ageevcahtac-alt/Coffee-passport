'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLots } from '@/lib/data/useLots';
import { getRoasterById } from '@/lib/data/roasters';
import { saveLot } from '@/lib/data/lotsStore';
import { useRoastProfiles } from '@/lib/data/useRoastProfiles';
import { saveRoastProfile } from '@/lib/data/roastProfilesStore';
import { useBrewingRecipes } from '@/lib/data/useBrewingRecipes';
import { addBrewingRecipe } from '@/lib/data/brewingRecipesStore';
import { LotBuilderForm } from '@/components/roaster/LotBuilderForm';
import { RoastProfileForm } from '@/components/roaster/RoastProfileForm';
import { BenchmarkRecipeForm } from '@/components/roaster/BenchmarkRecipeForm';
import { useStaffSession } from '@/lib/auth/staffSession';
import { BREWING_METHODS, type Lot, type RoastProfile } from '@/lib/types/coffee';

export default function EditLotPage({ params }: { params: { lotId: string } }) {
  const router = useRouter();
  const { roasterId } = useStaffSession();
  const lots = useLots();
  // The lots list is seed data merged with localStorage, so the very first
  // client render (matching the server snapshot) may not yet include a
  // lot created moments ago — wait for hydration before deciding not found.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const roaster = roasterId ? getRoasterById(roasterId) : undefined;
  const lot = lots.find((candidate) => candidate.id === params.lotId);

  const roastProfiles = useRoastProfiles().filter((profile) => lot && profile.lotId === lot.id);
  const benchmarkRecipes = useBrewingRecipes().filter(
    (recipe) => lot && recipe.lotId === lot.id && recipe.authorType === 'roaster'
  );

  const [editingProfile, setEditingProfile] = useState<RoastProfile | null | undefined>(undefined);
  const [addingRecipe, setAddingRecipe] = useState(false);

  function handleSave(updated: Lot) {
    saveLot(updated);
    router.push('/dashboard/roaster');
  }

  if (!roaster) return null;

  if (!lot) {
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
        <h1 className="font-display text-2xl text-ink-900 mb-8">Редактировать лот</h1>
        <LotBuilderForm
          roaster={roaster}
          initialLot={lot}
          onSave={handleSave}
          onCancel={() => router.push('/dashboard/roaster')}
        />

        <div className="mt-14">
          <p className="section-label mb-4">Профиль обжарки</p>
          {editingProfile !== undefined ? (
            <RoastProfileForm
              lot={lot}
              roaster={roaster}
              initialProfile={editingProfile ?? undefined}
              onSave={(profile) => {
                saveRoastProfile(profile);
                setEditingProfile(undefined);
              }}
              onCancel={() => setEditingProfile(undefined)}
            />
          ) : (
            <>
              {roastProfiles.length === 0 ? (
                <p className="text-sm text-ink-400 mb-4">Профиль обжарки ещё не опубликован.</p>
              ) : (
                <div className="flex flex-col gap-2 mb-4">
                  {roastProfiles.map((profile) => (
                    <div key={profile.id} className="rounded-md border border-ink-200 bg-parchment-100 p-4 flex items-center justify-between gap-4">
                      <p className="text-sm text-ink-900">
                        {profile.machineModel || 'Без машины'} · Charge {profile.chargeTemp}°C → Drop {profile.dropTemp}°C
                      </p>
                      <button type="button" onClick={() => setEditingProfile(profile)}
                        className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900 shrink-0">
                        Редактировать
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setEditingProfile(null)}
                className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900">
                + Добавить профиль обжарки
              </button>
            </>
          )}
        </div>

        <div className="mt-14">
          <p className="section-label mb-4">Рецепты-бенчмарки</p>
          {addingRecipe ? (
            <BenchmarkRecipeForm
              lot={lot}
              roaster={roaster}
              onSave={(recipe) => {
                addBrewingRecipe(recipe);
                setAddingRecipe(false);
              }}
              onCancel={() => setAddingRecipe(false)}
            />
          ) : (
            <>
              {benchmarkRecipes.length === 0 ? (
                <p className="text-sm text-ink-400 mb-4">Рецепты-бенчмарки ещё не опубликованы.</p>
              ) : (
                <div className="flex flex-col gap-2 mb-4">
                  {benchmarkRecipes.map((recipe) => {
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
