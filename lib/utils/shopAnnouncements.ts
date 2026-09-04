import type { CafeMenuEntry } from '@/lib/data/cafeMenuStore';
import type { Lot, LotMenuStatus } from '@/lib/types/coffee';

// Announcements are derived, not stored — status IS the announcement.
// "Обновления на баре" (see components/coffee/BarUpdatesPanel.tsx) filters
// a shop's active menu entries down to the two non-default statuses.
export interface ShopAnnouncement {
  lot: Lot;
  status: Extract<LotMenuStatus, 'new' | 'discontinuing'>;
}

export function getShopAnnouncements(
  menuLots: Lot[],
  entries: Record<string, CafeMenuEntry>
): ShopAnnouncement[] {
  const announcements: ShopAnnouncement[] = [];
  for (const lot of menuLots) {
    const entry = entries[lot.id];
    if (!entry || !entry.isActive) continue;
    if (entry.status === 'new' || entry.status === 'discontinuing') {
      announcements.push({ lot, status: entry.status });
    }
  }
  return announcements;
}
