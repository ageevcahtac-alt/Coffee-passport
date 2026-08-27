'use client';

import { useJourney } from '@/lib/journey/useJourney';
import { CoffeeJourney } from '@/components/coffee/CoffeeJourney';

export default function JourneyPage() {
  const records = useJourney();

  return (
    <main className="min-h-dvh flex flex-col px-6 py-16">
      <div className="max-w-md mx-auto w-full mb-10">
        <h1 className="font-display text-3xl leading-[1.1] text-ink-900 mb-2">
          Моё кофейное путешествие
        </h1>
        <p className="text-ink-500 text-sm">
          Каждая чашка — со своим контекстом: кофейня и способ приготовления.
        </p>
      </div>

      <CoffeeJourney records={records} />
    </main>
  );
}
