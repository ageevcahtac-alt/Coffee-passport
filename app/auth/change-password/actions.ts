'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient'
import { safeNextPath } from '@/lib/auth/safeRedirect'
import {
  TEMPORARY_PASSWORD_EXPIRED_MESSAGE,
  pendingBaristaBinding,
  temporaryPasswordState,
} from '@/lib/auth/temporaryPassword'

const MIN_LENGTH = 12
const MAX_LENGTH = 128

function backWithError(next: string, error: string): never {
  redirect(`/auth/change-password?next=${encodeURIComponent(next)}&error=${encodeURIComponent(error)}`)
}

// First sign-in of a login the cafe created (or re-issued) with a temporary
// password (see app/api/cafe/staff/barista-accounts/route.ts). Only an account
// that still carries the flag can use this — it is not a general "change
// password without the old one" — and only within the 72 hours.
//
// Barista rights are granted here, from the binding the cafe left in
// app_metadata: first profiles.role = 'barista', then one admin call sets the
// password and clears the flag. If that call fails the rights are taken back,
// so the temporary password never ends up holding them.
export async function changeTemporaryPassword(formData: FormData) {
  const next = safeNextPath(String(formData.get('next') || '/'))
  const password = String(formData.get('password') || '')
  const confirmation = String(formData.get('confirmation') || '')

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(next)}`)
  const temporary = temporaryPasswordState(user)
  if (temporary === 'none') redirect(next)
  if (temporary === 'expired') {
    await supabase.auth.signOut()
    redirect(`/auth/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(TEMPORARY_PASSWORD_EXPIRED_MESSAGE)}`)
  }

  if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) {
    backWithError(next, `Пароль — от ${MIN_LENGTH} до ${MAX_LENGTH} символов.`)
  }
  if (password !== confirmation) backWithError(next, 'Пароли не совпадают.')

  const saveFailed = 'Не удалось сохранить пароль. Выберите другой пароль и попробуйте ещё раз.'
  let admin: ReturnType<typeof createAdminSupabaseClient>
  try {
    admin = createAdminSupabaseClient()
  } catch {
    backWithError(next, saveFailed)
  }

  // A login created before the binding existed already has its profile.
  const binding = pendingBaristaBinding(user)
  if (binding) {
    const card = await admin
      .from('barista_profiles')
      .select('id')
      .eq('id', binding.baristaId)
      .eq('coffee_shop_id', binding.cafeId)
      .maybeSingle()
    if (card.error || !card.data) {
      backWithError(next, 'Кофейня удалила эту учётку. Попросите её создать доступ заново.')
    }
    const granted = await admin.from('profiles').upsert(
      { id: user.id, role: 'barista', cafe_id: binding.cafeId, roaster_id: null, barista_id: binding.baristaId },
      { onConflict: 'id' }
    )
    if (granted.error) {
      console.error('[change-password] grant failed:', granted.error.message)
      backWithError(next, saveFailed)
    }
  }

  let failed = false
  try {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      app_metadata: { must_change_password: false, temporary_password_expires_at: null },
    })
    if (error) {
      console.error('[change-password] update failed:', error.code ?? error.status ?? 'unknown')
      failed = true
    }
  } catch {
    failed = true
  }
  if (failed) {
    if (binding) await admin.from('profiles').update({ role: 'enthusiast', cafe_id: null, barista_id: null }).eq('id', user.id)
    backWithError(next, saveFailed)
  }

  // GoTrue ends the account's sessions on an admin password change — sign in
  // again with the new password so the barista lands in the cabinet, not on
  // the login form.
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email ?? '', password })
  if (signInError) {
    redirect(
      `/auth/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent('Пароль сохранён. Войдите с новым паролем.')}`
    )
  }

  revalidatePath('/', 'layout')
  redirect(next)
}
