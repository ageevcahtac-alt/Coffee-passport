'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/adminClient'
import { safeNextPath } from '@/lib/auth/safeRedirect'
import { baristaCardExists, grantPendingBaristaRights } from '@/lib/auth/grantBaristaRights'
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

function toLogin(next: string, error: string): never {
  redirect(`/auth/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(error)}`)
}

// First sign-in of a login the cafe created (or re-issued) with a temporary
// password (see app/api/cafe/staff/barista-accounts/route.ts). Only an account
// that still carries the flag can use this — it is not a general "change
// password without the old one" — and only within the 72 hours.
//
// Order matters: first one admin call sets the own password and clears the
// flag, only then barista rights are granted from the binding the cafe left in
// app_metadata (lib/auth/grantBaristaRights.ts). So a temporary password never
// holds the rights, even for a moment. If the grant fails after the password
// is saved, the next login with the own password finishes it (app/auth/actions.ts).
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
    toLogin(next, TEMPORARY_PASSWORD_EXPIRED_MESSAGE)
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
  if (binding && !(await baristaCardExists(admin, binding))) {
    backWithError(next, 'Кофейня удалила эту учётку. Попросите её создать доступ заново.')
  }

  // The cafe may have issued a new temporary password since this session
  // started: then this request (made with the old one) must not overwrite it.
  // Compare-and-set on the expiry the cafe stamps on every issue; what is
  // left is the gap between this read and the update below.
  const current = await admin.auth.admin.getUserById(user.id)
  if (
    current.error ||
    current.data.user?.app_metadata?.must_change_password !== true ||
    current.data.user.app_metadata.temporary_password_expires_at !== user.app_metadata?.temporary_password_expires_at
  ) {
    await supabase.auth.signOut()
    toLogin(next, 'Кофейня выдала новый временный пароль. Войдите с ним.')
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
  if (failed) backWithError(next, saveFailed)

  if (binding) {
    const granted = await grantPendingBaristaRights(admin, user.id, binding)
    if (granted === 'reissued') toLogin(next, 'Кофейня только что выдала новый временный пароль. Войдите с ним.')
    if (granted !== 'granted') toLogin(next, 'Пароль сохранён, но кабинет не открылся. Войдите с новым паролем ещё раз.')
  }

  // GoTrue ends the account's sessions on an admin password change — sign in
  // again with the new password so the barista lands in the cabinet, not on
  // the login form.
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email ?? '', password })
  if (signInError) toLogin(next, 'Пароль сохранён. Войдите с новым паролем.')

  revalidatePath('/', 'layout')
  redirect(next)
}
