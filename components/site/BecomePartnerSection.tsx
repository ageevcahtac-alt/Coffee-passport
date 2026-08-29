'use client';

import { useState } from 'react';
import { PartnerLeadModal } from './PartnerLeadModal';

export function BecomePartnerSection() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-10 pt-8 border-t border-ink-200 text-center">
      <p className="font-display text-lg text-ink-900 mb-2">Стать партнёром</p>
      <p className="text-ink-500 text-sm max-w-sm mx-auto mb-5">
        Подключите свою кофейню или ростерию к платформе — оставьте заявку, и менеджер свяжется с
        вами.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-md border border-gold-400
                   text-gold-500 font-body font-medium text-sm px-6 py-3
                   hover:bg-gold-400/10 transition-colors"
      >
        Стать партнёром (Кофейня / Обжарщик)
      </button>

      {open && <PartnerLeadModal onClose={() => setOpen(false)} />}
    </div>
  );
}
