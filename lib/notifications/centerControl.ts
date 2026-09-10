'use client';

// Tiny shared open/close/active-tab store for the Notification Center
// (components/shared/NotificationCenter.tsx) — same subscribe/listener
// idiom as every local store in lib/data/*, just in-memory only (UI state,
// never persisted). Lets "Все уведомления"/"Все мероприятия" links inside
// BarUpdatesPanel and EventsBoard open the one shared center (mounted once
// in Navbar) on the right tab, instead of each block growing its own
// duplicate popover.

export type NotificationCenterTab = 'lots' | 'events';

interface CenterState {
  isOpen: boolean;
  activeTab: NotificationCenterTab;
}

let state: CenterState = { isOpen: false, activeTab: 'lots' };
const listeners = new Set<() => void>();

function set(next: Partial<CenterState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): CenterState {
  return state;
}

export function getServerSnapshot(): CenterState {
  return { isOpen: false, activeTab: 'lots' };
}

export function openNotificationCenter(tab: NotificationCenterTab = 'lots'): void {
  set({ isOpen: true, activeTab: tab });
}

export function closeNotificationCenter(): void {
  set({ isOpen: false });
}

export function setNotificationCenterTab(tab: NotificationCenterTab): void {
  set({ activeTab: tab });
}

// Focus management (section 19: keyboard/focus) — whichever bell button
// actually opened the panel (desktop or mobile; only one is ever visible
// at a time) gets focus back when the panel closes, instead of focus
// silently dropping to <body>. A plain module variable, not React state:
// this is a DOM-focus convenience, never rendered from, never persisted.
let lastTriggerEl: HTMLElement | null = null;
export function setLastNotificationTrigger(el: HTMLElement | null): void {
  lastTriggerEl = el;
}
export function focusLastNotificationTrigger(): void {
  lastTriggerEl?.focus();
}
