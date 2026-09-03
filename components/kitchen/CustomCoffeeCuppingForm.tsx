'use client';

import { useState } from 'react';
import type { SensoryEvaluationValues } from '@/lib/types/coffee';
import type { CustomCoffeeCupping } from '@/lib/types/kitchen';
import { TastingForm } from '@/components/coffee/TastingForm';
import { BrewingParamsFields, emptyBrewingParams, type BrewingParamsValues } from './BrewingParamsFields';

export type CustomCoffeeCuppingFormValues = Omit<
  CustomCoffeeCupping,
  'id' | 'userId' | 'createdAt' | 'customCoffeeId' | 'cuppingScore'
>;

// The reusable cupping engine, isolated-mode: brewing parameters (same
// fields as "Мои рецепты") sit above the exact same sensory-evaluation
// component the public blind-cupping flow uses
// (components/coffee/TastingForm.tsx) — nothing here is catalog-aware, so
// reusing it for a UserCustomCoffee needed no changes to that component at
// all beyond the optional onCancel prop it already gained. TastingForm's
// own submit button is the single save action for this whole combined
// form — the brewing fields above it are just lifted state captured at
// that moment.
export function CustomCoffeeCuppingForm({
  onSave,
  onCancel,
}: {
  onSave: (values: CustomCoffeeCuppingFormValues) => void;
  onCancel?: () => void;
}) {
  const [brewing, setBrewing] = useState<BrewingParamsValues>(emptyBrewingParams());

  function handleSensorySave(sensory: SensoryEvaluationValues) {
    onSave({
      brewingMethod: brewing.brewingMethod ?? 'custom',
      grinderModel: brewing.grinderModel.trim(),
      doseG: Number(brewing.doseG) || 0,
      waterG: Number(brewing.waterG) || 0,
      waterTempC: Number(brewing.waterTempC) || 0,
      waterMineralization: brewing.waterMineralization.trim(),
      grindSetting: brewing.grindSetting.trim(),
      brewTimeSec: brewing.brewTimeSec.trim() ? Number(brewing.brewTimeSec) : null,
      preInfusionSec: brewing.preInfusionSec.trim() ? Number(brewing.preInfusionSec) : null,
      sensory,
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <BrewingParamsFields value={brewing} onChange={setBrewing} idPrefix="cc-cupping" />
      <TastingForm onSave={handleSensorySave} onCancel={onCancel} submitLabel="Сохранить каппинг" />
    </div>
  );
}
