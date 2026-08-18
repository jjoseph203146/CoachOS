import 'server-only'

import { isSupabaseConfigured } from '@/lib/supabase/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getMockStore } from './mock/store'
import { SupabaseDataStore } from './supabase/store'
import type { DataStore } from './store'

/**
 * Pick the data adapter for this request.
 *
 * With Supabase env vars present we talk to Postgres. Without them the app
 * falls back to the in-memory development store so a fresh clone still runs —
 * no fabricated credentials, no silent failure.
 */
export function getStore(): DataStore {
  if (isSupabaseConfigured()) {
    return new SupabaseDataStore(createSupabaseServerClient())
  }
  return getMockStore()
}

export { isSupabaseConfigured }
export type { DataStore }
