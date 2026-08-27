import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLotById } from '@/lib/data/lots';
import { getRoasterById } from '@/lib/data/roasters';
import { LotPassport } from '@/components/coffee/LotPassport';

export default async function LotPassportPage({
  params,
}: {
  params: Promise<{ lotId: string }>;
}) {
  const { lotId } = await params;
  const lot = getLotById(lotId);
  if (!lot) notFound();

  const roaster = getRoasterById(lot.roasterId);
  if (!roaster) notFound();

  return (
    <main className="min-h-dvh flex flex-col px-6 py-16">
      <LotPassport lot={lot} roaster={roaster} />

      <div className="max-w-md mx-auto w-full mt-12">
        <Link
          href={`/passport/${lot.id}/taste`}
          className="inline-flex items-center justify-center w-full rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-6 py-4
                     hover:bg-ink-800 transition-colors"
        >
          Я пробую этот кофе
        </Link>
      </div>
    </main>
  );
}
