'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useCurrentUser } from '@/lib/auth/currentUser';
import {
  subscribe as subscribeCenter,
  getSnapshot as getCenterSnapshot,
  getServerSnapshot as getCenterServerSnapshot,
  openNotificationCenter,
  closeNotificationCenter,
  setNotificationCenterTab,
  setLastNotificationTrigger,
  focusLastNotificationTrigger,
  type NotificationCenterTab,
} from '@/lib/notifications/centerControl';
import {
  useVisitedShopIds,
  useLotNotifications,
  useUnreadLotNotificationCount,
  useLotNotificationActions,
  describeLotNotification,
  lotNotificationHref,
  type LotAnnouncementItem,
  type LotNotificationItem,
} from '@/lib/notifications/useLotNotifications';
import { useNotificationPreferences } from '@/lib/data/useNotificationPreferences';
import { setNewLotNotificationsEnabled } from '@/lib/data/notificationPreferencesStore';
import { formatTastingDate } from '@/lib/utils/date';
import { LOT_MENU_STATUS_LABELS, LOT_MENU_STATUS_ACCENT } from '@/lib/types/coffee';
import { EventsBoard } from '@/components/coffee/EventsBoard';
import { BellIcon } from './BellIcon';

const LOTS_PAGE_SIZE = 20;

const STATUS_ACCENT_CLASSES: Record<'moss' | 'scorch', string> = {
  moss: 'text-moss-700 bg-moss-100 border-moss-500',
  scorch: 'text-scorch bg-scorch/10 border-scorch',
};

function useCenterState() {
  return useSyncExternalStore(subscribeCenter, getCenterSnapshot, getCenterServerSnapshot);
}

