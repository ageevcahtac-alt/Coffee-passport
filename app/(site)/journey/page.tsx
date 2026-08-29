'use client';

import { useEffect, useRef, useState } from 'react';
import { useJourney } from '@/lib/journey/useJourney';
import { getMergedLotById } from '@/lib/data/lotsStore';
import { consumePinJustActivated } from '@/lib/journey/mapFlag';
import { CoffeeJourney } from '@/components/coffee/CoffeeJourney';
import {
  CoffeeBeltMap,
  type ActivatedPin,
  type SelectedPin,
} from '@/components/coffee/CoffeeBeltMap';
import { TrophyShelf } from '@/components/coffee/TrophyShelf';
import { ScanLotModal } from '@/components/coffee/ScanLotModal';
import { CoffeeShopProfileCard } from '@/components/coffee/CoffeeShopProfileCard';
import { TastingRecordCard } from '@/components/coffee/TastingRecordCard';
import { TastingDetailModal } from '@/components/coffee/TastingDetailModal';
import { TastePassportCard } from '@/components/coffee/TastePassportCard';
import type { TastingRecord } from '@/lib/types/coffee';

export default function JourneyPage() {
  const records = useJourney();
  const [scanOpen, setScanOpen] = useState(false);
  // Clicking a pin ON THE MAP shows just that pin's latest lot; clicking its
  // twin badge in the trophy shelf shows the full coffee shop profile — two
  // independent selections per the task's "карта vs трофеи" interaction split.
  const [selectedMapPin, setSelectedMapPin] = useState<SelectedPin | null>(null);
  const [selectedTrophyShopId, setSelectedTrophyShopId] = useState<string | null>(null);
  const [justActivatedPin, setJustActivatedPin] = useState<SelectedPin | null>(null);
  const [openRecord, setOpenRecord] = useState<TastingRecord | null>(null);

  // Consumes the one-shot flag set by the taste flow — guard with a ref
  // since consumePinJustActivated deletes as it reads, and React Strict
  // Mode double-invokes effects in dev (see the passport page for the same
  // pattern and why it matters).
  const activationChecked = useRef(false);
  useEffect(() => {
    if (!activationChecked.current) {
      activationChecked.current = true;
      const pin = consumePinJustActivated();
      if (pin) {
        setJustActivatedPin(pin);
        setSelectedMapPin(pin);
      }
    }
  }, []);

  // A pin is one (country, coffee shop) check-in — pins are colored and
  // grouped by shop brand, so tasting the same country at two different
  // shops drops two pins, while re-tasting different lots at the same shop
  // in that country stays one.
  const pinKeys = new Set<string>();
  const pins: ActivatedPin[] = [];
  for (const record of records) {
    const lot = getMergedLotById(record.lotId);
    if (!lot) continue;
    const key = `${lot.country}::${record.coffeeShopId}`;
    if (pinKeys.has(key)) continue;
    pinKeys.add(key);
    pins.push({
      country: lot.country,
      coffeeShopId: record.coffeeShopId,
      justActivated:
        justActivatedPin?.country === lot.country &&
        justActivatedPin?.coffeeShopId === record.coffeeShopId,
    });
  }

  const latestPinRecord = selectedMapPin
    ? [...records]
        .filter((record) => {
          if (record.coffeeShopId !== selectedMapPin.coffeeShopId) return false;
          return getMergedLotById(record.lotId)?.country === selectedMapPin.country;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null
    : null;

  return (
    <main className="min-h-dvh flex flex-col px-6 py-16">
      <div className="max-w-md mx-auto w-full mb-6">
        <h1 className="font-display text-3xl leading-[1.1] text-ink-900 mb-2">
          Моё кофейное путешествие
        </h1>
        <p className="text-ink-500 text-sm mb-6">
          Кофейный пояс Земли — рассейте туман, дегустируя лоты вслепую.
        </p>
        <button
          type="button"
          onClick={() => setScanOpen(true)}
          className="inline-flex items-center justify-center w-full rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-6 py-4
                     hover:bg-ink-800 transition-colors"
        >
          📷 Отсканировать новый лот
        </button>
      </div>

      {records.length > 0 && (
        <div className="max-w-md mx-auto w-full mb-6">
          <TastePassportCard records={records} />
        </div>
      )}

      <div className="max-w-md mx-auto w-full mb-4">
        <CoffeeBeltMap
          pins={pins}
          selectedPin={selectedMapPin}
          onSelectPin={(pin) =>
            setSelectedMapPin((prev) =>
              prev?.country === pin.country && prev?.coffeeShopId === pin.coffeeShopId ? null : pin
            )
          }
        />
      </div>

      {latestPinRecord && (
        <div
          key={`${selectedMapPin?.country}::${selectedMapPin?.coffeeShopId}`}
          className="max-w-md mx-auto w-full mb-6 reveal-rise"
        >
          <TastingRecordCard record={latestPinRecord} onClick={() => setOpenRecord(latestPinRecord)} />
        </div>
      )}

      <div className="max-w-md mx-auto w-full mb-4">
        <TrophyShelf
          pins={pins}
          selectedShopId={selectedTrophyShopId}
          onSelectShop={(coffeeShopId) =>
            setSelectedTrophyShopId((prev) => (prev === coffeeShopId ? null : coffeeShopId))
          }
        />
      </div>

      {selectedTrophyShopId && (
        <div key={selectedTrophyShopId} className="max-w-md mx-auto w-full mb-6 reveal-rise">
          <CoffeeShopProfileCard coffeeShopId={selectedTrophyShopId} records={records} />
        </div>
      )}

      {records.length > 0 && (
        <div className="mt-2">
          <CoffeeJourney records={records} />
        </div>
      )}

      {scanOpen && <ScanLotModal onClose={() => setScanOpen(false)} />}
      {openRecord && (
        <TastingDetailModal record={openRecord} onClose={() => setOpenRecord(null)} />
      )}
    </main>
  );
}
