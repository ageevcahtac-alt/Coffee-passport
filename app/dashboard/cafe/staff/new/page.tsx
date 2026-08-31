'use client';

import { useRouter } from 'next/navigation';
import { saveStaffMember } from '@/lib/data/cafeStaffStore';
import { StaffForm } from '@/components/cafe/StaffForm';
import { useStaffSession } from '@/lib/auth/staffSession';
import type { StaffMember } from '@/lib/types/coffee';

export default function NewStaffPage() {
  const router = useRouter();
  const { cafeId } = useStaffSession();

  function handleSave(member: StaffMember) {
    saveStaffMember(member);
    router.push('/dashboard/cafe/team');
  }

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
          Команда
        </p>
        <h1 className="font-display text-2xl text-ink-900 mb-8">Новый сотрудник</h1>
        <StaffForm
          shopId={cafeId ?? ''}
          onSave={handleSave}
          onCancel={() => router.push('/dashboard/cafe/team')}
        />
      </div>
    </main>
  );
}
