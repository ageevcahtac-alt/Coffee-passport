// Framework/stub for the next stage: managing the barista roster (see
// lib/data/baristas.ts, already used by the guest tasting flow) directly
// from the cafe cabinet — adding, renaming, deactivating staff.
export default function CafeTeamPage() {
  return (
    <div className="rounded-md border border-dashed border-ink-200 bg-parchment-100 px-6 py-16 text-center">
      <p className="text-3xl mb-4" aria-hidden="true">
        👥
      </p>
      <h2 className="font-display text-xl text-ink-900 mb-2">Команда и персонал</h2>
      <p className="text-ink-500 text-sm max-w-sm mx-auto">
        Здесь появится управление составом бариста: добавление, роли и статистика по отзывам
        гостей. В разработке — следующий этап.
      </p>
    </div>
  );
}
