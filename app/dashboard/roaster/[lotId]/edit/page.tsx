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
import { CanonicalLotChain } from '@/components/roaster/CanonicalLotChain';
import { CanonicalLotStatusControl } from '@/components/roaster/CanonicalLotStatusControl';
import { CoffeeGreenLotEditPanel } from '@/components/roaster/CoffeeGreenLotEditPanel';
import {
  findCanonicalLotByPublicId,
  updateCanonicalLotFields,
  activateTasteProfile,
  createRoastBatch,
  activateReferenceRoastProfile,
} from '@/lib/data/canonicalLotStore';

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
  const [roastProfileSaveError, setRoastProfileSaveError] = useState<string | null>(null);

  // Public Coffee Passport block's roast_batches audit
  // (ROAST_BATCH_PUBLIC_PASSPORT_AUDIT.md) — saveRoastProfile() only ever
  // wrote the local cache; the button right below already says "Опубликовать
  // профиль обжарки," but nothing published anywhere. roast_batches rows are
  // immutable (a DB trigger rejects UPDATE/DELETE), so every save — new
  // profile or "Редактировать" on an existing one — creates one new,
  // permanent batch event rather than attempting to rewrite one in place.
  //
  // REFERENCE_ROAST_PROFILE_IMPLEMENTATION.md — the same one save action
  // also activates a new reference_roast_profiles version (the roaster's
  // declared target approach, versioned like Taste Profile), reusing the
  // exact fields RoastProfileForm already collects (its logged curve
  // doubles as the newly-declared target curve) — one form, one button, one
  // production flow, not a second parallel one.
  //
  // ROAST_BATCH_REFERENCE_LINK.md — order matters here: the reference
  // profile version must be activated FIRST so its real id exists before the
  // immutable roast_batches row is created, so that row can record the
  // EXACT version it followed (reference_roast_profile_id) rather than
  // leaving that FK permanently null.
  async function handleRoastProfileSave(profile: Parameters<typeof saveRoastProfile>[0]) {
    saveRoastProfile(profile);
    setEditingProfile(undefined);
    setRoastProfileSaveError(null);
    try {
      const canonicalLot = await findCanonicalLotByPublicId(profile.lotId);
      if (canonicalLot) {
        const referenceRoastProfileId = await activateReferenceRoastProfile(canonicalLot.id, {
          machineModel: profile.machineModel,
          targetCurve: profile.curve,
          agtronTarget: profile.agtronNumber,
          notes: profile.notes,
        });
        await createRoastBatch(canonicalLot.id, {
          machineModel: profile.machineModel,
          chargeTemp: profile.chargeTemp,
          dropTemp: profile.dropTemp,
          firstCrackTimeSec: profile.firstCrackTimeSec,
          totalTimeSec: profile.totalTimeSec,
          dtrPercent: profile.dtrPercent,
          agtronNumber: profile.agtronNumber,
          curve: profile.curve,
          notes: profile.notes,
          referenceRoastProfileId,
        });
      }
    } catch (err) {
      setRoastProfileSaveError(
        err instanceof Error ? err.message : 'Не удалось опубликовать профиль обжарки в каноническом каталоге.'
      );
    }
  }
  // Bumped after the status control writes directly to Supabase, to force
  // CanonicalLotChain (Phase 4.5.3, left otherwise untouched) to remount
  // and refetch instead of showing a stale status.
  const [chainRefreshKey, setChainRefreshKey] = useState(0);
  const [canonicalSaveError, setCanonicalSaveError] = useState<string | null>(null);

  // LotBuilderForm/saveLot only ever wrote to the local override cache
  // (Phase 4.5.2 scope) — the roaster's edits never reached the actual
  // Supabase `lots` row. Phase 4.5.4 closed that gap for name/inRoasterCatalog;
  // Phase 4.5.12's final audit found the remaining Canonical-Lot-own fields
  // LotBuilderForm collects (qGrade, roastType, roastProfileLabel,
  // descriptors — plain `lots` columns, not Coffee/Green-Lot data) had the
  // exact same silent-local-only bug, now closed too via the widened
  // MutableCanonicalLotFields in canonicalLotStore.ts. Origin fields
  // (country, region, variety, process, cropYear, producer.*, story) remain
  // local-only by design — they belong to Coffee, not this Lot, and editing
  // them here still doesn't write back to `coffees` (a separate, larger,
  // still-open question — see PHASE_4.5.12_REPORT.md).
  //
  // The Public Passport next-major-block audit found the flavor sliders
  // (acidity/sweetness/body/bitterness) had the same gap one level deeper:
  // they were never even part of MutableCanonicalLotFields, because they
  // don't live on `lots` at all — they're a separate, versioned table
  // (reference_taste_profiles) whose write path (activateTasteProfile) had
  // never been built until now. Re-activating a version on every save keeps
  // the guest-facing "roaster's reference" (ProducerRoasterCard,
  // TasteComparison) current instead of permanently frozen at whatever the
  // one-time backfill script set (or, for any Lot created since, nothing at
  // all — see PUBLIC_PASSPORT_NEXT_BLOCK_AUDIT.md).
  async function handleSave(updated: Lot) {
    saveLot(updated);
    setCanonicalSaveError(null);
    try {
      const canonicalLot = await findCanonicalLotByPublicId(updated.id);
      if (canonicalLot) {
        await updateCanonicalLotFields(canonicalLot.id, {
          name: updated.name,
          inRoasterCatalog: updated.inRoasterCatalog,
          qGrade: updated.qGrade,
          roastType: updated.roastType,
          roastProfileLabel: updated.roastProfile,
          descriptors: updated.descriptors,
        });
        await activateTasteProfile(canonicalLot.id, updated.roasterFlavorProfile);
      }
      router.push('/dashboard/roaster');
    } catch (err) {
      setCanonicalSaveError(
        err instanceof Error ? err.message : 'Не удалось сохранить изменения в каноническом каталоге.'
      );
    }
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

        <div className="mb-8">
          <CanonicalLotChain key={chainRefreshKey} publicId={lot.id} />
          <CanonicalLotStatusControl publicId={lot.id} onUpdated={() => setChainRefreshKey((k) => k + 1)} />
        </div>

        <div className="mb-8">
          <CoffeeGreenLotEditPanel publicId={lot.id} />
        </div>

        {canonicalSaveError && <p className="mb-6 text-sm text-red-600">{canonicalSaveError}</p>}

        <LotBuilderForm
          roaster={roaster}
          initialLot={lot}
          onSave={handleSave}
          onCancel={() => router.push('/dashboard/roaster')}
        />

        <div className="mt-14">
          <p className="section-label mb-4">Профиль обжарки</p>
          {roastProfileSaveError && <p className="text-sm text-red-600 mb-4">{roastProfileSaveError}</p>}
          {editingProfile !== undefined ? (
            <RoastProfileForm
              lot={lot}
              roaster={roaster}
              initialProfile={editingProfile ?? undefined}
              onSave={handleRoastProfileSave}
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
