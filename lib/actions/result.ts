import 'server-only'

import { ZodError } from 'zod'
import { isDomainError } from '@/lib/services/errors'

/** Uniform result shape returned by every server action. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fields?: Record<string, string>; code?: string }

export function ok(): ActionResult<undefined>
export function ok<T>(data: T): ActionResult<T>
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data }
}

export function fail(
  error: string,
  fields?: Record<string, string>,
  code?: string,
): ActionResult<never> {
  return { ok: false, error, fields, code }
}

/**
 * Convert any thrown value into a user-safe result.
 *
 * Database driver messages, stack traces and internal identifiers are logged
 * server-side and replaced with a generic message — they are never returned to
 * the browser.
 */
export function toActionError(error: unknown, context: string): ActionResult<never> {
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {}
    for (const issue of error.issues) {
      const key = issue.path.join('.') || 'form'
      if (!fields[key]) fields[key] = issue.message
    }
    const first = error.issues[0]?.message ?? 'Please check the form and try again.'
    return fail(first, fields, 'INVALID')
  }

  if (isDomainError(error)) {
    return fail(error.message, error.fields, error.code)
  }

  // Anything else is unexpected: log the detail, show the user a safe message.
  console.error(`[coachos] ${context}`, error)
  return fail('Something went wrong. Please try again.', undefined, 'INTERNAL')
}

/** Wrap an action body so it always resolves to an ActionResult. */
export async function runAction<T>(
  context: string,
  body: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await body()
  } catch (error) {
    return toActionError(error, context)
  }
}
