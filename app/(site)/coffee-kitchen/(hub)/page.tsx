'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/auth/currentUser';
import { useCustomCoffees } from '@/lib/data/useCustomCoffees';
import { useCustomCoffeeCuppings } from '@/lib/data/useCustomCoffeeCuppings';
import { addCustomCoffee } from '@/lib/data/customCoffeeStore';
import { CustomCoffeeForm, type CustomCoffeeFormValues } from '@/components/kitchen/CustomCoffeeForm';
import { CustomCoffeeCard } from '@/components/kitchen/CustomCoffeeCard';
import { AddCustomCoffeeCard } from '@/components/kitchen/AddCustomCoffeeCard';

export default function MyCoffeeShelfPage() {
  const router = useRouter();
  const { userId, ready } = useCurrentUser();
  const coffees = useCustomCoffees().filter((coffee) => coffee.userId === userId);
  const cuppings = useCustomCoffeeCuppings().filter((cupping) => cupping.userId === userId);
  const [formOpen, setFormOpen] = useState(false);

  if (!ready || !userId) return null;

  function handleSave(values: CustomCoffeeFormValues) {
    if (!userId) return;
    const created = addCustomCoffee(values, userId);
    setFormOpen(false);
    router.push(`/coffee-kitchen/${created.id}`);
  }

  return (
    <div>
      {formOpen ? (
        <div className="mb-10 reveal-fade">
          <CustomCoffeeForm onSave={handleSave} onCancel={() => setFormOpen(false)} />
        </div>
      ) : (
        <>
          <p className="section-label mb-4">Полка зерна</p>
          {coffees.length === 0 ? (
            <p className="text-sm text-ink-400 mb-6">
              Здесь появится зерно, которое не отсканировать в кофейне — редкие микролоты, привезённые с фестивалей
              и поездок.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {coffees.map((coffee) => (
              <CustomCoffeeCard
                key={coffee.id}
                coffee={coffee}
                cuppingCount={cuppings.filter((c) => c.customCoffeeId === coffee.id).length}
                onClick={() => router.push(`/coffee-kitchen/${coffee.id}`)}
              />
            ))}
            <AddCustomCoffeeCard onClick={() => setFormOpen(true)} />
          </div>
        </>
      )}
    </div>
  );
}