// One bell trigger — mounted twice (desktop nav row, mobile top bar), both
// driving the single shared panel below via lib/notifications/centerControl.
// Enthusiast-only: gated on a real signed-in session, same condition
// Navbar already uses for the Journey/Loyalty links, since the Center's
// NEW_CAFE_LOT half only has anything persistent to show for an account
// (see lib/data/lotNotificationReadsStore.ts's header comment).
export function NotificationBell({ className = '' }: { className?: string }) {
  const { isAuthenticated, ready } = useCurrentUser();
  const visitedShopIds = useVisitedShopIds();
  const unread = useUnreadLotNotificationCount(visitedShopIds);
  const { isOpen } = useCenterState();
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!ready || !isAuthenticated) return null;

  const badge = unread > 99 ? '99+' : unread > 0 ? String(unread) : null;

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => {
        setLastNotificationTrigger(buttonRef.current);
        openNotificationCenter('lots');
      }}
      aria-haspopup="dialog"
      aria-controls="notification-center-panel"
      aria-expanded={isOpen}
      aria-label={badge ? `Уведомления, непрочитанных: ${badge}` : 'Уведомления'}
      className={`relative inline-flex items-center justify-center w-9 h-9 rounded-md text-ink-500
                  hover:text-ink-900 hover:bg-parchment-300 transition-colors shrink-0 ${className}`}
    >
      <BellIcon className="w-5 h-5" />
      {badge && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-ink-900
                     text-parchment-100 text-[10px] leading-4 text-center font-medium"
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function relativeAccent(status: LotAnnouncementItem['status']) {
  const accent = LOT_MENU_STATUS_ACCENT[status];
  return accent ? STATUS_ACCENT_CLASSES[accent] : 'text-ink-500 bg-parchment-200 border-ink-200';
}

function LotNotificationRow({
  item,
  onOpen,
}: {
  item: LotNotificationItem;
  onOpen: (item: LotNotificationItem) => void;
}) {
  return (
    <Link
      href={lotNotificationHref(item)}
      onClick={() => onOpen(item)}
      className="flex items-start gap-3 py-3 border-t border-ink-100 first:border-t-0 first:pt-0 group"
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${item.read ? 'bg-transparent' : 'bg-ink-900'}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${relativeAccent(item.status)}`}>
            {LOT_MENU_STATUS_LABELS[item.status]}
          </span>
          <span className="text-[11px] text-ink-300">{formatTastingDate(item.statusChangedAt)}</span>
        </div>
        <p className={`text-sm leading-snug ${item.read ? 'text-ink-500' : 'text-ink-900 font-medium'}`}>
          {describeLotNotification(item)}
        </p>
      </div>
    </Link>
  );
}

function LotsTab({ visitedShopIds }: { visitedShopIds: string[] }) {
  const { userId } = useCurrentUser();
  const items = useLotNotifications(visitedShopIds);
  const actions = useLotNotificationActions();
  const preferences = useNotificationPreferences();
  const [visibleCount, setVisibleCount] = useState(LOTS_PAGE_SIZE);

  const notifyEnabled = useMemo(() => {
    const pref = preferences.find((record) => record.userId === userId);
    return pref ? pref.notifyNewLots : true;
  }, [preferences, userId]);

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);
  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  return (
    <div className="flex flex-col">
      {unreadCount > 0 && (
        <button
          type="button"
          onClick={() => actions.markAllRead(items)}
          className="self-end mb-3 text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900"
        >
          Отметить всё как прочитанное
        </button>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-ink-400 py-6 text-center">
          {notifyEnabled
            ? 'Пока нет новых лотов в кофейнях, которые вы посещали.'
            : 'Уведомления о новых лотах выключены в настройках ниже.'}
        </p>
      ) : (
        <>
          <div className="flex flex-col">
            {visibleItems.map((item) => (
              <LotNotificationRow key={item.key} item={item} onOpen={actions.markRead} />
            ))}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + LOTS_PAGE_SIZE)}
              className="mt-4 inline-flex items-center justify-center rounded-md border border-ink-200
                         text-ink-700 font-body font-medium text-sm px-5 py-2.5 self-center
                         hover:bg-parchment-300 transition-colors"
            >
              Показать ещё
            </button>
          )}
        </>
      )}

      <label className="flex items-start gap-3 rounded-md border border-ink-200 bg-parchment-100 p-4 mt-6 cursor-pointer">
        <input
          type="checkbox"
          checked={notifyEnabled}
          onChange={(event) => userId && setNewLotNotificationsEnabled(userId, event.target.checked, true)}
          className="mt-0.5 h-4 w-4 accent-current text-gold-500 shrink-0"
        />
        <span className="text-xs text-ink-700 leading-relaxed">
          Уведомлять о новых лотах в кофейнях
        </span>
      </label>
    </div>
  );
}

// The single shared panel — mounted once (see components/shared/Navbar.tsx),
// driven entirely by lib/notifications/centerControl.ts so either bell (or
// EventsBoard's "Все мероприятия" link) can open it on the right tab. Not
// gated on authentication itself: the Events tab is public data an
// anonymous guest can also reach via that link (see EventsBoard's preview
// mode), so only the bell trigger — not this panel — is Enthusiast-only.
export function NotificationCenterPanel() {
  const { isOpen, activeTab } = useCenterState();
  const visitedShopIds = useVisitedShopIds();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeNotificationCenter();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      panelRef.current?.focus();
    } else {
      focusLastNotificationTrigger();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function selectTab(tab: NotificationCenterTab) {
    setNotificationCenterTab(tab);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40"
      onClick={() => closeNotificationCenter()}
    >
      <div
        id="notification-center-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Уведомления"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90dvh] flex flex-col rounded-t-md sm:rounded-md bg-parchment-100 reveal-fade"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 shrink-0">
          <h2 className="font-display text-xl text-ink-900">Уведомления</h2>
          <button
            type="button"
            onClick={() => closeNotificationCenter()}
            aria-label="Закрыть"
            className="text-ink-400 text-2xl leading-none shrink-0 w-11 h-11 -mr-2 -mt-2 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <div role="tablist" aria-label="Тип уведомлений" className="flex gap-1 px-6 pb-4 shrink-0">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'lots'}
            onClick={() => selectTab('lots')}
            className={`px-3 py-2 text-sm rounded-md transition-colors ${
              activeTab === 'lots' ? 'bg-ink-900 text-parchment-100' : 'text-ink-500 hover:bg-parchment-300'
            }`}
          >
            Новые лоты
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'events'}
            onClick={() => selectTab('events')}
            className={`px-3 py-2 text-sm rounded-md transition-colors ${
              activeTab === 'events' ? 'bg-ink-900 text-parchment-100' : 'text-ink-500 hover:bg-parchment-300'
            }`}
          >
            События
          </button>
        </div>

        <div className="px-6 pb-6 overflow-y-auto flex-1">
          {activeTab === 'lots' ? <LotsTab visitedShopIds={visitedShopIds} /> : <EventsBoard fullHeight={false} mode="full" />}
        </div>
      </div>
    </div>
  );
}
