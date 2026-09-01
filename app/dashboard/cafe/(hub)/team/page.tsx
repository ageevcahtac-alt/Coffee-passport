'use client';

import Link from 'next/link';
import { useCafeStaff } from '@/lib/data/useCafeStaff';
import { useShopCheckins } from '@/lib/data/useShopCheckins';
import { StaffCard } from '@/components/cafe/StaffCard';
import { useStaffSession } from '@/lib/auth/staffSession';

export default function CafeTeamPage() {
  const { cafeId } = useStaffSession();
  const allStaff = useCafeStaff();
  const { records } = useShopCheckins(cafeId ?? '');
  const team = allStaff
    .filter((member) => member.shopId === cafeId)
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-8">
        <p className="section-label flex-1">Команда</p>
        <Link
          href="/dashboard/cafe/staff/new"
          className="inline-flex items-center justify-center rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-5 py-3
                     hover:bg-ink-800 transition-colors shrink-0"
        >
          + Добавить сотрудника
        </Link>
      </div>

      {team.length === 0 ? (
        <p className="text-ink-500 text-sm">Пока нет ни одного сотрудника в команде.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {team.map((member) => {
            const rated = records.filter(
              (record) => record.baristaId === member.id && record.baristaRating > 0
            );
            const averageRating =
              rated.length > 0
                ? rated.reduce((sum, record) => sum + record.baristaRating, 0) / rated.length
                : 0;
            return (
              <StaffCard
                key={member.id}
                member={member}
                averageRating={averageRating}
                ratingCount={rated.length}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
