import Link from 'next/link';
import { STAFF_ROLE_LABELS, type StaffMember } from '@/lib/types/coffee';
import { StaffAvatar } from './StaffAvatar';

export function StaffCard({
  member,
  averageRating,
  ratingCount,
}: {
  member: StaffMember;
  averageRating: number;
  ratingCount: number;
}) {
  return (
    <Link
      href={`/dashboard/cafe/staff/${member.id}`}
      className="flex flex-col items-center text-center rounded-md border border-ink-200
                 bg-parchment-100 p-6 hover:border-gold-400 transition-colors"
    >
      <StaffAvatar name={member.name} size="lg" />
      <h3 className="font-display text-lg text-ink-900 leading-tight mt-4">{member.name}</h3>
      <span
        className="rounded-full border border-gold-400 text-gold-500 text-[11px]
                   uppercase tracking-widest2 px-2.5 py-1 mt-2"
      >
        {STAFF_ROLE_LABELS[member.role]}
      </span>
      {ratingCount > 0 && (
        <p className="data-value text-xs text-ink-400 mt-3">
          ★ {averageRating.toFixed(1)} · {ratingCount} оценок
        </p>
      )}
    </Link>
  );
}
