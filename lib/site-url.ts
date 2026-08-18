import 'server-only'

import { headers } from 'next/headers'

/**
 * Absolute origin of this deployment, used to build the redirect targets we
 * hand to Supabase for email confirmation and password reset links.
 *
 * Order of preference:
 *  1. NEXT_PUBLIC_SITE_URL — set this in production; it is the only value that
 *     is guaranteed correct behind proxies and for links sent by email.
 *  2. The forwarded host on the current request (works on Vercel previews).
 *  3. localhost, for development.
 *
 * The result is only ever used as a prefix for our own fixed paths, never
 * combined with user input, so it cannot become an open redirect.
 */
export function getSiteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/$/, '')

  try {
    const headerList = headers()
    const host = headerList.get('x-forwarded-host') ?? headerList.get('host')
    if (host) {
      const proto = headerList.get('x-forwarded-proto') ?? 'https'
      return `${proto}://${host}`
    }
  } catch {
    // headers() is unavailable outside a request scope; fall through.
  }

  return 'http://localhost:3000'
}
