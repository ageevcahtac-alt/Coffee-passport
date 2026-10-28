import { BecomePartnerSection } from '@/components/site/BecomePartnerSection';
import { EnthusiastAuthForm } from '@/components/site/EnthusiastAuthForm';
import { FourPhilosophies } from '@/components/site/FourPhilosophies';

export default function LandingPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="min-h-dvh flex flex-col bg-parchment-200">
      <FourPhilosophies />

      <section className="flex-1 px-6 pt-12 pb-16 max-w-4xl mx-auto w-full">
        <EnthusiastAuthForm error={searchParams.error} />

        <BecomePartnerSection />
      </section>

      <footer className="px-6 pb-8 text-center">
        <p className="text-[11px] text-ink-300 font-body">Every lot, tasted and remembered.</p>
      </footer>
    </main>
  );
}
