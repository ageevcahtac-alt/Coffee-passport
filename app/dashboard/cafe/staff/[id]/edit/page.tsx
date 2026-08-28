'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCafeStaff } from '@/lib/data/useCafeStaff';
import { saveStaffMember } from '@/lib/data/cafeStaffStore';
import { StaffForm } from '@/components/cafe/StaffForm';
import type { StaffMember } from '@/lib/types/coffee';

export default function EditStaffPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const staff = useCafeStaff();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const member = staff.find((candidate) => candidate.id === params.id);

  function handleSave(updated: StaffMember) {
    saveStaffMember(updated);
    router.push(`/dashboard/cafe/staff/${updated.id}`);
  }

  if (!member) {
    if (!mounted) return null;
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl text-ink-900 mb-2">Сотрудник не найден</h1>
        <p className="text-ink-500 text-sm">Возможно, карточка была удалена или ссылка неверна.</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
          {member.name}
        </p>
        <h1 className="font-display text-2xl text-ink-900 mb-8">Редактировать карточку</h1>
        <StaffForm
          shopId={member.shopId}
          initialStaff={member}
          onSave={handleSave}
          onCancel={() => router.push(`/dashboard/cafe/staff/${member.id}`)}
        />
      </div>
    </main>
  );
}
