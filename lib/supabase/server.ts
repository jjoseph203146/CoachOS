import 'server-only'

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { readSupabaseEnv } from './env'

/**
 * Server-side Supabase client bound to the request's cookies.
 *
 * Auth tokens live in httpOnly cookies managed by @supabase/ssr — never in
 * localStorage, so they are not reachable from client-side JavaScript.
 */
export function createSupabaseServerClient() {
  const env = readSupabaseEnv()
  if (!env) throw new Error('Supabase is not configured')
  const cookieStore = cookies()

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options })
        } catch {
          // Called from a Server Component render; middleware refreshes instead.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options })
        } catch {
          // As above.
        }
      },
    },
  })
}
