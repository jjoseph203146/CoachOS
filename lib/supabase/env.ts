/**
 * Supabase configuration is read from the environment only. Keys are never
 * hard-coded and never committed — see .env.example.
 */

export interface SupabaseEnv {
  url: string
  anonKey: string
}

export function readSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return { url, anonKey }
}

/** True when the app should talk to a real Supabase project. */
export function isSupabaseConfigured(): boolean {
  return readSupabaseEnv() !== null
}
