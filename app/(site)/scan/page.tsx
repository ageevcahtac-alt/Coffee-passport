'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLots } from '@/lib/data/useLots';
import { getRoasterById } from '@/lib/data/roasters';
import { extractLotId } from '@/lib/utils/lotId';
import { QrScanner } from '@/components/coffee/QrScanner';

// Camera-based QR entry point for the blind-tasting flow: a real getUserMedia
// scanner (see QrScanner) resolving straight to /passport/[lotId] on a
// successful decode, with a manual code fallback for devices/browsers that
// can't open the camera (see messageForError in QrScanner.tsx).
export default function ScanPage() {
  const router = useRouter();
  const lots = useLots();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [scannerFailed, setScannerFailed] = useState(false);

  function resolveAndNavigate(raw: string) {
    const lotId = extractLotId(raw);
    if (!lotId) return;

    const lot = lots.find((candidate) => candidate.id.toUpperCase() === lotId);
    if (!lot) {
      setError('Лот с таким кодом не найден. Проверьте код на этикетке.');
      return;
    }

    router.push(`/passport/${lot.id}`);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    resolveAndNavigate(code);
  }

  const demoLot = lots[0];
  const demoRoaster = demoLot ? getRoasterById(demoLot.roasterId) : undefined;

  return (
    <main className="min-h-dvh flex flex-col px-6 py-16 max-w-md mx-auto w-full">
      <p className="section-label mb-6">Сканировать кофе</p>

      <QrScanner onDecode={resolveAndNavigate} onError={() => setScannerFailed(true)} />

      <p className="text-xs text-ink-400 mt-3 mb-8">
        {scannerFailed
          ? 'Камера недоступна — введите код лота с этикетки вручную.'
          : 'Наведите камеру на QR-код лота — сработает автоматически.'}
      </p>

      <form onSubmit={handleSubmit} className="mb-2">
        <p className="section-label mb-3">Ввести код вручную</p>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="LOT-XO-ETH-001"
            className="flex-1 rounded-md border border-ink-200 bg-parchment-100 px-4 py-3
                       text-sm data-value text-ink-900 placeholder:text-ink-300
                       focus:border-gold-400"
          />
          <button
            type="submit"
            disabled={!code.trim()}
            className="inline-flex items-center justify-center rounded-md bg-ink-900
                       text-parchment-100 font-body font-medium text-sm px-5
                       hover:bg-ink-800 transition-colors
                       disabled:opacity-40 disabled:pointer-events-none"
          >
            Открыть
          </button>
        </div>
        {error && <p className="text-xs text-ink-500 mt-2">⚠ {error}</p>}
      </form>

      {demoLot && (
        <p className="text-xs text-ink-300 mt-6">
          Демо: попробуйте код{' '}
          <Link href={`/passport/${demoLot.id}`} className="underline underline-offset-2">
            {demoLot.id}
          </Link>{' '}
          ({demoLot.name} · {demoRoaster?.name})
        </p>
      )}
    </main>
  );
}
