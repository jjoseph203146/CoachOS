import 'server-only'

import { headers } from 'next/headers'

/**
 * A small in-process throttle for unauthenticated endpoints.
 *
 * SCOPE — read this before relying on it. The counter lives in the memory of
 * one server instance. On a serverless platform each instance has its own, and
 * instances recycle, so this is a speed bump against casual bursts and
 * accidental double-submits, NOT a defence against a distributed attack.
 *
 * The real protections are:
 *  - Supabase Auth's own server-side rate limits (verify them under
 *    Authentication -> Rate Limits in the dashboard);
 *  - a WAF / platform-level rule if you need one (Vercel Firewall).
 *
 * Keeping it here still buys something: it blunts a single client hammering
 * sign-in, and it costs nothing.
 */

interface Bucket {
  count: number
  resetAt: number
}

const LIMITS: Record<string, { max: number; windowMs: number }> = {
  signIn: { max: 10, windowMs: 5 * 60_000 },
  signUp: { max: 5, windowMs: 60 * 60_000 },
  passwordReset: { max: 5, windowMs: 60 * 60_000 },
}

const globalRef = globalThis as unknown as {
  __coachosRateBuckets?: Map<string, Bucket>
}

function buckets(): Map<string, Bucket> {
  if (!globalRef.__coachosRateBuckets) {
    globalRef.__coachosRateBuckets = new Map()
  }
  return globalRef.__coachosRateBuckets
}

function clientKey(): string {
  try {
    const headerList = headers()
    const forwarded = headerList.get('x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0].trim()
    return headerList.get('x-real-ip') ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

/**
 * Count one attempt against `action`. `subject` (e.g. the submitted email)
 * is combined with the client IP so that one address cannot lock out another.
 */
export async function checkRateLimit(
  action: keyof typeof LIMITS | string,
  subject = '',
): Promise<RateLimitResult> {
  const config = LIMITS[action] ?? { max: 20, windowMs: 5 * 60_000 }
  const key = `${action}:${clientKey()}:${subject.toLowerCase()}`
  const now = Date.now()
  const store = buckets()

  // Opportunistic cleanup so the map cannot grow without bound.
  if (store.size > 5_000) {
    for (const [entryKey, bucket] of store) {
      if (bucket.resetAt <= now) store.delete(entryKey)
    }
  }

  const existing = store.get(key)
  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  existing.count += 1
  if (existing.count > config.max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }

  return { allowed: true, retryAfterSeconds: 0 }
}

/** Test seam: forget every counter. */
export function resetRateLimits(): void {
  buckets().clear()
}
