import type { CafeMenuEntry } from '@/lib/data/cafeMenuStore';
import type { Lot, LotMenuStatus } from '@/lib/types/coffee';

// Announcements are derived, not stored — status IS the announcement.
// "Обновления на баре" (see components/coffee/BarUpdatesPanel.tsx) filters
// a shop's active menu entries down to the two non-default statuses.
export interface ShopAnnouncement {
  lot: Lot;
  status: Extract<LotMenuStatus, 'new' | 'discontinuing'>;
}

// TTL for a "new lot" announcement — spec: "Уведомление о новом лоте имеет
// временной лимит (TTL = 7 дней по умолчанию с момента создания)". Measured
// from statusChangedAt, which setMenuLotStatus stamps fresh every time
// status actually changes (so re-marking a lot 'new' later resets the
// clock, same as a genuinely new announcement would). 'discontinuing' has
// no TTL of its own — its own lifecycle is scheduledRemovalAt/the
// countdown, not a fixed window.
const NEW_ANNOUNCEMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getShopAnnouncements(
  menuLots: Lot[],
  entries: Record<string, CafeMenuEntry>
): ShopAnnouncement[] {
  const announcements: ShopAnnouncement[] = [];
  for (const lot of menuLots) {
    const entry = entries[lot.id];
    if (!entry || !entry.isActive) continue;

    if (entry.status === 'new') {
      const ageMs = Date.now() - new Date(entry.statusChangedAt).getTime();
      if (ageMs < NEW_ANNOUNCEMENT_TTL_MS) {
        announcements.push({ lot, status: 'new' });
      }
    } else if (entry.status === 'discontinuing') {
      announcements.push({ lot, status: 'discontinuing' });
    }
  }
  return announcements;
}
