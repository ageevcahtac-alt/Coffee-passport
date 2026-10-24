'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient'
import { safeNextPath } from '@/lib/auth/safeRedirect'

const MIN_LENGTH = 12
const MAX_LENGTH = 128

function backWithError(next: string, error: string): never {
  redirect(`/auth/change-password?next=${encodeURIComponent(next)}&error=${encodeURIComponent(error)}`)
}

// First sign-in of a login the cafe created with a temporary password
// (see app/api/cafe/staff/barista-accounts/route.ts). One admin call sets
// the new password and clears app_metadata.must_change_password together,
// so there is no state where the password changed but the cabinet stays
// locked (or the reverse). Only an account that still carries the flag can
// use this — it is not a general "change password without the old one".
export async function changeTemporaryPassword(formData: FormData) {
  const next = safeNextPath(String(formData.get('next') || '/'))
  const password = String(formData.get('password') || '')
  const confirmation = String(formData.get('confirmation') || '')

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(next)}`)
  if (user.app_metadata?.must_change_password !== true) redirect(next)

  if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) {
    backWithError(next, `Пароль — от ${MIN_LENGTH} до ${MAX_LENGTH} символов.`)
  }
  if (password !== confirmation) backWithError(next, 'Пароли не совпадают.')

  let failed = false
  try {
    const { error } = await createAdminSupabaseClient().auth.admin.updateUserById(user.id, {
      password,
      app_metadata: { must_change_password: false },
    })
    if (error) {
      console.error('[change-password] update failed:', error.code ?? error.status ?? 'unknown')
      failed = true
    }
  } catch {
    failed = true
  }
  if (failed) backWithError(next, 'Не удалось сохранить пароль. Выберите другой пароль и попробуйте ещё раз.')

  revalidatePath('/', 'layout')
  redirect(next)
}
