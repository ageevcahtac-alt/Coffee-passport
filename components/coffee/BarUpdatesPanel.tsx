'use client';

import Link from 'next/link';
import {
  useVisitedShopIds,
  useLotNotifications,
  useLotNotificationActions,
  describeLotNotification,
  lotNotificationHref,
  type LotNotificationItem,
} from '@/lib/notifications/useLotNotifications';
import { openNotificationCenter } from '@/lib/notifications/centerControl';
import { LotRemovalCountdown } from './LotRemovalCountdown';

const PREVIEW_LIMIT = 3;

// "Обновления на баре" — the guest-facing side of a cafe's lot lifecycle
// status (see components/cafe/LotStatusControl.tsx). Unified Notification/
// Event Center pass: this is now a PREVIEW only — see lib/notifications/
// useLotNotifications.ts for the shared derivation both this card and the
// full center read from, so they can never disagree about what exists.
//
// Previously this rendered every announcement with no cap at all (the
// opposite scaling problem from "only 4 preview cards" — a guest who'd
// checked into 20 cafes got 20 permanently-stacked cards), and its × button
// called muteShop(), which silences that shop's announcements FOREVER —
// so closing one card for a shop with two announcements closed both, and
// there was no way to dismiss just one occurrence without losing all
// future ones too. Now × calls dismiss() (lib/data/lotNotificationReadsStore.ts),
// which hides exactly this one occurrence from THIS preview only — it
// never touches the persistent record in the full center, and never mutes
// the shop. Muting a whole shop's announcements is still available from
// its own page ("Отписаться от обновлений этой кофейни", per
// lib/data/shopMutePreferencesStore.ts) — a separate, heavier action from
// dismissing one card.
export function BarUpdatesPanel() {
  const visitedShopIds = useVisitedShopIds();
  const actions = useLotNotificationActions();
  const items = useLotNotifications(visitedShopIds).filter((item) => !item.dismissed);

  if (items.length === 0) return null;

  const visible = items.slice(0, PREVIEW_LIMIT);
  const remaining = items.length - visible.length;

  return (
    <div className="max-w-md mx-auto w-full mb-6">
      <p className="section-label mb-4">Обновления на баре</p>
      <div className="flex flex-col gap-3">
        {visible.map((item) => (
          <AnnouncementCard key={item.key} item={item} onOpen={actions.markRead} onDismiss={actions.dismiss} />
        ))}
      </div>
      {(remaining > 0 || items.length > 0) && (
        <button
          type="button"
          onClick={() => openNotificationCenter('lots')}
          className="mt-3 text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900"
        >
          {remaining > 0 ? `Ещё ${remaining} в центре уведомлений →` : 'Все уведомления →'}
        </button>
      )}
    </div>
  );
}

function AnnouncementCard({
  item,
  onOpen,
  onDismiss,
}: {
  item: LotNotificationItem;
  onOpen: (item: LotNotificationItem) => void;
  onDismiss: (item: LotNotificationItem) => void;
}) {
  const isNew = item.status === 'new';

  return (
    <div
      className={`relative rounded-md border-2 px-4 py-3.5 text-sm font-medium ${
        isNew ? 'border-moss-500 bg-moss-100 text-moss-700' : 'border-scorch bg-scorch/10 text-scorch'
      }`}
    >
      <button
        type="button"
        onClick={() => onDismiss(item)}
        aria-label="Скрыть это уведомление"
        title="Скрыть это уведомление"
        className="absolute top-0.5 right-0.5 text-current opacity-60 hover:opacity-100 leading-none
                   text-base w-9 h-9 flex items-center justify-center"
      >
        ×
      </button>

      <Link href={lotNotificationHref(item)} onClick={() => onOpen(item)} className="block pr-7 hover:opacity-90 transition-opacity">
        {describeLotNotification(item)}
        {!isNew && (
          <div className="mt-1.5">
            <LotRemovalCountdown shopId={item.shopId} lotId={item.lot.id} />
          </div>
        )}
      </Link>
    </div>
  );
}
