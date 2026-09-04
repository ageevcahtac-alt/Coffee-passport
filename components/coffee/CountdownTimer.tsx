'use client';

import { useEffect, useRef, useState } from 'react';

interface CountdownParts {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function computeParts(targetMs: number): CountdownParts {
  const totalMs = Math.max(0, targetMs - Date.now());
  const totalSeconds = Math.floor(totalMs / 1000);
  return {
    totalMs,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    expired: totalMs <= 0,
  };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

// Real-time HH:MM:SS countdown to a lot's scheduled removal — pure and
// reusable, used both on the "Обновления на баре" announcement card
// (components/coffee/BarUpdatesPanel.tsx) and the guest lot passport page
// (via components/coffee/LotRemovalCountdown.tsx, which supplies
// targetDate/onExpire from a shop's cafe_menu_entries row). Ticks on a
// plain 1s setInterval rather than requestAnimationFrame — a countdown
// this coarse (whole seconds) doesn't need frame-perfect timing, and a
// plain interval is trivially exact to clear on unmount.
export function CountdownTimer({
  targetDate,
  onExpire,
  className = '',
}: {
  targetDate: string | Date;
  // Fires exactly once, the moment the countdown reaches zero — never
  // re-fires on subsequent re-renders/remounts of an already-expired
  // timer (guarded below), since the caller (LotRemovalCountdown) uses
  // this to trigger a one-shot status update, not a repeating one.
  onExpire?: () => void;
  className?: string;
}) {
  const targetMs = new Date(targetDate).getTime();
  const [parts, setParts] = useState<CountdownParts>(() => computeParts(targetMs));
  const firedExpiryRef = useRef(false);

  useEffect(() => {
    firedExpiryRef.current = false;
    setParts(computeParts(targetMs));

    const intervalId = setInterval(() => {
      setParts(computeParts(targetMs));
    }, 1000);

    // Cleanup: always clear the interval on unmount or when targetMs
    // changes, or it keeps ticking against a stale target forever.
    return () => clearInterval(intervalId);
  }, [targetMs]);

  useEffect(() => {
    if (parts.expired && !firedExpiryRef.current) {
      firedExpiryRef.current = true;
      onExpire?.();
    }
  }, [parts.expired, onExpire]);

  if (parts.expired) {
    return <span className={`text-scorch font-medium ${className}`}>Выведен из меню</span>;
  }

  const isUrgent = parts.totalMs < ONE_DAY_MS;
  const timeText =
    parts.days > 0
      ? `${parts.days}д ${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`
      : `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;

  return (
    <span
      className={`data-value ${isUrgent ? 'text-scorch font-semibold animate-pulse' : 'text-ink-500'} ${className}`}
    >
      Осталось: {timeText}
    </span>
  );
}
