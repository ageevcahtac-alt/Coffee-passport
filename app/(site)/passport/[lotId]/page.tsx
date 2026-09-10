'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLots } from '@/lib/data/useLots';
import { useJourney } from '@/lib/journey/useJourney';
import { getCommunityTastingsForLot, type CommunityTasting } from '@/lib/journey/store';
import { consumeJustRevealed } from '@/lib/journey/revealFlag';
import { consumePendingShop, markPendingShop } from '@/lib/journey/pendingShopFlag';
import { consumePendingRoaster, markPendingRoaster } from '@/lib/journey/pendingRoasterFlag';
import { getRoasterById } from '@/lib/data/roasters';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { syncCafeMenuFromSupabase } from '@/lib/data/cafeMenuStore';
import { syncLotsFromSupabase } from '@/lib/data/lotsStore';
import { syncRoastProfilesFromSupabase } from '@/lib/data/roastProfilesStore';
import { UNSPECIFIED_BARISTA_ID } from '@/lib/data/baristas';
import { useCoffeeShops } from '@/lib/data/useCoffeeShops';
import { useRoasters } from '@/lib/data/useRoasters';
import { useCurrentUser } from '@/lib/auth/currentUser';
import { useRoastProfiles } from '@/lib/data/useRoastProfiles';
import { LocationStep } from '@/components/coffee/LocationStep';
import { LotPassport } from '@/components/coffee/LotPassport';
import { LotRemovalCountdown } from '@/components/coffee/LotRemovalCountdown';
import { ProducerRoasterCard } from '@/components/coffee/ProducerRoasterCard';
import { RoastProfileSummaryCard } from '@/components/coffee/RoastProfileSummaryCard';
import { RoasterCafeRecommendations } from '@/components/coffee/RoasterCafeRecommendations';
import { BlindTastingLock } from '@/components/coffee/BlindTastingLock';
import { FarmerRevealCard } from '@/components/coffee/FarmerRevealCard';
import { LockIcon } from '@/components/coffee/LockIcon';
import { TasteComparison } from '@/components/coffee/TasteComparison';
import { RoastingTab } from '@/components/coffee/RoastingTab';
import { ExtractionTab } from '@/components/coffee/ExtractionTab';
import {
  findCanonicalLotByPublicId,
  getGreenLotById,
  getCoffeeById,
  getActiveReferenceRoastProfile,
  getReferenceRoastProfileById,
  type CanonicalCoffee,
  type ActiveReferenceRoastProfile,
} from '@/lib/data/canonicalLotStore';
import { RoastIntentCard } from '@/components/coffee/RoastIntentCard';
import { CommunityTastingsCard } from '@/components/coffee/CommunityTastingsCard';
import { TastePhilosophyMoment } from '@/components/coffee/TastePhilosophyMoment';
import { TasteHistoryPreview } from '@/components/coffee/TasteHistoryPreview';
import type { LotStatus } from '@/lib/types/database';
import { BREWING_METHODS, type Lot } from '@/lib/types/coffee';
import { hasRevealedTasting } from './blindTastingGate';

