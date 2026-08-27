import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-dvh flex flex-col bg-parchment-200">
      {/* Hero */}
      <section className="flex-1 flex flex-col justify-center px-6 py-16 max-w-md mx-auto w-full">
        <div
          className="q-seal mb-8 animate-in fade-in zoom-in-95 duration-300"
          aria-hidden="true"
        >
          <span className="q-seal-value">87.0</span>
          <span className="q-seal-label">Q-Score</span>
        </div>

        <h1 className="font-display text-4xl leading-[1.1] text-ink-900 mb-4">
          Discover your
          <br />
          coffee taste.
        </h1>

        <p className="text-ink-500 text-base leading-relaxed mb-10 max-w-xs">
          Scan coffee. Remember what you drink. Build your personal coffee taste.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/scan"
            className="inline-flex items-center justify-center rounded-md bg-ink-900
                       text-parchment-100 font-body font-medium text-sm px-6 py-4
                       hover:bg-ink-800 transition-colors"
          >
            Scan coffee
          </Link>
          <Link
            href="/journey"
            className="inline-flex items-center justify-center rounded-md border
                       border-ink-200 text-ink-700 font-body font-medium text-sm px-6 py-4
                       hover:bg-parchment-300 transition-colors"
          >
            My coffee journey
          </Link>
        </div>
      </section>

      <footer className="px-6 pb-8">
        <p className="text-[11px] text-ink-300 font-body">
          Every lot, tasted and remembered.
        </p>
      </footer>
    </main>
  );
}