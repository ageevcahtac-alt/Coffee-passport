'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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