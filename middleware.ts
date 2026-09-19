import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { readSupabaseEnv, SupabaseConfigError } from '@/lib/supabase/env'

/**
 * Refreshes the Supabase auth session on every request and mirrors the rotated
 * cookies onto the response. Without this, an expiring access token would only
 * be refreshed in the browser and server components would start seeing a
 * signed-out user.
 *
 * Also acts as the outer gate on authenticated routes: an unauthenticated
 * request is redirected to /login before any page code runs.
 */

const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/offline',
  '/forgot-password',
  // Set by following an emailed link; the page itself verifies the session.
  '/reset-password',
  // Exchanges the emailed one-time code for a session.
  '/auth/callback',
  // An invitation link, opened by someone who is not signed in yet.
  '/invite',
]

/**
 * A response a person can act on. Without this, a throw inside middleware
 * reaches the visitor as an opaque platform error ("MIDDLEWARE_INVOCATION_FAILED")
 * with nothing to say what is wrong. Never includes a configuration value.
 */
function plain(status: number, message: string) {
  return new NextResponse(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  let env
  try {
    env = readSupabaseEnv()
  } catch (error) {
    const message = error instanceof SupabaseConfigError ? error.message : 'Supabase is misconfigured.'
    console.error(`[middleware] ${message}`)
    return plain(
      503,
      `CoachOS is not configured correctly.\n\n${message}\n\n` +
        'Fix the environment variable and redeploy (NEXT_PUBLIC_ values are baked in at build time).',
    )
  }

  // Without Supabase configured the app runs on the in-memory dev store and
  // there is no session to refresh.
  if (!env) return response
  const { url, anonKey } = env

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options })
        response = NextResponse.next({ request: { headers: request.headers } })
        response.cookies.set({ name, value, ...options })
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options })
        response = NextResponse.next({ request: { headers: request.headers } })
        response.cookies.set({ name, value: '', ...options })
      },
    },
  })

  let user
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (error) {
    // Not "signed out": we could not find out. Say so, rather than letting the
    // platform show an opaque error (or wrongly treating everyone as signed out).
    console.error('[middleware] could not check the session', error)
    return plain(503, 'CoachOS is temporarily unavailable. Please try again in a moment.')
  }

  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    // Only same-origin relative paths are echoed back, so this cannot be used
    // as an open redirect.
    redirectUrl.search = ''
    return NextResponse.redirect(redirectUrl)
  }

  if (user && (path === '/login' || path === '/signup')) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard'
    redirectUrl.search = ''
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets.
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|robots.txt).*)',
  ],
}
