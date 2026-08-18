import type { MetadataRoute } from 'next'

/**
 * CoachOS is a private application, so indexing is off by default — that is the
 * safe posture for a beta whose URLs are shared by hand.
 *
 * Set NEXT_PUBLIC_ALLOW_INDEXING=true once there is a public marketing page
 * worth indexing. Application routes stay disallowed either way.
 */
export default function robots(): MetadataRoute.Robots {
  const allowIndexing = process.env.NEXT_PUBLIC_ALLOW_INDEXING === 'true'

  if (!allowIndexing) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard',
          '/schedule',
          '/players',
          '/payments',
          '/sessions',
          '/settings',
          '/onboarding',
          '/auth',
          '/reset-password',
        ],
      },
    ],
  }
}
