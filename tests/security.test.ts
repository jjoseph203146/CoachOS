import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkRateLimit, resetRateLimits } from '@/lib/security/rate-limit'
import { isDemoMode, resolveBackend } from '@/lib/supabase/env'

describe('production backend guard', () => {
  // `nodeEnv` is passed explicitly rather than mutated on process.env, because
  // bundlers (Vite here, Next in the app) inline `process.env.NODE_ENV` at
  // transform time, which would make this assertion vacuous. The real default
  // path is verified by starting the built server without credentials: every
  // authenticated route 500s with this message instead of serving demo data.
  const original = { ...process.env }

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    delete process.env.COACHOS_ALLOW_DEMO_MODE
  })

  afterEach(() => {
    process.env = { ...original }
  })

  it('uses the demo store in development when Supabase is absent', () => {
    expect(resolveBackend({ nodeEnv: 'development' })).toBe('demo')
    expect(isDemoMode({ nodeEnv: 'development' })).toBe(true)
  })

  it('REFUSES to run in production without Supabase', () => {
    // Demo mode serves the same seeded coach to every visitor with no
    // authentication. Failing loudly is the only safe behaviour here.
    expect(() => resolveBackend({ nodeEnv: 'production' })).toThrow(
      /without Supabase configured/i,
    )
  })

  it('allows a production demo build only when explicitly opted in', () => {
    expect(
      resolveBackend({ nodeEnv: 'production', allowDemoInProduction: true }),
    ).toBe('demo')
  })

  it('uses Supabase whenever both variables are present', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    expect(resolveBackend({ nodeEnv: 'production' })).toBe('supabase')
    expect(isDemoMode({ nodeEnv: 'production' })).toBe(false)
  })
})

describe('auth rate limiting', () => {
  beforeEach(() => resetRateLimits())

  it('allows attempts up to the limit, then blocks with a retry hint', async () => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      const result = await checkRateLimit('signIn', 'coach@example.com')
      expect(result.allowed, `attempt ${attempt} should be allowed`).toBe(true)
    }

    const blocked = await checkRateLimit('signIn', 'coach@example.com')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('counts each subject separately, so one address cannot lock out another', async () => {
    for (let attempt = 0; attempt < 11; attempt++) {
      await checkRateLimit('signIn', 'victim@example.com')
    }
    expect((await checkRateLimit('signIn', 'victim@example.com')).allowed).toBe(false)
    expect((await checkRateLimit('signIn', 'someone-else@example.com')).allowed).toBe(true)
  })

  it('applies a tighter limit to signup than to sign-in', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await checkRateLimit('signUp', 'new@example.com')).allowed).toBe(true)
    }
    expect((await checkRateLimit('signUp', 'new@example.com')).allowed).toBe(false)
  })

  it('is case-insensitive about the subject', async () => {
    for (let attempt = 0; attempt < 11; attempt++) {
      await checkRateLimit('signIn', 'Coach@Example.com')
    }
    expect((await checkRateLimit('signIn', 'coach@example.com')).allowed).toBe(false)
  })
})
