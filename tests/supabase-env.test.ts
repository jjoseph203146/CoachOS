import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readSupabaseEnv, SupabaseConfigError } from '@/lib/supabase/env'

/**
 * A malformed NEXT_PUBLIC_SUPABASE_URL used to crash the middleware inside the
 * Supabase client, which a deployed site shows as an opaque
 * "MIDDLEWARE_INVOCATION_FAILED". Harmless mistakes (whitespace, quotes, a
 * missing https://, a trailing path) are now tidied; the rest fail with a
 * message that names the variable.
 */

const KEY = 'eyJhbGciOiJIUzI1NiJ9.e30.abc'
const saved = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}

/** `null` means "not set at all". */
const set = (url: string | null | undefined, key: string | null | undefined = KEY) => {
  if (url == null) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = url
  if (key == null) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key
}

beforeEach(() => set(null, null))
afterEach(() => {
  set(saved.url, saved.key)
})

describe('readSupabaseEnv', () => {
  it('accepts a normal project URL unchanged', () => {
    set('https://abc.supabase.co')
    expect(readSupabaseEnv()).toEqual({ url: 'https://abc.supabase.co', anonKey: KEY })
  })

  it.each([
    ['surrounding whitespace', '  https://abc.supabase.co  '],
    ['a trailing newline', 'https://abc.supabase.co\n'],
    ['double quotes', '"https://abc.supabase.co"'],
    ['single quotes', "'https://abc.supabase.co'"],
    ['quotes and spaces', ' "https://abc.supabase.co" '],
    ['a trailing slash', 'https://abc.supabase.co/'],
    ['an API path pasted from the docs', 'https://abc.supabase.co/rest/v1/'],
    ['no https://', 'abc.supabase.co'],
  ])('tidies %s', (_name, value) => {
    set(value)
    expect(readSupabaseEnv()?.url).toBe('https://abc.supabase.co')
  })

  it('accepts a local Supabase (http, with a port)', () => {
    set('http://127.0.0.1:54321')
    expect(readSupabaseEnv()?.url).toBe('http://127.0.0.1:54321')
    set('http://localhost:54321')
    expect(readSupabaseEnv()?.url).toBe('http://localhost:54321')
  })

  it('tidies the key too', () => {
    set('https://abc.supabase.co', `"${KEY}"\n`)
    expect(readSupabaseEnv()?.anonKey).toBe(KEY)
  })

  it.each([
    ['a placeholder', 'your-project-url'],
    ['a non-web scheme', 'ftp://abc.supabase.co'],
    ['nonsense', 'https://'],
  ])('refuses %s, naming the variable', (_name, value) => {
    set(value)
    expect(() => readSupabaseEnv()).toThrow(SupabaseConfigError)
    expect(() => readSupabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('never echoes the bad value back', () => {
    set('secret-looking-placeholder')
    try {
      readSupabaseEnv()
      throw new Error('expected a throw')
    } catch (error) {
      expect((error as Error).message).not.toContain('secret-looking-placeholder')
    }
  })

  it('refuses a key with whitespace inside it', () => {
    set('https://abc.supabase.co', 'eyJ abc def')
    expect(() => readSupabaseEnv()).toThrow(/ANON_KEY/)
  })

  it('treats a missing URL or key as "not configured", not an error', () => {
    expect(readSupabaseEnv()).toBeNull()
    set('https://abc.supabase.co', null)
    expect(readSupabaseEnv()).toBeNull()
    set(null, KEY)
    expect(readSupabaseEnv()).toBeNull()
    set('   ', KEY)
    expect(readSupabaseEnv()).toBeNull()
  })
})
