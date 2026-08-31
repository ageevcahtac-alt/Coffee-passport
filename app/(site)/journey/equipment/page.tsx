'use client';

import Link from 'next/link';
import { HOME_GRINDER_MODELS, ESPRESSO_MACHINE_MODELS } from '@/lib/types/coffee';
import { useCurrentUser } from '@/lib/auth/currentUser';
import { EquipmentGarage } from '@/components/coffee/EquipmentGarage';

const CURRENT_USER_NAME = 'Вы';

export default function EquipmentGaragePage() {
  const { userId, ready } = useCurrentUser();
  if (!ready || !userId) return null;

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">{CURRENT_USER_NAME}</p>
        <h1 className="font-display text-2xl text-ink-900 mb-2">Мой гараж</h1>
        <p className="text-sm text-ink-500 mb-8">
          Сохранённый сетап подставляется автоматически при записи нового рецепта — выберите способ приготовления,
          и поля кофемолки/машины/воды заполнятся сами.
        </p>

        <EquipmentGarage
          ownerId={userId}
          ownerName={CURRENT_USER_NAME}
          grinderOptions={HOME_GRINDER_MODELS}
          machineOptions={ESPRESSO_MACHINE_MODELS}
        />

        <Link href="/journey" className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900 mt-8 inline-block">
          ← Моё кофейное путешествие
        </Link>
      </div>
    </main>
  );
}
