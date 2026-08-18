'use client'

import { createBrowserClient } from '@supabase/ssr'
import { readSupabaseEnv } from './env'

export function createSupabaseBrowserClient() {
  const env = readSupabaseEnv()
  if (!env) throw new Error('Supabase is not configured')
  return createBrowserClient(env.url, env.anonKey)
}
