import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getStore } from '@/lib/data'
import { getMockStore } from '@/lib/data/mock/store'
import type { DataStore } from '@/lib/data/store'
import type { Coach } from '@/lib/domain/types'
import { resolveBackend } from '@/lib/supabase/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { DomainError } from '@/lib/services/errors'

export interface AuthContext {
  coach: Coach
  coachId: string
  store: DataStore
}

/**
 * Resolve the signed-in coach.
 *
 * With Supabase configured this reads the verified session from the auth
 * cookie — the browser never tells us who it is. Without Supabase (local dev)
 * the seeded demo coach is used so the app is still clickable.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const store = getStore()

  // Demo mode is unauthenticated by construction; resolveBackend() has already
  // refused to allow it in a production runtime.
  if (resolveBackend() === 'demo') {
    const mock = getMockStore()
    const coach = await mock.getCoachByAuthId('demo-auth-user')
    if (!coach) return null
    return { coach, coachId: coach.id, store: mock }
  }

  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  let coach = await store.getCoachByAuthId(user.id)
  if (!coach) {
    // First sign-in after signup: create the coach profile row.
    coach = await store.createCoach(user.id, {
      name: (user.user_metadata?.name as string | undefined) ?? '',
      email: user.email ?? '',
    })
  }
  return { coach, coachId: coach.id, store }
})

/** For pages: redirect to /login when signed out. */
export async function requireCoachPage(): Promise<AuthContext> {
  const context = await getAuthContext()
  if (!context) redirect('/login')
  return context
}

/** For server actions: throw a domain error when signed out. */
export async function requireCoachAction(): Promise<AuthContext> {
  const context = await getAuthContext()
  if (!context) {
    throw new DomainError('UNAUTHENTICATED', 'Please sign in again.')
  }
  return context
}
