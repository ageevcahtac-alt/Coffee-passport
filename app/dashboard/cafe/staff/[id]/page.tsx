'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCafeStaff } from '@/lib/data/useCafeStaff';
import { STAFF_ROLE_LABELS } from '@/lib/types/coffee';
import { formatDate } from '@/lib/utils/date';
import { StaffAvatar } from '@/components/cafe/StaffAvatar';
import { StaffRatingPanel } from '@/components/cafe/StaffRatingPanel';

export default function StaffDetailPage({ params }: { params: { id: string } }) {
  const staff = useCafeStaff();
  // Staff list is seed data merged with localStorage, so the very first
  // client render (matching the server snapshot) may not yet include a
  // member added moments ago — wait for hydration before deciding not found.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const member = staff.find((candidate) => candidate.id === params.id);

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
        <div className="flex items-start gap-4 mb-8">
          <StaffAvatar name={member.name} size="lg" />
          <div className="flex-1">
            <h1 className="font-display text-2xl text-ink-900 leading-tight">{member.name}</h1>
            <span
              className="inline-block rounded-full border border-gold-400 text-gold-500 text-[11px]
                         uppercase tracking-widest2 px-2.5 py-1 mt-2"
            >
              {STAFF_ROLE_LABELS[member.role]}
            </span>
          </div>
        </div>

        <p className="section-label mb-4">Личные данные</p>
        <dl className="flex flex-col gap-4 mb-10 text-sm">
          <div>
            <dt className="text-xs text-ink-400 mb-1">Дата приёма на работу</dt>
            <dd className="data-value text-ink-900">
              {member.hireDate ? formatDate(member.hireDate) : 'Не указана'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400 mb-1">Заслуги / Достижения</dt>
            <dd className="text-ink-700">{member.achievements || 'Пока не заполнено.'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400 mb-1">Интересы / Хобби</dt>
            <dd className="text-ink-700">{member.hobbies || 'Пока не заполнено.'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400 mb-1">Лидерские качества</dt>
            <dd className="text-ink-700">{member.leadershipQualities || 'Пока не заполнено.'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400 mb-1">От руководителя</dt>
            <dd className="text-ink-700">{member.managerNote || 'Пока не заполнено.'}</dd>
          </div>
        </dl>

        <StaffRatingPanel staffId={member.id} />

        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-10">
          <Link
            href={`/dashboard/cafe/staff/${member.id}/edit`}
            className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
          >
            Редактировать
          </Link>
          <Link
            href="/dashboard/cafe/team"
            className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
          >
            ← Назад к команде
          </Link>
        </div>
      </div>
    </main>
  );
}
