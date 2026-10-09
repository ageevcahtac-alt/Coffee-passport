import Image from 'next/image';
import { BecomePartnerSection } from '@/components/site/BecomePartnerSection';
import { EnthusiastAuthForm } from '@/components/site/EnthusiastAuthForm';

export default function LandingPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="min-h-dvh flex flex-col bg-parchment-200">
      <section className="flex-1 px-6 py-16 max-w-4xl mx-auto w-full">
        <a
          href="/images/coffee-passport-four-philosophies.png"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Открыть изображение Coffee Passport в полном размере для увеличения"
          className="block mb-12 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-400"
        >
          <Image
            src="/images/coffee-passport-four-philosophies.png"
            alt="Один лот. Четыре философии: бариста, обжарщик, кофейня и кофейный энтузиаст вокруг Canonical Lot"
            width={1672}
            height={941}
            priority
            unoptimized
            className="block h-auto w-full"
          />
        </a>

        <EnthusiastAuthForm error={searchParams.error} />

        <BecomePartnerSection />
      </section>

      <footer className="px-6 pb-8 text-center">
        <p className="text-[11px] text-ink-300 font-body">Every lot, tasted and remembered.</p>
      </footer>
    </main>
  );
}
