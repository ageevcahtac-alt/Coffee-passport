'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PILOT_STAFF_ROLES, type PilotStaffRole } from '@/lib/auth/pilotStaff'

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

// Dev-only convenience for DevRoleSwitcher's Кофейня/Обжарщик/Бариста
// buttons (components/dev/DevRoleSwitcher.tsx): each one is a fixed pilot
// account whose email/password live in env vars, never in this repo. This
// still goes through a real signInWithPassword — it doesn't fabricate a
// session or bypass the profile-role check in requireStaffRole.ts — so it
// only actually lands on the dashboard once that account:
//   1. exists (sign up once via /auth/login with the same email/password
//      you put in the env vars below), and
//   2. has its public.profiles row promoted to the right role/scope (see
//      the commented UPDATE statements in
//      supabase/migrations/0007_staff_profiles_rls.sql).
// Until both of those are done by hand, this just bounces to /auth/login
// with an explanatory error — same as any other wrong-role attempt.
//
// Required env vars, one pair per role (unset = that button's error state):
//   DEV_CAFE_ADMIN_EMAIL / DEV_CAFE_ADMIN_PASSWORD
//   DEV_ROASTER_ADMIN_EMAIL / DEV_ROASTER_ADMIN_PASSWORD
//   DEV_BARISTA_EMAIL / DEV_BARISTA_PASSWORD
const PILOT_ENV_KEYS: Record<PilotStaffRole, { email: string; password: string }> = {
  cafe_admin: { email: 'DEV_CAFE_ADMIN_EMAIL', password: 'DEV_CAFE_ADMIN_PASSWORD' },
  roaster_admin: { email: 'DEV_ROASTER_ADMIN_EMAIL', password: 'DEV_ROASTER_ADMIN_PASSWORD' },
  barista: { email: 'DEV_BARISTA_EMAIL', password: 'DEV_BARISTA_PASSWORD' },
}

export async function signInAsPilotStaff(formData: FormData) {
  const role = String(formData.get('role') || '') as PilotStaffRole
  const target = PILOT_STAFF_ROLES.find((candidate) => candidate.role === role)

  if (!target) {
    redirect('/')
  }

  const envKeys = PILOT_ENV_KEYS[role]
  const email = process.env[envKeys.email]
  const password = process.env[envKeys.password]

  if (!email || !password) {
    redirect(
      `/auth/login?next=${encodeURIComponent(target.dashboardPath)}&error=${encodeURIComponent(
        `Демо-аккаунт «${target.label}» не настроен — задайте ${envKeys.email} и ${envKeys.password} в .env.local.`
      )}`
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect(
      `/auth/login?next=${encodeURIComponent(target.dashboardPath)}&error=${encodeURIComponent(
        `Не удалось войти демо-аккаунтом «${target.label}»: ${error.message}`
      )}`
    )
  }

  revalidatePath('/', 'layout')
  redirect(target.dashboardPath)
}