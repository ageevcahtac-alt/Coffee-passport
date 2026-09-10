'use client';

import { useState } from 'react';

// Contextual Taste (COFFEE_PASSPORT_CONTEXTUAL_TASTE_UX.md, §11/§13) —
// "known vs. possible," made structural, not just a phrasing choice. This
// component is deliberately generic and static: it never receives or
// infers a specific cause for a specific guest's specific difference,
// because the product has no way to know which factor actually applied.
// The list below is the SAME every time it renders — it's a list of what
// COULD matter for any cup, not a diagnosis of this one. Hedged language
// ("могли повлиять," never "повлияло на этот кофе") is load-bearing, not
// decorative — do not tighten it into a more confident claim later.
//
// Collapsed by default (progressive disclosure) — the caller only renders
// this component at all when there's a real difference to explain (see
// TasteComparison), so opening it is optional depth, not a required read.
const POSSIBLE_FACTORS = [
  'вода',
  'помол',
  'дозировка',
  'экстракция',
  'способ приготовления',
  'состояние оборудования',
  'свежесть зерна',
  'еда или напиток перед кофе',
  'запахи вокруг',
  'настроение',
  'усталость',
  'индивидуальные особенности восприятия',
];

export function PossibleInfluences() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-4 border-t border-ink-200 pt-4">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between text-left text-xs text-ink-500 hover:text-ink-900 transition-colors"
      >
        <span>Почему восприятие могло отличаться?</span>
        <span aria-hidden="true" className="text-ink-300">
          {expanded ? '−' : '+'}
        </span>
      </button>
      {expanded && (
        <div className="mt-3 text-xs text-ink-500 leading-relaxed">
          <p className="mb-2">На восприятие могли повлиять:</p>
          <p className="text-ink-700">{POSSIBLE_FACTORS.join(' · ')}</p>
          <p className="mt-2 text-ink-400">
            Это не объяснение того, что произошло именно с вами — просто список того, что вообще
            способно повлиять на вкус в чашке.
          </p>
        </div>
      )}
    </div>
  );
}
