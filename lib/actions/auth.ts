'use server'

import { redirect } from 'next/navigation'
import { loginSchema, signupSchema } from '@/lib/validation/schemas'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { fail, ok, runAction, type ActionResult } from './result'

/**
 * Sign in. Passwords are never stored or compared by this application —
 * Supabase Auth hashes and verifies them, and issues a session in an httpOnly
 * cookie (never localStorage).
 */
export async function signInAction(input: {
  email: string
  password: string
}): Promise<ActionResult> {
  return runAction('signIn', async () => {
    const data = loginSchema.parse(input)
    if (!isSupabaseConfigured()) {
      // Local development without Supabase: the seeded demo coach is already
      // "signed in". Nothing to verify, so just let them through.
      return ok()
    }
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    if (error) {
      // Deliberately generic: never reveal whether the account exists.
      return fail('Invalid email or password. Try again.')
    }
    return ok()
  })
}

export async function signUpAction(input: {
  name: string
  email: string
  password: string
  confirm: string
}): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  return runAction('signUp', async () => {
    const data = signupSchema.parse(input)
    if (!isSupabaseConfigured()) {
      return ok({ needsConfirmation: false })
    }
    const supabase = createSupabaseServerClient()
    const { data: result, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { name: data.name } },
    })
    if (error) {
      return fail(error.message)
    }
    return ok({ needsConfirmation: !result.session })
  })
}

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = createSupabaseServerClient()
    await supabase.auth.signOut()
  }
  redirect('/login')
}
