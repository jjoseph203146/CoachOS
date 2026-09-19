/**
 * Supabase configuration is read from the environment only. Keys are never
 * hard-coded and never committed — see .env.example.
 */

export interface SupabaseEnv {
  url: string
  anonKey: string
}

/** The URL or key is set, but is not something Supabase could work with. */
export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SupabaseConfigError'
  }
}

/**
 * Pasting a value into a hosting dashboard often adds a trailing newline or
 * wraps it in quotes. None of that is meaningful, so it is removed rather than
 * turned into an outage.
 */
function clean(value: string | undefined): string {
  let v = (value ?? '').trim()
  const first = v[0]
  if (v.length >= 2 && (first === '"' || first === "'") && v[v.length - 1] === first) {
    v = v.slice(1, -1).trim()
  }
  return v
}

/**
 * The project's origin (`https://<ref>.supabase.co`), or null if `raw` is not a
 * usable URL. A missing scheme is assumed to be https, and any path is dropped:
 * the client appends its own (`/auth/v1`, `/rest/v1`).
 */
function normaliseUrl(raw: string): string | null {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    // "your-project-url" and friends: a real host has a dot (or is localhost).
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null
    return url.origin
  } catch {
    return null
  }
}

/**
 * The Supabase settings, tidied. `null` means "not configured" (either value
 * absent). A value that IS set but cannot work throws `SupabaseConfigError` —
 * naming the variable, never echoing its value — instead of surfacing later as
 * an opaque crash from inside the Supabase client.
 */
export function readSupabaseEnv(): SupabaseEnv | null {
  const rawUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const anonKey = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  if (!rawUrl || !anonKey) return null

  const url = normaliseUrl(rawUrl)
  if (!url) {
    throw new SupabaseConfigError(
      'NEXT_PUBLIC_SUPABASE_URL is not a valid URL. It should look like ' +
        'https://<project-ref>.supabase.co (Supabase → Project Settings → API → Project URL).',
    )
  }
  if (/\s/.test(anonKey)) {
    throw new SupabaseConfigError(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY contains whitespace. Paste the key as a single line.',
    )
  }
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
