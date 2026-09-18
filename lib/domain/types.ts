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

/** A member's standing within their academy. Set only at creation — never changed in place. */
export type MembershipRole = 'owner' | 'coach'

/**
 * The business/tenant. Every coach-owned row (players, sessions, charges…)
 * scopes to an academy's id, shared by every member of that academy.
 */
export interface Academy {
  id: string
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
}

/** One person's standing within one academy — an owner or an invited coach. */
export interface Membership {
  id: string
  academyId: string
  authUserId: string
  role: MembershipRole
  name: string
  email: string
  onboardedAt: string | null
}

/**
 * Read-shaped join of a `Membership` and its `Academy`, kept for the ~150
 * call sites that scope data by `coach.id` (the academy/tenant id) and read
 * business settings directly off it (`coach.timezone`, `coach.businessName`).
 * `id` is deliberately the ACADEMY id, not the membership id — see
 * `membershipId` for the signed-in member's own row identity, needed only by
 * self-profile operations (Settings, Team).
 */
export interface Coach {
  id: string
  membershipId: string
  role: MembershipRole
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
  /** The program this session is an occurrence of; `null` for one-off sessions. */
  programId: string | null
  /** Who runs the session (a membership id); `null` for sessions from before this was recorded. */
  coachMembershipId: string | null
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
  /**
   * Planning, not attendance: is this player expected at the occurrence?
   * A non-expected player who is still unmarked never counts as missing.
   */
  expected: boolean
  createdAt: string
}

/** Where a charge's amount came from — see `Charge.priceSource`. */
export type PriceSource =
  | 'academy_default'
  | 'player_default'
  | 'session_price'
  | 'program_option'
  | 'custom'
  | 'manual'

/** What a charge's amount is per. */
export type PriceBasis =
  | 'per_session'
  | 'drop_in'
  | 'weekly'
  | 'monthly'
  | 'full_program'
  | 'custom'

/**
 * A financial obligation. The charge amount is captured at creation time and
 * is HISTORICAL: it is a snapshot of what was agreed, never re-derived from a
 * live price. Changing a player's rate, the academy default, a session's price
 * or a program's price options later never rewrites a charge that exists.
 */
export interface Charge {
  id: string
  coachId: string
  playerId: string
  /** `null` for manual/ad-hoc charges not tied to a session. */
  sessionId: string | null
  amountCents: number
  /**
   * Snapshot provenance, captured with the amount and immutable afterwards
   * (the only exception: an owner repricing a charge relabels it 'custom').
   * `standardAmountCents` is the standard price at that moment, so a discount
   * or premium is visible as `amountCents !== standardAmountCents`. There is
   * deliberately no reference to any live price row.
   */
  priceSource: PriceSource
  /** `null` for manual charges. */
  priceBasis: PriceBasis | null
  /** `null` when there was no standard price to compare against. */
  standardAmountCents: number | null
  /** Program charges: the program and the roster place whose agreement priced them. */
  programId: string | null
  programEnrollmentId: string | null
  /** Weekly/monthly program charges cover a period. */
  periodStart: ISODate | null
  periodEnd: ISODate | null
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

/** The hours one coach offers private lessons on one weekday. No row = unavailable. */
export interface AvailabilityWindow {
  id: string
  coachId: string
  membershipId: string
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number
  startMin: number
  endMin: number
}

export type ProgramAudience = 'youth' | 'adult'
export type ProgramStatus = 'active' | 'ended'
export type RosterStatus = 'active' | 'ended'
export type AgreementSource = 'program_option' | 'custom'

/**
 * A recurring group offering (a clinic, a camp). It has NO price of its own:
 * see `ProgramPriceOption`. Its occurrences are ordinary `Session`s that carry
 * `programId`.
 */
export interface Program {
  id: string
  coachId: string
  name: string
  audience: ProgramAudience
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[]
  startMin: number
  durationMin: number
  location: string
  /** `null` means no cap. */
  capacity: number | null
  ageRange: string
  startsOn: ISODate
  endsOn: ISODate | null
  status: ProgramStatus
  createdAt: string
}

/**
 * One way to pay for a program ("Weekly $150", "Drop-in $35"). Live
 * configuration: editing or archiving one never touches an existing
 * agreement or charge.
 */
export interface ProgramPriceOption {
  id: string
  coachId: string
  programId: string
  label: string
  basis: PriceBasis
  amountCents: number
  position: number
  archivedAt: string | null
}

/**
 * A participant's place in a program AND their agreed price. The agreed_*
 * fields are a snapshot taken when the agreement was made; `priceOptionId` is
 * context only. The agreed price may deliberately differ from the standard
 * (`agreementSource === 'custom'`, owner only).
 */
export interface ProgramEnrollment {
  id: string
  coachId: string
  programId: string
  playerId: string
  status: RosterStatus
  joinedOn: ISODate
  endedOn: ISODate | null
  priceOptionId: string | null
  agreedLabel: string
  agreedBasis: PriceBasis
  agreedAmountCents: number
  /** The option's price when the agreement was made. */
  standardAmountCents: number | null
  agreementSource: AgreementSource
  agreementNote: string
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
