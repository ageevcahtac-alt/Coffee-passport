'use client';

import { useEffect, useState } from 'react';
import { hasSeenTastePhilosophy, markSeenTastePhilosophy } from '@/lib/journey/tastePhilosophyFlag';

// Contextual Taste (COFFEE_PASSPORT_CONTEXTUAL_TASTE_UX.md, §16) — the
// product's core philosophy statement, shown at full length exactly once
// per browser, at the single highest-leverage moment: right after a
// guest's first-ever reveal, where "did I get it right" would otherwise be
// the natural reaction. Every reveal after the first still gets the short
// always-present line (see TasteComparison) — only the full editorial
// paragraph is one-shot, so the idea earns its place without becoming a
// repeated lecture (§18, principle 9).
//
// Deliberately NOT rendered inside TasteComparison itself: that component
// is reused verbatim in LotPassportModal (viewing an OLD tasting from
// Taste History) where replaying "first reveal ever" framing would be
// wrong — this component is mounted only from the live passport reveal
// flow.
export function TastePhilosophyMoment() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasSeenTastePhilosophy()) {
      setVisible(true);
      markSeenTastePhilosophy();
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-6 reveal-fade">
      <p className="font-display text-xl leading-snug text-ink-900">
        Coffee Passport не ищет единственно правильный вкус.
        <br />
        Он показывает историю того, как один кофе раскрывается в разных условиях.
      </p>
    </div>
  );
}
