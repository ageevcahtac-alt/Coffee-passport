'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLots } from '@/lib/data/useLots';
import { useJourney } from '@/lib/journey/useJourney';
import { consumeJustRevealed } from '@/lib/journey/revealFlag';
import { markPendingShop } from '@/lib/journey/pendingShopFlag';
import { markPendingRoaster } from '@/lib/journey/pendingRoasterFlag';
import { getRoasterById } from '@/lib/data/roasters';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { UNSPECIFIED_BARISTA_ID } from '@/lib/data/baristas';
import { useCoffeeShops } from '@/lib/data/useCoffeeShops';
import { useRoasters } from '@/lib/data/useRoasters';
import { useCurrentUser } from '@/lib/auth/currentUser';
import { useRoastProfiles } from '@/lib/data/useRoastProfiles';
import { LocationStep } from '@/components/coffee/LocationStep';
import { LotPassport } from '@/components/coffee/LotPassport';
import { ProducerRoasterCard } from '@/components/coffee/ProducerRoasterCard';
import { RoastProfileSummaryCard } from '@/components/coffee/RoastProfileSummaryCard';
import { RoasterCafeRecommendations } from '@/components/coffee/RoasterCafeRecommendations';
import { BlindTastingLock } from '@/components/coffee/BlindTastingLock';
import { FarmerRevealCard } from '@/components/coffee/FarmerRevealCard';
import { TasteComparison } from '@/components/coffee/TasteComparison';
import { RoastingTab } from '@/components/coffee/RoastingTab';
import { ExtractionTab } from '@/components/coffee/ExtractionTab';

