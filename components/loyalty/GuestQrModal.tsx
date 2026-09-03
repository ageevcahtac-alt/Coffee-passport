'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { buildGuestQrPayload } from '@/lib/utils/guestQr';

// Full-screen display of the guest's own loyalty QR — shown to a barista's
// scanner (see components/loyalty/BaristaLoyaltyPanel.tsx). Encodes just
// buildGuestQrPayload(guestId); no shop-specific content, since the same
// code works at every partner coffee shop.
export function GuestQrModal({ guestId, onClose }: { guestId: string; onClose: () => void }) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(buildGuestQrPayload(guestId), {
      width: 360,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#faf8f5' },
    }).then((url) => {
      if (!cancelled) setQrUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [guestId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 px-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Мой QR-код лояльности"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-xs rounded-md bg-parchment-100 p-6 text-center"
      >
        <p className="section-label mb-5 justify-center">Покажите бариста</p>
        <div className="w-full aspect-square rounded-md border border-ink-200 bg-parchment-200 flex items-center justify-center overflow-hidden mb-5">
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- small client-generated data URL, not a Next-optimizable asset
            <img src={qrUrl} alt="QR-код для сканирования бариста" className="w-full h-full object-contain p-4" />
          ) : (
            <p className="text-xs text-ink-400">Готовим код…</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center w-full rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-6 py-3.5
                     hover:bg-ink-800 transition-colors"
        >
          Готово
        </button>
      </div>
    </div>
  );
}
