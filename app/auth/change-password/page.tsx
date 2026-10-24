import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/auth/safeRedirect';
import { changeTemporaryPassword } from './actions';

export const dynamic = 'force-dynamic';

const fieldClasses = 'mt-1 w-full rounded-md border border-ink-200 px-3 py-2';

// Landing for requireStaffRole.ts when the account still has the temporary
// password the cafe set for it.
export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const next = safeNextPath(searchParams.next ?? '/');
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  if (user.app_metadata?.must_change_password !== true) redirect(next);

  return (
    <main className="min-h-dvh flex items-center justify-center bg-parchment-200 px-6">
      <div className="w-full max-w-sm rounded-md border border-ink-200 bg-parchment-100 p-6">
        <p className="text-xs uppercase tracking-widest text-ink-400">Coffee Passport</p>
        <h1 className="mt-3 mb-4 font-display text-3xl text-ink-900">Задайте свой пароль</h1>
        <p className="mb-5 text-sm text-ink-600">
          Кофейня выдала вам временный пароль. Придумайте свой — после этого откроется кабинет.
        </p>
        {searchParams.error && (
          <p role="alert" className="mb-4 text-sm text-rating">
            {searchParams.error}
          </p>
        )}
        <form action={changeTemporaryPassword} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <label className="text-sm text-ink-700">
            Новый пароль
            <input id="new-password" name="password" type="password" autoComplete="new-password"
              minLength={12} maxLength={128} required className={fieldClasses} />
          </label>
          <label className="text-sm text-ink-700">
            Повторите пароль
            <input id="new-password-confirmation" name="confirmation" type="password" autoComplete="new-password"
              minLength={12} maxLength={128} required className={fieldClasses} />
          </label>
          <button type="submit" className="rounded-md bg-ink-900 px-4 py-3 text-parchment-100">
            Сохранить и войти
          </button>
        </form>
      </div>
    </main>
  );
}
