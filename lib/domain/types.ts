/**
 * Core domain types for CoachOS.
 *
 * Money is ALWAYS integer cents. Never floats — see lib/domain/money.ts.
 * Dates are ISO `YYYY-MM-DD` strings (calendar dates, no timezone).
 * Times of day are integer minutes from midnight (e.g. 960 === 4:00 PM),
 * matching the design prototype's session model.
 */

export type ISODate = string // 'YYYY-MM-DD'

export type SessionType = 'private' | 'group'
export type SessionStatus = 'scheduled' | 'cancelled'

/**
 * Attendance is an explicit four-state enum.
 * `skipped` is NOT equivalent to `unmarked`: a skipped session is deliberately
 * excluded from attendance metrics and never reported as "attendance missing",
 * whereas `unmarked` means the coach still owes a decision.
 */
export type AttendanceStatus = 'unmarked' | 'present' | 'absent' | 'skipped'

/** Roll-up of a whole session's attendance, derived from its enrollments. */
export type SessionAttendanceState =
  | 'unmarked'
  | 'partial'
  | 'complete'
  | 'skipped'
  | 'na' // cancelled, or nobody enrolled

export type CoachLevel = 'Beginner' | 'Intermediate' | 'Advanced'

export type AttendanceWindow = 'Same day' | '24 hours' | '48 hours' | '72 hours'
export type Theme = 'Light' | 'Dark'

export interface Coach {
  id: string
  name: string
  email: string
  businessName: string
  /** Fallback rate used when a player has no rate of their own. */
  defaultRateCents: number
  attendanceWindow: AttendanceWindow
  theme: Theme
  /**
   * IANA timezone, e.g. 'America/Los_Angeles'. Every "today" and "has this
   * ended?" decision is made in this zone, never the server's.
   */
  timezone: string
  onboardedAt: string | null
}

export interface Player {
  id: string
  coachId: string
  name: string
  phone: string
  email: string
  level: CoachLevel
  /** Player's own default rate. `null` means "use the coach default". */
  defaultRateCents: number | null
  notes: string
  archived: boolean
  /**
   * Soft delete. Deleted players disappear from all active use but their
   * historical sessions, charges, payments and credits remain intact and
   * readable — we never hard-delete financial history.
   */
  deletedAt: string | null
  createdAt: string
}

export interface Session {
  id: string
  coachId: string
  type: SessionType
  name: string
  date: ISODate
  /** Start time as minutes from midnight. */
  startMin: number
  /** Duration in minutes. */
  durationMin: number
  /**
   * Per-player price at the time of scheduling, in cents.
   * 0 when `isFree` is true.
   */
  priceCents: number
  isFree: boolean
  location: string
  /** Group sessions only; `null` for private lessons. */
  capacity: number | null
  status: SessionStatus
  /** Coach explicitly chose to skip attendance for this session. */
  attendanceSkipped: boolean
  cancelledAt: string | null
  createdAt: string
}

export interface Enrollment {
  id: string
  coachId: string
  sessionId: string
  playerId: string
  attendance: AttendanceStatus
  createdAt: string
}

/**
 * A financial obligation. The charge amount is captured at creation time and
 * is historical: changing a player's default rate later never rewrites it.
 */
export interface Charge {
  id: string
  coachId: string
  playerId: string
  /** `null` for manual/ad-hoc charges not tied to a session. */
  sessionId: string | null
  amountCents: number
  dueDate: ISODate
  isManual: boolean
  /** Manual charges carry a label, e.g. "Racquet restring". */
  label: string
  note: string
  /** Non-null once voided (e.g. written off when a session was cancelled). */
  voidedAt: string | null
  voidNote: string
  createdAt: string
}

/** Money actually received. Revenue is the sum of these, never of charges. */
export interface Payment {
  id: string
  coachId: string
  chargeId: string
  amountCents: number
  paidOn: ISODate
  note: string
  createdAt: string
}

/** A reduction of an obligation that is not money received. */
export interface Credit {
  id: string
  coachId: string
  chargeId: string
  amountCents: number
  reason: string
  createdAt: string
}

/**
 * Display status of a charge, derived from its payments and credits.
 * Never stored — always computed. See lib/domain/finance.ts.
 */
export type ChargeStatus =
  | 'paid'
  | 'voided'
  | 'credited'
  | 'overdue'
  | 'partial'
  | 'unpaid'

/** A charge plus everything applied to it, ready for derivation. */
export interface ChargeWithActivity {
  charge: Charge
  payments: Payment[]
  credits: Credit[]
}

/** Fully derived financial view of one charge. */
export interface ChargeView {
  charge: Charge
  amountCents: number
  paidCents: number
  creditedCents: number
  outstandingCents: number
  status: ChargeStatus
  isPending: boolean
  isOverdue: boolean
}
