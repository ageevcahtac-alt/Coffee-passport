'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLots } from '@/lib/data/useLots';
import { useJourney } from '@/lib/journey/useJourney';
import { consumeJustRevealed } from '@/lib/journey/revealFlag';
import { getRoasterById } from '@/lib/data/roasters';
import { LotPassport } from '@/components/coffee/LotPassport';
import { ProducerRoasterCard } from '@/components/coffee/ProducerRoasterCard';
import { BlindTastingLock } from '@/components/coffee/BlindTastingLock';
import { FarmerRevealCard } from '@/components/coffee/FarmerRevealCard';
import { TasteComparison } from '@/components/coffee/TasteComparison';

export default function LotPassportPage({ params }: { params: { lotId: string } }) {
  const lots = useLots();
  const journey = useJourney();
  // Lots are seed data merged with anything the roaster cabinet saved to
  // localStorage. Seed lots are already in the server snapshot, so they
  // render immediately (SSR-visible, no blank flash). A lot created moments
  // ago in this same browser only shows up after hydration — only THAT case
  // needs to wait before deciding "not found", so seed lots aren't held back.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const lot = lots.find((candidate) => candidate.id === params.lotId);
  const roaster = lot ? getRoasterById(lot.roasterId) : undefined;

  // Fires once, right after a guest lands here from saving a blind tasting
  // — see markJustRevealed in the taste flow. Consuming (not just reading)
  // the flag means a later visit to this same passport renders unlocked
  // content without replaying the animation. consumeJustRevealed deletes the
  // flag as it reads it, so it isn't idempotent — guard with a ref, since
  // React Strict Mode double-invokes effects in dev and a second call would
  // always read back false and clobber the real result.
  const [justRevealed, setJustRevealed] = useState(false);
  const revealChecked = useRef(false);
  useEffect(() => {
    if (lot && !revealChecked.current) {
      revealChecked.current = true;
      setJustRevealed(consumeJustRevealed(lot.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-check on lot id change
  }, [lot?.id]);

  if (!lot || !roaster) {
    if (!mounted) return null;
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl text-ink-900 mb-2">Лот не найден</h1>
        <p className="text-ink-500 text-sm">Проверьте ссылку или отсканируйте другой QR-код.</p>
      </main>
    );
  }

  const myTastings = journey
    .filter((record) => record.lotId === lot.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const latestTasting = myTastings[0] ?? null;

  if (!latestTasting) {
    return (
      <main className="min-h-dvh flex flex-col px-6 py-16">
        <div className="max-w-md mx-auto w-full">
          <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
            {roaster.name}
          </p>
          <h1 className="font-display text-3xl leading-[1.1] text-ink-900 mb-8">{lot.name}</h1>
          <BlindTastingLock lot={lot} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col px-6 py-16">
      {justRevealed && (
        <div className="reveal-pop text-center mb-8">
          <span className="text-5xl" aria-hidden="true">
            🔓
          </span>
          <p className="section-label justify-center mt-3">Профиль обжарщика открыт</p>
        </div>
      )}

      <FarmerRevealCard lot={lot} animate={justRevealed} />

      <div className={`max-w-md mx-auto w-full mt-10 ${justRevealed ? 'reveal-fade' : ''}`}>
        <LotPassport lot={lot} roaster={roaster} />
      </div>

      <div className="max-w-md mx-auto w-full mt-10">
        <TasteComparison lot={lot} tasting={latestTasting} animate={justRevealed} />
      </div>

      <div className="max-w-md mx-auto w-full mt-8">
        <ProducerRoasterCard lot={lot} />
      </div>

      <div className="max-w-md mx-auto w-full mt-8 text-center">
        <p className="text-xs text-ink-400 mb-3">Хотите попробовать этот кофе ещё раз?</p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link
            href={`/passport/${lot.id}/taste`}
            className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
          >
            Записать новую дегустацию
          </Link>
          <Link
            href="/journey"
            className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
          >
            Моё кофейное путешествие
          </Link>
        </div>
      </div>
    </main>
  );
}
