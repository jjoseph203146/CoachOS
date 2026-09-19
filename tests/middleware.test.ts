import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The middleware runs on every page request. If it throws, a deployed site
 * shows an opaque platform error, so every failure mode must end in a response
 * a person can act on.
 */

const getUser = vi.fn()
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser } })),
}))

import { middleware } from '../middleware'

const KEY = 'eyJhbGciOiJIUzI1NiJ9.e30.abc'
const saved = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}
const request = (path: string) => new NextRequest(`https://app.example.com${path}`)

beforeEach(() => {
  getUser.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = KEY
})
afterEach(() => {
  vi.restoreAllMocks()
  if (saved.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url
  if (saved.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key
})

describe('middleware', () => {
  it('explains a malformed Supabase URL instead of crashing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'your-project-url'
    const response = await middleware(request('/dashboard'))
    expect(response.status).toBe(503)
    const body = await response.text()
    expect(body).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(body).toContain('redeploy')
    expect(body).not.toContain('your-project-url')
    expect(getUser).not.toHaveBeenCalled()
  })

  it('does the same on public pages, which would fail just as badly', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '"https://"'
    expect((await middleware(request('/login'))).status).toBe(503)
  })

  it('carries on when the URL is merely untidy', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ' "abc.supabase.co" '
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const response = await middleware(request('/dashboard'))
    expect(response.status).toBe(200)
  })

  it('passes everything through when Supabase is simply not configured (local demo)', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    const response = await middleware(request('/dashboard'))
    expect(response.status).toBe(200)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('says so when the session check itself blows up, rather than a platform error', async () => {
    getUser.mockRejectedValue(new Error('socket hang up'))
    const response = await middleware(request('/dashboard'))
    expect(response.status).toBe(503)
    expect(await response.text()).toContain('temporarily unavailable')
  })

  it('still sends signed-out visitors to sign in', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    const response = await middleware(request('/dashboard'))
    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login')
  })

  it('lets a signed-out visitor reach the login page and invitation links', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect((await middleware(request('/login'))).status).toBe(200)
    expect((await middleware(request('/invite/abc123'))).status).toBe(200)
  })

  it('keeps a signed-in visitor off the login page', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const response = await middleware(request('/login'))
    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location')!).pathname).toBe('/dashboard')
  })

  it('lets a removed coach reach the removal screen (it is not a public page, so it needs a session)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    expect((await middleware(request('/removed'))).status).toBe(200)
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect((await middleware(request('/removed'))).status).toBe(307)
  })
})
