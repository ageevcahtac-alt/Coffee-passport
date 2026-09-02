'use client';

import { useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { downloadLotQrPdf } from '@/lib/utils/qrPdf';
import { useLots } from '@/lib/data/useLots';
import { useAnonymizedCheckins } from '@/lib/data/useAnonymizedCheckins';
import { getRoasterById } from '@/lib/data/roasters';
import { saveLot } from '@/lib/data/lotsStore';
import { ROAST_TYPE_LABELS, type Lot } from '@/lib/types/coffee';
import type { AnonymizedCheckin } from '@/lib/data/checkinsRoasterView';
import { LotGuestAnalytics } from '@/components/roaster/LotGuestAnalytics';
import { CommunityHighlights } from '@/components/coffee/CommunityHighlights';
import { useStaffSession } from '@/lib/auth/staffSession';

type CatalogTab = 'active' | 'archived';

export default function RoasterDashboardPage() {
  const { roasterId } = useStaffSession();
  const lots = useLots();
  const { checkins, loading: checkinsLoading } = useAnonymizedCheckins();
  const roaster = roasterId ? getRoasterById(roasterId) : undefined;
  const myLots = lots.filter((lot) => lot.roasterId === roasterId);

  const [tab, setTab] = useState<CatalogTab>('active');
  const [openCountry, setOpenCountry] = useState<string | null>(null);

  // "Снять с обжарки" only flips Lot.inRoasterCatalog — it never touches
  // check-in history or a guest's already-saved passport (see the field's
  // own doc comment in lib/types/coffee.ts), so archiving here is safe to
  // undo any time without losing anything.
  const activeLots = myLots.filter((lot) => lot.inRoasterCatalog);
  const archivedLots = myLots.filter((lot) => !lot.inRoasterCatalog);
  const shownLots = tab === 'active' ? activeLots : archivedLots;

  const countryGroups = new Map<string, Lot[]>();
  for (const lot of shownLots) {
    const group = countryGroups.get(lot.country) ?? [];
    group.push(lot);
    countryGroups.set(lot.country, group);
  }
  const sortedCountries = Array.from(countryGroups.keys()).sort((a, b) => a.localeCompare(b));

  function toggleCatalog(lot: Lot) {
    saveLot({ ...lot, inRoasterCatalog: !lot.inRoasterCatalog });
  }

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

        <div role="tablist" aria-label="Каталог лотов" className="flex gap-1.5 mb-6">
          <TabButton
            active={tab === 'active'}
            onClick={() => setTab('active')}
            label={`Активные лоты (${activeLots.length})`}
          />
          <TabButton
            active={tab === 'archived'}
            onClick={() => setTab('archived')}
            label={`Архив / Сняты с обжарки (${archivedLots.length})`}
          />
        </div>

        {shownLots.length === 0 ? (
          <p className="text-ink-500 text-sm">
            {myLots.length === 0
              ? 'Пока нет ни одного лота. Добавьте первый, чтобы сгенерировать его паспорт.'
              : tab === 'active'
                ? 'Все лоты сейчас в архиве.'
                : 'Архив пуст — сюда попадают лоты, снятые с обжарки.'}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {sortedCountries.map((country) => {
              const countryLots = countryGroups.get(country) ?? [];
              const isOpen = openCountry === country;
              return (
                <div
                  key={country}
                  className="rounded-md border border-ink-200 bg-parchment-100 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenCountry(isOpen ? null : country)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <h2 className="font-display text-lg text-ink-900 leading-tight">{country}</h2>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-ink-400">{countryLots.length} лотов</span>
                      <span
                        className={`text-ink-400 text-lg leading-none transition-transform ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                        aria-hidden="true"
                      >
                        ⌄
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="flex flex-col gap-4 px-5 pb-5">
                      {countryLots.map((lot) => (
                        <LotRow
                          key={lot.id}
                          lot={lot}
                          checkins={checkins}
                          loading={checkinsLoading}
                          onToggleCatalog={() => toggleCatalog(lot)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors
                  ${active ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium' : 'border-ink-200 text-ink-500'}`}
    >
      {label}
    </button>
  );
}

function LotRow({
  lot,
  checkins,
  loading,
  onToggleCatalog,
}: {
  lot: Lot;
  checkins: AnonymizedCheckin[];
  loading: boolean;
  onToggleCatalog: () => void;
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const roaster = getRoasterById(lot.roasterId);

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      await downloadLotQrPdf({
        lotId: lot.id,
        lotName: lot.name,
        roasterName: roaster?.name ?? 'Обжарщик',
        url: `${window.location.origin}/passport/${lot.id}`,
      });
    } finally {
      setDownloadingPdf(false);
    }
  }

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
    <div className="rounded-md border border-ink-200 bg-parchment-200 p-5">
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
        {!lot.inRoasterCatalog && (
          <span
            className="rounded-full border border-dashed border-ink-300 bg-parchment-100
                       text-ink-500 text-[11px] px-2.5 py-1"
          >
            В архиве
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 mb-4">
        <div>
          <p className="text-sm text-ink-900">
            {lot.inRoasterCatalog ? 'В каталоге обжарщика' : 'Снят с обжарки'}
          </p>
          <p className="text-xs text-ink-400">
            {lot.inRoasterCatalog
              ? 'Кофейни могут заказать этот лот в меню.'
              : 'Кофейни не смогут заказать этот лот заново — уже добавленные меню не затронуты.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={lot.inRoasterCatalog}
          aria-label="Снять с обжарки"
          onClick={onToggleCatalog}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full
                      transition-colors ${lot.inRoasterCatalog ? 'bg-ink-900' : 'bg-ink-200'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-parchment-100
                        transition-transform ${lot.inRoasterCatalog ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
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
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={downloadingPdf}
          className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900
                     disabled:opacity-40 disabled:pointer-events-none"
        >
          {downloadingPdf ? 'Готовим PDF…' : 'Скачать QR (PDF)'}
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

      <LotGuestAnalytics lot={lot} checkins={checkins} loading={loading} />
    </div>
  );
}