export default function LotPassportPage({ params }: { params: { lotId: string } }) {
  const lots = useLots();
  const journey = useJourney();
  const coffeeShops = useCoffeeShops();
  const roasters = useRoasters();
  // Empty string pre-hydration (see CurrentUserProvider) — harmlessly
  // matches nothing until the real id resolves, same "settles after mount"
  // behavior useJourney() already has via its empty server snapshot.
  const { userId: resolvedUserId } = useCurrentUser();
  const currentUserId = resolvedUserId ?? '';
  // Business preview mode: Roaster/Cafe cabinets link here with ?preview=1
  // (see "Предпросмотр паспорта" in app/dashboard/roaster/page.tsx and
  // "Паспорт лота" in components/cafe/LotMenuCard.tsx) to check how the Lot
  // Card reads without pretending to be a guest — skips the coffee-shop
  // check-in gate and the blind-tasting unlock entirely, since neither
  // applies to someone previewing their own catalog entry.
  const searchParams = useSearchParams();
  const isPreview = searchParams.get('preview') === '1';
  // Lots are seed data merged with anything the roaster cabinet saved to
  // localStorage. Seed lots are already in the server snapshot, so they
  // render immediately (SSR-visible, no blank flash). A lot created moments
  // ago in this same browser only shows up after hydration — only THAT case
  // needs to wait before deciding "not found", so seed lots aren't held back.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const lot = lots.find((candidate) => candidate.id === params.lotId);
  const roaster = lot ? getRoasterById(lot.roasterId) : undefined;
  const latestRoastProfile =
    useRoastProfiles()
      .filter((profile) => lot && profile.lotId === lot.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;

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

  // The location gate — Step 2 of the tasting flow ("Выбор
  // локации/кофейни и обжарщика"): which shop is this visit at, and which
  // accredited roaster is credited for this lot? No real geolocation, so
  // shop is an explicit pick, re-asked on every fresh visit to this page
  // (component state, not persisted) — see LocationStep below. Roaster
  // defaults to the scanned lot's own roasterId until the guest corrects it.
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [selectedRoasterId, setSelectedRoasterId] = useState<string | null>(null);

  if (!lot || !roaster) {
    if (!mounted) return null;
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl text-ink-900 mb-2">Лот не найден</h1>
        <p className="text-ink-500 text-sm">Проверьте ссылку или отсканируйте другой QR-код.</p>
      </main>
    );
  }

  if (isPreview) {
    return (
      <main className="min-h-dvh flex flex-col px-6 py-16">
        <div className="max-w-md mx-auto w-full mb-6 rounded-md border border-dashed border-gold-400 bg-gold-50 px-4 py-3">
          <p className="text-xs text-ink-700">
            Режим предпросмотра — так карточку лота увидит гость после дегустации. Раздел «Ваша дегустация» и
            профиль фермера здесь не показываются.
          </p>
        </div>

        <div className="max-w-md mx-auto w-full">
          <LotPassport lot={lot} roaster={roaster} />
        </div>

        <div className="max-w-md mx-auto w-full mt-8">
          <ProducerRoasterCard lot={lot} />
        </div>

        <div className="max-w-md mx-auto w-full mt-8">
          <RoastProfileSummaryCard lot={lot} roaster={roaster} profile={latestRoastProfile} />
        </div>

        <div className="max-w-md mx-auto w-full mt-10">
          <p className="section-label mb-4">Обжарка</p>
          <RoastingTab lot={lot} />
        </div>

        <div className="max-w-md mx-auto w-full mt-10">
          <p className="section-label mb-4">Экстракция</p>
          <ExtractionTab lot={lot} currentUserId={currentUserId} currentUserName="Вы" />
        </div>
      </main>
    );
  }

  if (!selectedShopId) {
    return (
      <main className="min-h-dvh flex flex-col px-6 py-16">
        <div className="max-w-md mx-auto w-full">
          <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
            {roaster.name}
          </p>
          <h1 className="font-display text-2xl text-ink-900 mb-8">
            Где вы пробуете этот лот сегодня?
          </h1>
          <LocationStep
            lot={lot}
            coffeeShops={coffeeShops}
            roasters={roasters}
            shopId={selectedShopId}
            onShopChange={setSelectedShopId}
            roasterId={selectedRoasterId ?? lot.roasterId}
            onRoasterChange={setSelectedRoasterId}
          />
        </div>
      </main>
    );
  }

  const shop = getCoffeeShopById(selectedShopId);

  // Scenario A vs. B is per (lot, coffee shop) — the same lot already
  // tasted at a different shop still starts a clean session here, matching
  // the task's "новая кофейня = новый опыт" requirement.
  const shopTastings = journey
    .filter(
      (record) =>
        record.lotId === lot.id && record.coffeeShopId === selectedShopId && record.userId === currentUserId
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const latestTasting = shopTastings[0] ?? null;

  if (!latestTasting) {
    return (
      <main className="min-h-dvh flex flex-col px-6 py-16">
        <div className="max-w-md mx-auto w-full">
          <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
            {roaster.name} · {shop?.name ?? selectedShopId}
          </p>
          <h1 className="font-display text-3xl leading-[1.1] text-ink-900 mb-8">{lot.name}</h1>
          <BlindTastingLock
            lot={lot}
            onStartTasting={() => {
              markPendingShop(lot.id, selectedShopId);
              markPendingRoaster(lot.id, selectedRoasterId ?? lot.roasterId);
            }}
          />
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

      <div className="max-w-md mx-auto w-full mt-6 rounded-md border border-ink-200 bg-parchment-100 p-5">
        <p className="section-label mb-3">Ваша дегустация</p>
        <p className="text-sm text-ink-900">
          {shop?.name ?? selectedShopId}
          {shop?.city ? ` · ${shop.city}` : ''}
        </p>
        <p className="text-xs text-ink-400 mt-1">Сохранённая карточка этого лота в этой кофейне</p>
      </div>

      <div className="max-w-md mx-auto w-full mt-8">
        <ProducerRoasterCard lot={lot} />
      </div>

      <div className="max-w-md mx-auto w-full mt-8">
        <RoastProfileSummaryCard lot={lot} roaster={roaster} profile={latestRoastProfile} />
      </div>

      <div className="max-w-md mx-auto w-full mt-10">
        <p className="section-label mb-4">Обжарка</p>
        <RoastingTab lot={lot} />
      </div>

      <div className="max-w-md mx-auto w-full mt-10">
        <p className="section-label mb-4">Рекомендации</p>
        <RoasterCafeRecommendations
          lot={lot}
          roaster={roaster}
          shopId={selectedShopId}
          baristaId={latestTasting.baristaId !== UNSPECIFIED_BARISTA_ID ? latestTasting.baristaId : null}
          brewingMethodId={latestTasting.brewingMethod}
          currentUserId={currentUserId}
          currentUserName="Вы"
        />
      </div>

      <div className="max-w-md mx-auto w-full mt-10">
        <p className="section-label mb-4">Экстракция</p>
        <ExtractionTab
          lot={lot}
          currentUserId={currentUserId}
          currentUserName="Вы"
          coffeeShopId={selectedShopId}
        />
      </div>

      <div className="max-w-md mx-auto w-full mt-8 text-center">
        <p className="text-xs text-ink-400 mb-3">Хотите попробовать этот лот ещё раз?</p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => setSelectedShopId(null)}
            className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
          >
            Выбрать кофейню заново
          </button>
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
