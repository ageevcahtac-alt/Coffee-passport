'use client';

import { useCafeMenuEntries } from '@/lib/data/useCafeMenu';
import { setMenuLotActive } from '@/lib/data/cafeMenuStore';
import { CountdownTimer } from './CountdownTimer';

// Renders nothing unless this lot is currently 'discontinuing' with a
// scheduled removal date at this shop — the shared condition both
// integration points (BarUpdatesPanel's announcement card, the guest
// passport page) need, kept in one place rather than duplicated.
//
// onExpire optimistically flips isActive off in whichever guest's browser
// happens to be watching — harmless even though it's not the real
// authoritative removal (0017's RLS blocks a non-staff write from actually
// reaching Supabase, so this only ever affects this one local tab's cache,
// self-correcting on the next sync). The real removal is
// cafe_menu_expire_discontinuing(), run daily by
// app/api/cron/cafe-menu-expire — see that migration's own header for why
// a guest's browser can't be the authoritative trigger.
export function LotRemovalCountdown({
  shopId,
  lotId,
  className,
  // 'inline' — bare timer, for embedding inside an already-styled parent
  // (e.g. BarUpdatesPanel's announcement card). 'notice' — wraps itself in
  // a bordered scorch notice box with a label line, for a bare page
  // context that has no such styling of its own (the guest passport page).
  variant = 'inline',
}: {
  shopId: string;
  lotId: string;
  className?: string;
  variant?: 'inline' | 'notice';
}) {
  const entries = useCafeMenuEntries(shopId);
  const entry = entries[lotId];

  if (!entry || !entry.isActive || entry.status !== 'discontinuing' || !entry.scheduledRemovalAt) {
    return null;
  }

  const timer = (
    <CountdownTimer
      targetDate={entry.scheduledRemovalAt}
      onExpire={() => setMenuLotActive(shopId, lotId, false)}
      className={className}
    />
  );

  if (variant === 'inline') return timer;

  return (
    <div className="rounded-md border border-scorch bg-scorch/10 px-4 py-3.5">
      <p className="text-sm text-scorch font-medium mb-1">Этот лот скоро выведут из меню</p>
      {timer}
    </div>
  );
}
