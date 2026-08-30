'use client';

import { useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useLots } from '@/lib/data/useLots';
import { useJourney } from '@/lib/journey/useJourney';
import { getRoasterById } from '@/lib/data/roasters';
import { ROAST_TYPE_LABELS, type Lot, type TastingRecord } from '@/lib/types/coffee';
import { LotGuestAnalytics } from '@/components/roaster/LotGuestAnalytics';
import { CommunityHighlights } from '@/components/coffee/CommunityHighlights';

// No real roaster auth wired up yet (see /dashboard for the Supabase-gated
// membership flow) — this cabinet is scoped to the pilot roaster for now,
// same as the rest of the demo data in lib/data/.
const ACTIVE_ROASTER_ID = 'roaster-xo';

export default function RoasterDashboardPage() {
  const lots = useLots();
  const records = useJourney();
  const roaster = getRoasterById(ACTIVE_ROASTER_ID);
  const myLots = lots.filter((lot) => lot.roasterId === ACTIVE_ROASTER_ID);

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-2xl mx-auto w-full">
        <div className="flex items-start justify-between gap-4 mb-10">
          <div>
            <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
              {roaster?.name ?? 'Обжарщик'}
            </p>
            <h1 className="font-display text-3xl text-ink-900">Лоты</h1>
            <Link
              href="/dashboard/roaster/equipment"
              className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 mt-2 inline-block"
            >
              ⚙️ Оборудование ростерии
            </Link>
          </div>
          <Link
            href="/dashboard/roaster/new"
            className="inline-flex items-center justify-center rounded-md bg-ink-900
                       text-parchment-100 font-body font-medium text-sm px-5 py-3
                       hover:bg-ink-800 transition-colors shrink-0"
          >
            + Добавить лот
          </Link>
        </div>

        <CommunityHighlights scopeLots={myLots} canApprove />

        {myLots.length === 0 ? (
          <p className="text-ink-500 text-sm">
            Пока нет ни одного лота. Добавьте первый, чтобы сгенерировать его паспорт.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {myLots.map((lot) => (
              <LotRow key={lot.id} lot={lot} records={records} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function LotRow({ lot, records }: { lot: Lot; records: TastingRecord[] }) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopyLink() {
    const url = `${window.location.origin}/passport/${lot.id}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (permissions, insecure context) — the QR
      // below still gives a way to share the link.
    }

    if (!qrUrl) {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 240,
        margin: 2,
        color: { dark: '#1a1a1a', light: '#faf8f5' },
      });
      setQrUrl(dataUrl);
    }
  }

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h3 className="font-display text-lg text-ink-900 leading-tight">{lot.name}</h3>
          <p className="text-xs text-ink-400 mt-1">
            {lot.country} · {lot.region}
          </p>
        </div>
        <span className="data-value text-sm text-gold-500 shrink-0">{lot.qGrade.toFixed(1)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span
          className="rounded-full border border-gold-400 text-gold-500 text-[11px]
                     uppercase tracking-widest2 px-2.5 py-1"
        >
          {ROAST_TYPE_LABELS[lot.roastType]}
        </span>
        <span className="data-value text-[11px] text-ink-400">{lot.cropYear}</span>
        <span className="data-value text-[11px] text-ink-300">{lot.id}</span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Link
          href={`/dashboard/roaster/${lot.id}/edit`}
          className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
        >
          Редактировать
        </Link>
        <Link
          href={`/passport/${lot.id}?preview=1`}
          className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
        >
          Предпросмотр паспорта
        </Link>
        <button
          type="button"
          onClick={handleCopyLink}
          className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
        >
          {copied ? 'Ссылка скопирована!' : 'Скопировать ссылку / QR'}
        </button>
      </div>

      {qrUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- small client-generated data URL, not a Next-optimizable asset
        <div className="mt-4 flex items-center gap-3">
          <img
            src={qrUrl}
            alt={`QR-код паспорта лота ${lot.name}`}
            className="w-24 h-24 rounded-md border border-ink-200"
          />
          <p className="text-xs text-ink-400">Отсканируйте, чтобы открыть паспорт лота</p>
        </div>
      )}

      <LotGuestAnalytics lot={lot} records={records} />
    </div>
  );
}