// Phase 4.5.8 — Coffee is the identity/description of the coffee itself;
// Canonical Lot is a specific release. The local Lot object's own
// country/region/process/cropYear/producer fields are collected redundantly
// through LotBuilderForm's own "Происхождение" step (never prefilled from
// the Coffee the roaster already picked/created earlier in the same
// creation wizard — see app/dashboard/roaster/new/page.tsx), so they can
// drift from the real Coffee row two Canonical Lots sharing one Green Lot
// are both structurally linked to. This overlay makes the canonical Coffee
// row authoritative for a guest-facing display, falling back to the local
// Lot's own value only where Coffee has nothing recorded (an empty string —
// a roaster who left a Coffee field blank) — same "canonical wins when
// present" convention rowToLot already uses in lib/data/lotsStore.ts.
// `producer.story` has no Coffee equivalent (it's the roaster's own
// narrative text) and is therefore always the local Lot's value, unchanged.
function withCanonicalCoffeeOverlay(lot: Lot, coffee: CanonicalCoffee | null): Lot {
  if (!coffee) return lot;
  return {
    ...lot,
    country: coffee.country || lot.country,
    region: coffee.region || lot.region,
    process: coffee.processing || lot.process,
    cropYear: coffee.harvestYear || lot.cropYear,
    producer: {
      ...lot.producer,
      farmerName: coffee.producer || lot.producer.farmerName,
      farmName: coffee.farm || lot.producer.farmName,
      altitude: coffee.altitude || lot.producer.altitude,
    },
  };
}

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

  // Canonical Lot catalog (Stage 4 Phase 4.4) — overlays the real
  // public.lots/reference_taste_profiles rows onto the same seed+
  // localStorage cache useLots() already reads, same idiom as
  // syncCafeMenuFromSupabase below. A no-op until migrations 0022-0025 are
  // applied and the backfill script has been run.
  //
  // End-to-end audit (PUBLIC_COFFEE_PASSPORT_END_TO_END_AUDIT.md, §IDENTITY):
  // `lotsSynced` gates the not-found decision below on this fetch actually
  // having settled — every real Canonical Lot (i.e. every Lot created since
  // this architecture shipped, as opposed to the handful of hardcoded seed
  // demo lots) exists ONLY in Supabase, not in SEED_LOTS. Without this gate,
  // a brand-new guest's very first page load — the QR scan itself — briefly
  // found `lot` undefined (this fetch hadn't resolved yet) and rendered a
  // false "Лот не найден" before self-correcting a moment later: the literal
  // first step of the guest journey, breaking on the exact Lots the whole
  // Canonical Lot block exists to serve. syncLotsFromSupabase() never
  // throws/hangs (internal try/catch, always resolves) so this can't get
  // stuck waiting.
  const [lotsSynced, setLotsSynced] = useState(false);
  useEffect(() => {
    // Scoped to this one Lot — this page already knows exactly which
    // public_id it needs from the URL, so there's no reason to pull the
    // entire catalog (every roaster's every Lot) just to resolve one row.
    void syncLotsFromSupabase(params.lotId).finally(() => setLotsSynced(true));
  }, [params.lotId]);

  const lot = lots.find((candidate) => candidate.id === params.lotId);

  useEffect(() => {
    if (lot) void syncRoastProfilesFromSupabase(lot.roasterId);
  }, [lot?.roasterId]);
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

  // Community Layer (COMMUNITY_LAYER_PRODUCT_AUDIT.md) — anonymized, opt-in
  // shared tastings for this exact Lot, keyed by its public_id (the same id
  // `journey`/`checkins.lot_id` already use — no Canonical Lot lookup
  // needed for this, deliberately decoupled from that chain).
  //
  // Production readiness hardening (COFFEE_PASSPORT_PRODUCTION_READINESS_AUDIT.md):
  // this used to fetch as soon as `lot` resolved, before the guest even
  // picked a shop — the data (other guests' flavor axes, liked/disliked,
  // free-text notes) was already visible in the Network tab well before
  // the guest's own blind read, even though rendering was correctly gated
  // to post-reveal. The fetch itself must be gated on the same condition
  // as the render: a saved tasting already exists for this exact
  // (lot, shop, user) triple — i.e. the guest has already revealed.
  const hasRevealedTastingHere = hasRevealedTasting(journey, lot?.id, selectedShopId, currentUserId);
  const [communityTastings, setCommunityTastings] = useState<CommunityTasting[]>([]);
  useEffect(() => {
    if (!lot || !hasRevealedTastingHere) {
      setCommunityTastings([]);
      return;
    }
    let cancelled = false;
    getCommunityTastingsForLot(lot.id).then((tastings) => {
      if (!cancelled) setCommunityTastings(tastings);
    });
    return () => {
      cancelled = true;
    };
  }, [lot?.id, hasRevealedTastingHere]);

  // Phase 4.5.7 — discoverability vs. history: a `draft`-status Canonical
  // Lot (per createCanonicalLot's own comment: "no finalized profile yet")
  // must not let a guest START a brand-new blind tasting — a roaster can
  // already download/print a QR for any Lot in their own dashboard list
  // regardless of status (see handleDownloadPdf in
  // app/dashboard/roaster/page.tsx), so this is a real, reachable case, not
  // a hypothetical one. This intentionally gates ONLY the "start a new
  // tasting" branch below (BlindTastingLock) — an ALREADY-saved tasting for
  // this lot (the `latestTasting` branch) is never gated by status, at any
  // value, because destroying a guest's history when a roaster edits status
  // later is exactly what this phase must not do. `testing`/`archived`/
  // `active` are deliberately left unrestricted for new tastings too — see
  // PHASE_4.5.7_REPORT.md for why extending this rule to those statuses
  // would mean guessing an undecided product question, not applying an
  // already-established one.
  const [canonicalStatus, setCanonicalStatus] = useState<LotStatus | null>(null);
  // Phase 4.5.8 — the Coffee row this Lot's Green Lot actually belongs to,
  // fetched alongside the status lookup above (same effect, one round trip
  // through the chain) so the guest-facing origin/producer fields below can
  // prefer it over the local Lot's own redundant copy — see
  // withCanonicalCoffeeOverlay's own comment above.
  const [canonicalCoffee, setCanonicalCoffee] = useState<CanonicalCoffee | null>(null);
  // The Canonical Lot's own uuid (distinct from lot.id, the public-facing
  // id) — kept in state, not just a local variable inside the effect below,
  // because the roastIntent effect further down also needs it and must
  // re-run independently, keyed on latestRoastProfile's own FK.
  const [canonicalLotId, setCanonicalLotId] = useState<string | null>(null);
  // Public Coffee Passport — "Задумано обжарщиком": what the roaster
  // declared as the target approach (see RoastIntentCard's own comment for
  // why this is a separate small card rather than a RoastProfileSummaryCard
  // rewrite).
  const [roastIntent, setRoastIntent] = useState<ActiveReferenceRoastProfile | null>(null);
  useEffect(() => {
    if (!lot) return;
    let cancelled = false;
    findCanonicalLotByPublicId(lot.id).then(async (found) => {
      if (cancelled) return;
      setCanonicalStatus(found?.status ?? null);
      setCanonicalLotId(found?.id ?? null);
      if (!found) return;
      const greenLot = await getGreenLotById(found.greenLotId);
      if (cancelled || !greenLot) return;
      const coffee = await getCoffeeById(greenLot.coffeeId);
      if (!cancelled) setCanonicalCoffee(coffee);
    });
    return () => {
      cancelled = true;
    };
  }, [lot?.id]);

  // ROAST_BATCH_REFERENCE_LINK.md — prefer the EXACT reference profile
  // version the latest actual roast_batches row recorded following, over
  // "whatever is active now": a Lot re-roasted since its last logged batch
  // against an updated declared approach should show the version that batch
  // actually followed, not today's newer target. Batches predating this
  // link (referenceRoastProfileId null/undefined, including every batch
  // logged before this pass) fall back to the active version — identical to
  // this page's behavior before this change.
  useEffect(() => {
    if (!canonicalLotId) return;
    let cancelled = false;
    const linkedId = latestRoastProfile?.referenceRoastProfileId ?? null;
    const fetchIntent = linkedId
      ? getReferenceRoastProfileById(linkedId)
      : getActiveReferenceRoastProfile(canonicalLotId);
    fetchIntent.then((intent) => {
      if (!cancelled) setRoastIntent(intent);
    });
    return () => {
      cancelled = true;
    };
  }, [canonicalLotId, latestRoastProfile?.referenceRoastProfileId]);

  // Warms the cafe-menu cache for LotRemovalCountdown below — nothing else
  // on this page reads it yet.
  useEffect(() => {
    if (selectedShopId) void syncCafeMenuFromSupabase(selectedShopId);
  }, [selectedShopId]);

  // Landing here right after saving a tasting (FarmerPinningModal's × or
  // the taste flow's own navigation) already knows which shop/roaster the
  // guest just checked in at — see markPendingShop/markPendingRoaster in
  // taste/page.tsx's handleFinish. Consuming it here skips re-asking the
  // gate below, so the comparison reveal shows up immediately instead of
  // only after a redundant manual reselect. Guard with a ref, same
  // reasoning as revealChecked above (Strict Mode double-invoke +
  // consume-once semantics).
  const pendingShopChecked = useRef(false);
  useEffect(() => {
    if (lot && !pendingShopChecked.current) {
      pendingShopChecked.current = true;
      const pendingShopId = consumePendingShop(lot.id);
      const pendingRoasterId = consumePendingRoaster(lot.id);
      if (pendingShopId) {
        setSelectedShopId(pendingShopId);
        setSelectedRoasterId(pendingRoasterId ?? lot.roasterId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-check on lot id change
  }, [lot?.id]);

  if (!lot || !roaster) {
    if (!mounted || !lotsSynced) return null;
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl text-ink-900 mb-2">Лот не найден</h1>
        <p className="text-ink-500 text-sm">Проверьте ссылку или отсканируйте другой QR-код.</p>
      </main>
    );
  }

  // Phase 4.5.8 — the overlaid, guest-facing display object (see
  // withCanonicalCoffeeOverlay above). Computed here, after `lot` is
  // narrowed non-null, and used only by the three components below that
  // actually render Coffee-identity fields (LotPassport, ProducerRoasterCard,
  // FarmerRevealCard) — every other use of `lot` on this page is unaffected.
  const displayLot = withCanonicalCoffeeOverlay(lot, canonicalCoffee);

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
          <LotPassport lot={displayLot} roaster={roaster} />
        </div>

        <div className="max-w-md mx-auto w-full mt-8">
          <ProducerRoasterCard lot={displayLot} />
        </div>

        {roastIntent && (
          <div className="max-w-md mx-auto w-full mt-8">
            <RoastIntentCard profile={roastIntent} />
          </div>
        )}

        <div className="max-w-md mx-auto w-full mt-8">
          <RoastProfileSummaryCard lot={lot} roaster={roaster} profile={latestRoastProfile} />
        </div>

        <div className="max-w-md mx-auto w-full mt-10">
          <p className="section-label mb-4">Как прошло на практике</p>
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

  // Contextual Taste (COFFEE_PASSPORT_CONTEXTUAL_TASTE_UX.md, §8) — "One
  // Lot — Many Cups": every one of THIS guest's own past tastings of this
  // exact lot, across every shop/method/date, not scoped to the currently
  // selected shop the way `shopTastings` above is. Built from the same
  // already-loaded `journey` data — zero new Supabase calls.
  const lotTastingHistory = journey.filter(
    (record) => record.lotId === lot.id && record.userId === currentUserId
  );

  if (!latestTasting) {
    if (canonicalStatus === 'draft') {
      return (
        <main className="min-h-dvh flex flex-col px-6 py-16">
          <div className="max-w-md mx-auto w-full">
            <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
              {roaster.name} · {shop?.name ?? selectedShopId}
            </p>
            <h1 className="font-display text-3xl leading-[1.1] text-ink-900 mb-8">{lot.name}</h1>
            <p className="rounded-md border border-dashed border-ink-300 bg-parchment-100 p-4 text-sm text-ink-500">
              Обжарщик ещё готовит паспорт этого лота — попробуйте отсканировать QR-код позже.
            </p>
          </div>
        </main>
      );
    }

    return (
      <main className="min-h-dvh flex flex-col px-6 py-16">
        <div className="max-w-md mx-auto w-full">
          <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
            {roaster.name} · {shop?.name ?? selectedShopId}
          </p>
          <h1 className="font-display text-3xl leading-[1.1] text-ink-900 mb-8">{lot.name}</h1>
          <BlindTastingLock
            lot={displayLot}
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
          <LockIcon open className="w-10 h-10 mx-auto text-gold-500" />
          <p className="section-label justify-center mt-3">Профиль обжарщика открыт</p>
        </div>
      )}

      <FarmerRevealCard lot={displayLot} animate={justRevealed} />

      {/* Contextual Taste visual polish pass: the guest's own perception
          renders before the roaster's official Q-Score/profile reveal below
          — previously LotPassport's Q-Score seal was the first thing shown
          after unlock, which read as "the official grade" outranking the
          guest's own read before they'd even seen it themselves. */}
      <div className="max-w-md mx-auto w-full mt-10">
        <TasteComparison lot={lot} tasting={latestTasting} animate={justRevealed} />
      </div>

      <div className="max-w-md mx-auto w-full mt-6">
        <TastePhilosophyMoment />
      </div>

      <div className={`max-w-md mx-auto w-full mt-10 ${justRevealed ? 'reveal-fade' : ''}`}>
        <LotPassport lot={displayLot} roaster={roaster} />
      </div>

      <div className="max-w-md mx-auto w-full mt-4">
        <LotRemovalCountdown shopId={selectedShopId} lotId={lot.id} variant="notice" />
      </div>

      {lotTastingHistory.length > 1 && (
        <div className="max-w-md mx-auto w-full mt-6">
          <TasteHistoryPreview records={lotTastingHistory} />
        </div>
      )}

      {communityTastings.length > 0 && (
        <div className="max-w-md mx-auto w-full mt-6">
          <CommunityTastingsCard tastings={communityTastings} />
        </div>
      )}

      <div className="max-w-md mx-auto w-full mt-6 rounded-md border border-ink-200 bg-parchment-100 p-5">
        <p className="section-label mb-3">Ваша дегустация</p>
        <p className="text-sm text-ink-900">
          {shop?.name ?? selectedShopId}
          {shop?.city ? ` · ${shop.city}` : ''}
        </p>
        <p className="text-xs text-ink-400 mt-1">
          {BREWING_METHODS.find((method) => method.id === latestTasting.brewingMethod)?.label ?? 'Способ не указан'}
          {' · '}
          Сохранённая карточка этого лота в этой кофейне
        </p>
      </div>

      <div className="max-w-md mx-auto w-full mt-8">
        <ProducerRoasterCard lot={displayLot} />
      </div>

      {roastIntent && (
        <div className="max-w-md mx-auto w-full mt-8">
          <RoastIntentCard profile={roastIntent} />
        </div>
      )}

      <div className="max-w-md mx-auto w-full mt-8">
        <RoastProfileSummaryCard lot={lot} roaster={roaster} profile={latestRoastProfile} />
      </div>

      <div className="max-w-md mx-auto w-full mt-10">
        <p className="section-label mb-4">Как прошло на практике</p>
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
