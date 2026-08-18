'use server'

import { redirect } from 'next/navigation'
import {
  loginSchema,
  passwordResetRequestSchema,
  passwordUpdateSchema,
  signupSchema,
} from '@/lib/validation/schemas'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSiteOrigin } from '@/lib/site-url'
import { checkRateLimit } from '@/lib/security/rate-limit'
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

    const limit = await checkRateLimit('signIn', data.email)
    if (!limit.allowed) {
      return fail(
        `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.`,
      )
    }

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

    const limit = await checkRateLimit('signUp', data.email)
    if (!limit.allowed) {
      return fail(
        `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.`,
      )
    }

    if (!isSupabaseConfigured()) {
      return ok({ needsConfirmation: false })
    }

    const supabase = createSupabaseServerClient()
    const { data: result, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { name: data.name },
        // Where the confirmation link lands. /auth/callback exchanges the code
        // for a session and then forwards to onboarding.
        emailRedirectTo: `${getSiteOrigin()}/auth/callback?next=/onboarding`,
      },
    })
    if (error) {
      return fail(error.message)
    }
    return ok({ needsConfirmation: !result.session })
  })
}

/**
 * Start a password reset. Always reports success, whether or not the address
 * has an account — otherwise this becomes an account-enumeration oracle.
 */
export async function requestPasswordResetAction(input: {
  email: string
}): Promise<ActionResult> {
  return runAction('requestPasswordReset', async () => {
    const data = passwordResetRequestSchema.parse(input)

    const limit = await checkRateLimit('passwordReset', data.email)
    if (!limit.allowed) {
      return fail(
        `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.`,
      )
    }

    if (!isSupabaseConfigured()) {
      return ok()
    }

    const supabase = createSupabaseServerClient()
    await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${getSiteOrigin()}/auth/callback?next=/reset-password`,
    })
    return ok()
  })
}

/**
 * Set a new password. Requires the recovery session established by following
 * the emailed link, so the caller has already proven control of the inbox.
 */
export async function updatePasswordAction(input: {
  password: string
  confirm: string
}): Promise<ActionResult> {
  return runAction('updatePassword', async () => {
    const data = passwordUpdateSchema.parse(input)

    if (!isSupabaseConfigured()) {
      return ok()
    }

    const supabase = createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return fail('That reset link has expired. Request a new one.')
    }

    const { error } = await supabase.auth.updateUser({ password: data.password })
    if (error) {
      return fail(error.message)
    }
    return ok()
  })
}

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = createSupabaseServerClient()
    await supabase.auth.signOut()
  }
  redirect('/login')
}
