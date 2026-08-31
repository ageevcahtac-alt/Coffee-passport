'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PILOT_STAFF_PASSWORD, PILOT_STAFF_ROLES, type PilotStaffRole } from '@/lib/auth/pilotStaff'

export async function signInWithPassword(formData: FormData) {
  const supabase = await createClient()

  const email = String(formData.get('email') || '')
  const password = String(formData.get('password') || '')
  const next = String(formData.get('next') || '/')
  // Which page's form submitted this — /auth/login's standalone form vs the
  // enthusiast form embedded on the landing page — so a failed attempt
  // bounces back to where the guest actually was, not always /auth/login.
  const errorRedirect = String(formData.get('errorRedirect') || '/auth/login')

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    redirect(`${errorRedirect}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/', 'layout')
  redirect(next)
}

export async function signUpWithPassword(formData: FormData) {
  const supabase = await createClient()

  const email = String(formData.get('email') || '')
  const password = String(formData.get('password') || '')
  const next = String(formData.get('next') || '/')
  const errorRedirect = String(formData.get('errorRedirect') || '/auth/login')

  const { error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) {
    redirect(`${errorRedirect}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/', 'layout')
  redirect(next)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/auth/login')
}

// Dev-only, zero-setup convenience for DevRoleSwitcher's Кофейня/
// Обжарщик/Бариста buttons (components/dev/DevRoleSwitcher.tsx): each one
// is a fixed *@test.com pilot account (see lib/auth/pilotStaff.ts) that
// this action signs into, auto-creating it on first click if it doesn't
// exist yet, then seeds/heals its role via the
// public.dev_seed_staff_profile() RPC (see
// supabase/migrations/0008_dev_seed_staff_profile.sql) before landing on
// the dashboard. Every step is a real Supabase call — signInWithPassword,
// signUp, an RPC gated server-side by an email allowlist — nothing here
// fabricates a session or bypasses requireStaffRole.ts's own check; it
// just automates what a human would otherwise type by hand.
//
// The one thing this can't work around: if this Supabase project has
// "Confirm email" enabled (Authentication → Providers → Email), signUp
// won't hand back an active session until the address is confirmed, and
// there's no inbox for a *@test.com fixture to confirm from. If that's
// the case here, disable it once for this project — everything else is
// already zero-touch.
export async function signInAsPilotStaff(formData: FormData) {
  const role = String(formData.get('role') || '') as PilotStaffRole
  const target = PILOT_STAFF_ROLES.find((candidate) => candidate.role === role)

  if (!target) {
    redirect('/')
  }

  const supabase = await createClient()
  const credentials = { email: target.email, password: PILOT_STAFF_PASSWORD }

  const { error: signInError } = await supabase.auth.signInWithPassword(credentials)

  if (signInError) {
    // Most likely cause: this pilot account doesn't exist on this
    // Supabase project yet — create it. If some other problem caused the
    // sign-in to fail, signUp will surface its own (different) error
    // below instead of silently retrying forever.
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp(credentials)

    if (signUpError) {
      redirect(
        `/auth/login?next=${encodeURIComponent(target.dashboardPath)}&error=${encodeURIComponent(
          `Не удалось создать демо-аккаунт «${target.label}»: ${signUpError.message}`
        )}`
      )
    }

    if (!signUpData.session) {
      redirect(
        `/auth/login?next=${encodeURIComponent(target.dashboardPath)}&error=${encodeURIComponent(
          `Демо-аккаунт «${target.label}» создан, но проект Supabase требует подтверждения email — отключите "Confirm email" в Authentication → Providers для мгновенного входа.`
        )}`
      )
    }
  }

  // Idempotent — also heals the profile if it somehow reverted to the
  // trigger's default 'enthusiast' role, so this is safe to run on every
  // click, not just the first one.
  const { error: seedError } = await supabase.rpc('dev_seed_staff_profile')

  if (seedError) {
    redirect(
      `/auth/login?next=${encodeURIComponent(target.dashboardPath)}&error=${encodeURIComponent(
        `Не удалось назначить роль «${target.label}»: ${seedError.message}`
      )}`
    )
  }

  revalidatePath('/', 'layout')
  redirect(target.dashboardPath)
}