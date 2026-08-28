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
import { ScanLotModal } from '@/components/coffee/ScanLotModal';
import { RoasterProfileCard } from '@/components/coffee/RoasterProfileCard';

export default function JourneyPage() {
  const records = useJourney();
  const [scanOpen, setScanOpen] = useState(false);
  const [selectedPin, setSelectedPin] = useState<SelectedPin | null>(null);
  const [justActivatedPin, setJustActivatedPin] = useState<SelectedPin | null>(null);

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
        setSelectedPin(pin);
      }
    }
  }, []);

  const pinKeys = new Set<string>();
  const pins: ActivatedPin[] = [];
  for (const record of records) {
    const lot = getMergedLotById(record.lotId);
    if (!lot) continue;
    const key = `${lot.country}::${lot.roasterId}`;
    if (pinKeys.has(key)) continue;
    pinKeys.add(key);
    pins.push({
      country: lot.country,
      roasterId: lot.roasterId,
      justActivated:
        justActivatedPin?.country === lot.country && justActivatedPin?.roasterId === lot.roasterId,
    });
  }

  return (
    <main className="min-h-dvh flex flex-col px-6 py-16">
      <div className="max-w-md mx-auto w-full mb-6">
        <h1 className="font-display text-3xl leading-[1.1] text-ink-900 mb-2">
          Моё кофейное путешествие
        </h1>
        <p className="text-ink-500 text-sm mb-6">
          Кофейный пояс Земли — отмечайте регионы, которые распознали вслепую.
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

      <div className="max-w-md mx-auto w-full mb-4">
        <CoffeeBeltMap
          pins={pins}
          selectedPin={selectedPin}
          onSelectPin={(pin) =>
            setSelectedPin((prev) =>
              prev?.country === pin.country && prev?.roasterId === pin.roasterId ? null : pin
            )
          }
        />
      </div>

      {selectedPin && (
        <div
          key={`${selectedPin.country}::${selectedPin.roasterId}`}
          className="max-w-md mx-auto w-full mb-4 reveal-rise"
        >
          <RoasterProfileCard roasterId={selectedPin.roasterId} records={records} />
        </div>
      )}

      {records.length > 0 && (
        <div className="mt-6">
          <CoffeeJourney records={records} />
        </div>
      )}

      {scanOpen && <ScanLotModal onClose={() => setScanOpen(false)} />}
    </main>
  );
}
