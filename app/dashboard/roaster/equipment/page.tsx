'use client';

import Link from 'next/link';
import { PRO_GRINDER_MODELS, ESPRESSO_MACHINE_MODELS } from '@/lib/types/coffee';
import { getRoasterById } from '@/lib/data/roasters';
import { EquipmentGarage } from '@/components/coffee/EquipmentGarage';

// No real roaster auth wired up yet — same pilot-roaster scoping as the
// rest of app/dashboard/roaster/*.
const ACTIVE_ROASTER_ID = 'roaster-xo';

export default function RoasterEquipmentPage() {
  const roaster = getRoasterById(ACTIVE_ROASTER_ID);

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
          {roaster?.name ?? 'Обжарщик'}
        </p>
        <h1 className="font-display text-2xl text-ink-900 mb-2">Гараж ростерии</h1>
        <p className="text-sm text-ink-500 mb-8">
          Эталонный сетап обжарочной — ориентир для бенчмарк-рецептов, которые вы публикуете к лотам.
        </p>

        <EquipmentGarage
          ownerId={ACTIVE_ROASTER_ID}
          ownerName={roaster?.name ?? 'Обжарщик'}
          grinderOptions={PRO_GRINDER_MODELS}
          machineOptions={ESPRESSO_MACHINE_MODELS}
        />

        <Link href="/dashboard/roaster" className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900 mt-8 inline-block">
          ← Лоты
        </Link>
      </div>
    </main>
  );
}
