'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/auth/currentUser';
import { useCustomCoffees } from '@/lib/data/useCustomCoffees';
import { useCustomCoffeeCuppings } from '@/lib/data/useCustomCoffeeCuppings';
import { deleteCustomCoffee, updateCustomCoffee } from '@/lib/data/customCoffeeStore';
import {
  addCustomCoffeeCupping,
  deleteCuppingsForCoffee,
  deleteCustomCoffeeCupping,
} from '@/lib/data/customCoffeeCuppingsStore';
import { computeCuppingScore } from '@/lib/utils/cuppingScore';
import { formatDate } from '@/lib/utils/date';
import { CustomCoffeeForm, type CustomCoffeeFormValues } from '@/components/kitchen/CustomCoffeeForm';
import { CustomCoffeeCuppingForm, type CustomCoffeeCuppingFormValues } from '@/components/kitchen/CustomCoffeeCuppingForm';
import { CustomCoffeeCuppingCard } from '@/components/kitchen/CustomCoffeeCuppingCard';

// Sits outside the (hub) tab group, same reason as the cafe dashboard's
// [lotId]/edit page — a drill-down into one shelf item shouldn't carry the
// "Мой кофе / Мои рецепты" tabs above it.
export default function CustomCoffeeDetailPage({ params }: { params: { coffeeId: string } }) {
  const router = useRouter();
  const { userId, ready } = useCurrentUser();
  const coffee = useCustomCoffees().find((c) => c.id === params.coffeeId && c.userId === userId);
  const cuppings = useCustomCoffeeCuppings()
    .filter((c) => c.customCoffeeId === params.coffeeId && c.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const [editing, setEditing] = useState(false);
  const [cuppingFormOpen, setCuppingFormOpen] = useState(false);

  if (!ready || !userId) return null;
  if (!coffee) {
    return (
      <main className="min-h-dvh px-6 py-16 text-center">
        <p className="text-sm text-ink-500 mb-4">Это зерно не найдено на вашей полке.</p>
        <Link href="/coffee-kitchen" className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900">
          ← Кофейная кухня
        </Link>
      </main>
    );
  }

  function handleSaveMeta(values: CustomCoffeeFormValues) {
    updateCustomCoffee(coffee!.id, values);
    setEditing(false);
  }

  function handleDeleteCoffee() {
    deleteCuppingsForCoffee(coffee!.id);
    deleteCustomCoffee(coffee!.id);
    router.push('/coffee-kitchen');
  }

  function handleSaveCupping(values: CustomCoffeeCuppingFormValues) {
    if (!userId) return;
    addCustomCoffeeCupping(
      { ...values, customCoffeeId: coffee!.id, cuppingScore: computeCuppingScore(values.sensory) },
      userId
    );
    setCuppingFormOpen(false);
  }

  const origin = [coffee.region, coffee.farm].filter(Boolean).join(' · ');

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        {editing ? (
          <>
            <p className="section-label mb-6">Редактировать зерно</p>
            <CustomCoffeeForm initial={coffee} onSave={handleSaveMeta} onCancel={() => setEditing(false)} />
          </>
        ) : (
          <>
            {coffee.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- data: URL, not a Next-optimizable local asset
              <img
                src={coffee.photoUrl}
                alt={coffee.lotName}
                className="w-full aspect-[4/3] object-cover rounded-md border border-ink-200 mb-6"
              />
            )}
            <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
              {coffee.roasterName || 'Обжарщик не указан'}
            </p>
            <h1 className="font-display text-3xl text-ink-900 mb-2">{coffee.lotName}</h1>
            {origin && <p className="text-sm text-ink-700 mb-1">{origin}</p>}
            {coffee.purchaseLocation && <p className="text-sm text-ink-400 mb-6">📍 {coffee.purchaseLocation}</p>}

            {(coffee.roastDate || coffee.variety || coffee.process || coffee.altitude) && (
              <dl className="grid grid-cols-2 gap-3 text-sm mb-6">
                {coffee.roastDate && (
                  <div>
                    <dt className="text-xs text-ink-400">Дата обжарки</dt>
                    <dd className="data-value text-ink-900">{formatDate(coffee.roastDate)}</dd>
                  </div>
                )}
                {coffee.variety && (
                  <div>
                    <dt className="text-xs text-ink-400">Сорт</dt>
                    <dd className="text-ink-900">{coffee.variety}</dd>
                  </div>
                )}
                {coffee.process && (
                  <div>
                    <dt className="text-xs text-ink-400">Обработка</dt>
                    <dd className="text-ink-900">{coffee.process}</dd>
                  </div>
                )}
                {coffee.altitude && (
                  <div>
                    <dt className="text-xs text-ink-400">Высота</dt>
                    <dd className="data-value text-ink-900">{coffee.altitude}</dd>
                  </div>
                )}
              </dl>
            )}

            {coffee.notes && <p className="text-sm text-ink-700 leading-relaxed mb-6">{coffee.notes}</p>}

            <div className="flex items-center gap-4 mb-10">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900"
              >
                Редактировать
              </button>
              <button
                type="button"
                onClick={handleDeleteCoffee}
                className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900"
              >
                Удалить с полки
              </button>
            </div>

            {!cuppingFormOpen && (
              <button
                type="button"
                onClick={() => setCuppingFormOpen(true)}
                className="inline-flex items-center justify-center w-full rounded-md bg-ink-900
                           text-parchment-100 font-body font-medium text-sm px-6 py-4 mb-10
                           hover:bg-ink-800 transition-colors"
              >
                + Оценить (каппинг)
              </button>
            )}

            {cuppingFormOpen && (
              <div className="mb-10 reveal-fade">
                <CustomCoffeeCuppingForm onSave={handleSaveCupping} onCancel={() => setCuppingFormOpen(false)} />
              </div>
            )}

            <p className="section-label mb-4">История оценок</p>
            {cuppings.length === 0 ? (
              <p className="text-sm text-ink-400 mb-8">Пока не оценено — начните с первой каппинг-сессии выше.</p>
            ) : (
              <div className="flex flex-col gap-3 mb-8">
                {cuppings.map((cupping) => (
                  <CustomCoffeeCuppingCard
                    key={cupping.id}
                    cupping={cupping}
                    onDelete={() => deleteCustomCoffeeCupping(cupping.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        <Link href="/coffee-kitchen" className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900">
          ← Мой кофе
        </Link>
      </div>
    </main>
  );
}
