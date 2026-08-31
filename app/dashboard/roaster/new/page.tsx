'use client';

import { useRouter } from 'next/navigation';
import { getRoasterById } from '@/lib/data/roasters';
import { saveLot } from '@/lib/data/lotsStore';
import { LotBuilderForm } from '@/components/roaster/LotBuilderForm';
import { useStaffSession } from '@/lib/auth/staffSession';
import type { Lot } from '@/lib/types/coffee';

export default function NewLotPage() {
  const router = useRouter();
  const { roasterId } = useStaffSession();
  const roaster = roasterId ? getRoasterById(roasterId) : undefined;

  if (!roaster) return null;

  function handleSave(lot: Lot) {
    saveLot(lot);
    router.push('/dashboard/roaster');
  }

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
          {roaster.name}
        </p>
        <h1 className="font-display text-2xl text-ink-900 mb-8">Новый лот</h1>
        <LotBuilderForm
          roaster={roaster}
          onSave={handleSave}
          onCancel={() => router.push('/dashboard/roaster')}
        />
      </div>
    </main>
  );
}
