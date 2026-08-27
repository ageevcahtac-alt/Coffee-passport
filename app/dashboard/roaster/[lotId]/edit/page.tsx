'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLots } from '@/lib/data/useLots';
import { getRoasterById } from '@/lib/data/roasters';
import { saveLot } from '@/lib/data/lotsStore';
import { LotBuilderForm } from '@/components/roaster/LotBuilderForm';
import type { Lot } from '@/lib/types/coffee';

const ACTIVE_ROASTER_ID = 'roaster-xo';

export default function EditLotPage({ params }: { params: { lotId: string } }) {
  const router = useRouter();
  const lots = useLots();
  // The lots list is seed data merged with localStorage, so the very first
  // client render (matching the server snapshot) may not yet include a
  // lot created moments ago — wait for hydration before deciding not found.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const roaster = getRoasterById(ACTIVE_ROASTER_ID);
  const lot = lots.find((candidate) => candidate.id === params.lotId);

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
      </div>
    </main>
  );
}
