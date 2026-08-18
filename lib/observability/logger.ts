import 'server-only'

/**
 * Structured server-side logging.
 *
 * Two rules:
 *  1. Log enough to diagnose a failure — the operation, the error, a request
 *     id — and nothing that identifies a player or a coach. Names, emails,
 *     phone numbers and amounts stay out of logs; they are the customer's
 *     data, not our telemetry.
 *  2. The user never sees any of this. `toActionError()` returns a generic,
 *     friendly message while the detail lands here.
 *
 * To wire up a real reporter (Sentry, Axiom, Logtail…), implement `report`
 * below — everything already funnels through it.
 */

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogFields {
  /** The operation that failed, e.g. 'recordPayment'. */
  operation: string
  /** Stable, non-identifying extras — counts, codes, durations. */
  [key: string]: unknown
}

interface Reporter {
  capture(level: LogLevel, message: string, fields: LogFields, error?: unknown): void
}

let reporter: Reporter | null = null

/** Install an external error reporter. Call once, from instrumentation. */
export function setReporter(next: Reporter): void {
  reporter = next
}

function serialiseError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      // Stacks are safe: they are our code paths, not customer data.
      stack: process.env.NODE_ENV === 'production' ? error.stack : undefined,
    }
  }
  return { errorMessage: String(error) }
}

function emit(
  level: LogLevel,
  message: string,
  fields: LogFields,
  error?: unknown,
): void {
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...fields,
    ...(error ? serialiseError(error) : {}),
  }

  // Structured single-line JSON so log drains can parse it.
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)

  try {
    reporter?.capture(level, message, fields, error)
  } catch {
    // A broken reporter must never break the request.
  }
}

export function logError(message: string, fields: LogFields, error?: unknown): void {
  emit('error', message, fields, error)
}

export function logWarn(message: string, fields: LogFields): void {
  emit('warn', message, fields)
}

export function logInfo(message: string, fields: LogFields): void {
  emit('info', message, fields)
}
