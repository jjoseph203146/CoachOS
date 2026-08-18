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

/**
 * Inputs to the backend decision.
 *
 * They are parameters rather than direct `process.env` reads inside the
 * function because bundlers (Vite, Next) statically inline `process.env.NODE_ENV`
 * at transform time, which makes the decision untestable. Production callers
 * use the defaults.
 */
export interface BackendOptions {
  nodeEnv?: string
  /**
   * Escape hatch for running a production build against the demo store
   * (e.g. a deliberately public demo). Must be set on purpose; a
   * misconfigured deploy cannot drift into it.
   */
  allowDemoInProduction?: boolean
}

/**
 * Which backend this process should use.
 *
 * Without Supabase credentials the app falls back to an in-memory demo store
 * whose "auth" hands every visitor the same seeded coach. That is the right
 * behaviour for local development and a serious data exposure in production,
 * so a production runtime refuses to start in that mode rather than silently
 * serving shared, unauthenticated data.
 */
export function resolveBackend(options: BackendOptions = {}): 'supabase' | 'demo' {
  if (isSupabaseConfigured()) return 'supabase'

  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV
  const allowDemo =
    options.allowDemoInProduction ?? process.env.COACHOS_ALLOW_DEMO_MODE === 'true'

  if (nodeEnv === 'production' && !allowDemo) {
    throw new Error(
      'CoachOS is running in production without Supabase configured. ' +
        'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Refusing to start in demo mode, which would serve the same seeded ' +
        'data to every visitor with no authentication. ' +
        '(Set COACHOS_ALLOW_DEMO_MODE=true only if you genuinely intend a ' +
        'public demo build.)',
    )
  }

  return 'demo'
}

/** True when this process is serving the in-memory demo store. */
export function isDemoMode(options: BackendOptions = {}): boolean {
  return resolveBackend(options) === 'demo'
}
