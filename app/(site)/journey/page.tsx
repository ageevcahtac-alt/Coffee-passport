'use client';

import { useEffect, useRef, useState } from 'react';
import { useJourney } from '@/lib/journey/useJourney';
import { getMergedLotById } from '@/lib/data/lotsStore';
import { consumeCountryJustActivated } from '@/lib/journey/mapFlag';
import { CoffeeJourney } from '@/components/coffee/CoffeeJourney';
import { CoffeeBeltMap, type ActivatedRegion } from '@/components/coffee/CoffeeBeltMap';
import { ScanLotModal } from '@/components/coffee/ScanLotModal';
import { TastingRecordCard } from '@/components/coffee/TastingRecordCard';
import { TastingDetailModal } from '@/components/coffee/TastingDetailModal';
import type { TastingRecord } from '@/lib/types/coffee';

export default function JourneyPage() {
  const records = useJourney();
  const [scanOpen, setScanOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [justActivatedCountry, setJustActivatedCountry] = useState<string | null>(null);
  const [openRecord, setOpenRecord] = useState<TastingRecord | null>(null);

  // Consumes the one-shot flag set by the taste flow — guard with a ref
  // since consumeCountryJustActivated deletes as it reads, and React Strict
  // Mode double-invokes effects in dev (see the passport page for the same
  // pattern and why it matters).
  const activationChecked = useRef(false);
  useEffect(() => {
    if (!activationChecked.current) {
      activationChecked.current = true;
      const country = consumeCountryJustActivated();
      if (country) {
        setJustActivatedCountry(country);
        setSelectedCountry(country);
      }
    }
  }, []);

  const recordsByCountry = new Map<string, TastingRecord[]>();
  for (const record of records) {
    const country = getMergedLotById(record.lotId)?.country;
    if (!country) continue;
    const group = recordsByCountry.get(country) ?? [];
    group.push(record);
    recordsByCountry.set(country, group);
  }

  const activatedCountries: ActivatedRegion[] = Array.from(recordsByCountry.keys()).map(
    (country) => ({ country, justActivated: country === justActivatedCountry })
  );

  const selectedLatestRecord = selectedCountry
    ? [...(recordsByCountry.get(selectedCountry) ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0] ?? null
    : null;

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
          activatedCountries={activatedCountries}
          selectedCountry={selectedCountry}
          onSelectCountry={(country) =>
            setSelectedCountry((prev) => (prev === country ? null : country))
          }
        />
      </div>

      {selectedLatestRecord && (
        <div key={selectedCountry} className="max-w-md mx-auto w-full mb-4 reveal-rise">
          <TastingRecordCard
            record={selectedLatestRecord}
            onClick={() => setOpenRecord(selectedLatestRecord)}
          />
        </div>
      )}

      {records.length > 0 && (
        <div className="mt-6">
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
