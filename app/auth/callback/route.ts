import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/env'

/**
 * Landing point for links Supabase emails out — signup confirmation and
 * password recovery. Exchanges the one-time code for a session cookie, then
 * forwards the user on.
 *
 * `next` is constrained to a same-origin absolute path, so a crafted link
 * cannot turn this into an open redirect.
 */

const ALLOWED_NEXT = new Set([
  '/dashboard',
  '/onboarding',
  '/reset-password',
  '/settings',
])

function safeNext(raw: string | null): string {
  if (!raw) return '/dashboard'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  return ALLOWED_NEXT.has(raw) ? raw : '/dashboard'
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const next = safeNext(searchParams.get('next'))
  const code = searchParams.get('code')
  const errorDescription = searchParams.get('error_description')

  if (errorDescription) {
    const url = new URL('/login', origin)
    url.searchParams.set('error', 'link_invalid')
    return NextResponse.redirect(url)
  }

  if (!code || !isSupabaseConfigured()) {
    return NextResponse.redirect(new URL(next, origin))
  }

  const supabase = createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    const url = new URL('/login', origin)
    url.searchParams.set('error', 'link_expired')
    return NextResponse.redirect(url)
  }

  return NextResponse.redirect(new URL(next, origin))
}
