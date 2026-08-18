/**
 * Domain errors carry a user-safe message. Raw database/driver errors are
 * never surfaced to the UI — see `toActionError()` in lib/actions/result.ts.
 */

export type DomainErrorCode =
  | 'INVALID'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'UNAUTHENTICATED'

export class DomainError extends Error {
  readonly code: DomainErrorCode
  /** Field-level messages, for form rendering. */
  readonly fields?: Record<string, string>

  constructor(code: DomainErrorCode, message: string, fields?: Record<string, string>) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.fields = fields
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}
