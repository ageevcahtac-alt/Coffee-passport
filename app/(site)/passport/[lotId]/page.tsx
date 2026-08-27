'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLots } from '@/lib/data/useLots';
import { getRoasterById } from '@/lib/data/roasters';
import { LotPassport } from '@/components/coffee/LotPassport';
import { ProducerRoasterCard } from '@/components/coffee/ProducerRoasterCard';

export default function LotPassportPage({ params }: { params: { lotId: string } }) {
  const lots = useLots();
  // Lots are seed data merged with anything the roaster cabinet saved to
  // localStorage. The first client render has to match the server snapshot
  // (seed only), so a lot created moments ago in this same browser won't be
  // visible until after hydration — wait for it instead of flashing "not
  // found" for a lot that does exist.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const lot = lots.find((candidate) => candidate.id === params.lotId);
  const roaster = lot ? getRoasterById(lot.roasterId) : undefined;

  if (!mounted) return null;

  if (!lot || !roaster) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl text-ink-900 mb-2">Лот не найден</h1>
        <p className="text-ink-500 text-sm">Проверьте ссылку или отсканируйте другой QR-код.</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col px-6 py-16">
      <LotPassport lot={lot} roaster={roaster} />

      <div className="max-w-md mx-auto w-full mt-10">
        <ProducerRoasterCard lot={lot} />
      </div>

      <div className="max-w-md mx-auto w-full mt-8">
        <Link
          href={`/passport/${lot.id}/taste`}
          className="inline-flex items-center justify-center w-full rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-6 py-4
                     hover:bg-ink-800 transition-colors"
        >
          Я пробую этот кофе
        </Link>
      </div>
    </main>
  );
}
