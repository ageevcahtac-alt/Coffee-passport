// Framework/stub for the next stage: aggregate analytics over guest
// feedback (average ratings, trends by lot/barista) beyond the raw recent
// feed shown on the main screen — see components/cafe/GuestFeedback.tsx.
export default function CafeAnalyticsPage() {
  return (
    <div className="rounded-md border border-dashed border-ink-200 bg-parchment-100 px-6 py-16 text-center">
      <p className="text-3xl mb-4" aria-hidden="true">
        📊
      </p>
      <h2 className="font-display text-xl text-ink-900 mb-2">Аналитика и отзывы</h2>
      <p className="text-ink-500 text-sm max-w-sm mx-auto">
        Здесь появится полная сводка отзывов и динамика оценок по лотам и бариста. В разработке —
        следующий этап.
      </p>
    </div>
  );
}
