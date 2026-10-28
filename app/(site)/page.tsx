import Link from 'next/link';
import { BecomePartnerSection } from '@/components/site/BecomePartnerSection';
import { EnthusiastAuthForm } from '@/components/site/EnthusiastAuthForm';
import { FourPhilosophies } from '@/components/site/FourPhilosophies';
import { cabinetPathFor } from '@/lib/auth/cabinet';
import { getSiteSession } from '@/lib/auth/siteSession';

export default async function LandingPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  // С сессией формы входа, регистрации и партнёрская не нужны — вместо них
  // переход в кабинет своей роли (lib/auth/cabinet.ts).
  const session = await getSiteSession();

  return (
    <main className="min-h-dvh flex flex-col bg-parchment-200">
      <FourPhilosophies />

      <section className="flex-1 px-6 pt-12 pb-16 max-w-4xl mx-auto w-full">
        {session ? (
          <div className="max-w-sm mx-auto w-full rounded-md border border-ink-200 bg-parchment-100 p-6 text-center">
            <p className="text-sm text-ink-500">Вы вошли как</p>
            <p className="mt-1 font-body font-medium text-ink-900 break-all">{session.email}</p>
            <Link
              href={cabinetPathFor(session.role)}
              className="mt-6 flex items-center justify-center rounded-md bg-ink-900 text-parchment-100
                         font-body font-medium text-sm px-6 py-4 hover:bg-ink-800 transition-colors"
            >
              Перейти в кабинет
            </Link>
          </div>
        ) : (
          <>
            <EnthusiastAuthForm error={searchParams.error} />

            <BecomePartnerSection />
          </>
        )}
      </section>

      <footer className="px-6 pb-8 text-center">
        <p className="text-[11px] text-ink-300 font-body">Every lot, tasted and remembered.</p>
      </footer>
    </main>
  );
}
