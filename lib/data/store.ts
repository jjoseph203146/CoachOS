/**
 * Data-access port.
 *
 * Everything above this line (services, server actions, UI) talks to this
 * interface only — no Supabase client, SQL string or HTTP call ever appears
 * in a component or a service. Two adapters implement it:
 *
 *   lib/data/mock/store.ts      in-memory, for local development and tests
 *   lib/data/supabase/store.ts  Postgres via Supabase, for real deployments
 *
 * Every method takes an explicit `coachId` and every implementation MUST scope
 * its reads and writes to that coach. The Supabase adapter is additionally
 * protected by row-level security in the database, so authorization does not
 * depend on this layer being called correctly.
 */

import type {
  Academy,
  AttendanceStatus,
  AttendanceWindow,
  Charge,
  Coach,
  Credit,
  Enrollment,
  Invite,
  InvitePreview,
  ISODate,
  Membership,
  Payment,
  AvailabilityWindow,
  Player,
  PriceBasis,
  PriceSource,
  Program,
  ProgramAudience,
  ProgramEnrollment,
  ProgramPriceOption,
  AgreementSource,
  Session,
  Theme,
} from '@/lib/domain/types'

export interface NewPlayerInput {
  name: string
  phone: string
  email: string
  level: Player['level']
  defaultRateCents: number | null
  notes: string
}

export interface UpdatePlayerInput extends Partial<NewPlayerInput> {
  archived?: boolean
  deletedAt?: string | null
}

export interface NewSessionInput {
  type: Session['type']
  name: string
  date: ISODate
  startMin: number
  durationMin: number
  priceCents: number
  isFree: boolean
  location: string
  capacity: number | null
  /** Set for a program's generated occurrences. */
  programId?: string | null
  /** The coach running the session, for availability. */
  coachMembershipId?: string | null
}

export interface UpdateSessionInput extends Partial<NewSessionInput> {
  status?: Session['status']
  attendanceSkipped?: boolean
  cancelledAt?: string | null
}

export interface NewChargeInput {
  playerId: string
  sessionId: string | null
  amountCents: number
  /** The price snapshot — captured now, never re-derived. See `Charge`. */
  priceSource: PriceSource
  priceBasis: PriceBasis | null
  standardAmountCents: number | null
  dueDate: ISODate
  isManual: boolean
  label: string
  note: string
  /** Program charges: the roster place whose agreement priced this charge. */
  programId?: string | null
  programEnrollmentId?: string | null
  periodStart?: ISODate | null
  periodEnd?: ISODate | null
}

export interface NewProgramInput {
  name: string
  audience: ProgramAudience
  weekdays: number[]
  startMin: number
  durationMin: number
  location: string
  capacity: number | null
  ageRange: string
  startsOn: ISODate
  endsOn: ISODate | null
}

export interface UpdateProgramInput {
  name?: string
  location?: string
  capacity?: number | null
  ageRange?: string
  status?: Program['status']
  endsOn?: ISODate | null
}

export interface NewPriceOptionInput {
  programId: string
  label: string
  basis: PriceBasis
  amountCents: number
  position: number
}

export interface UpdatePriceOptionInput {
  label?: string
  amountCents?: number
  position?: number
  archivedAt?: string | null
}

export interface NewProgramEnrollmentInput {
  programId: string
  playerId: string
  joinedOn: ISODate
  priceOptionId: string | null
  agreedLabel: string
  agreedBasis: PriceBasis
  agreedAmountCents: number
  standardAmountCents: number | null
  agreementSource: AgreementSource
  agreementNote: string
}

export interface UpdateProgramEnrollmentInput {
  status?: ProgramEnrollment['status']
  endedOn?: ISODate | null
}

export interface NewPaymentInput {
  chargeId: string
  amountCents: number
  paidOn: ISODate
  note: string
}

export interface NewCreditInput {
  chargeId: string
  amountCents: number
  reason: string
}

/**
 * A unit of work. Financial mutations run inside one of these so that a
 * multi-record change (cancel a session AND void its charges) either fully
 * applies or not at all.
 */
export interface DataStore {
  // ---- coach / settings ----
  // `membershipId` below is the signed-in member's own row id — distinct from
  // the `coachId` (academy/tenant id) every other method takes. See the
  // `Coach` type's doc comment.
  getCoach(membershipId: string): Promise<Coach | null>
  getCoachByAuthId(authId: string): Promise<Coach | null>
  /** The academy's shared business settings (default rate, timezone…). */
  getAcademy(academyId: string): Promise<Academy | null>
  /** Bootstraps a brand-new academy with this member as its owner. */
  createCoach(authId: string, input: { name: string; email: string }): Promise<Coach>
  /** Updates the signed-in member's own name/email/onboarding state. */
  updateMembershipProfile(
    membershipId: string,
    patch: Partial<{ name: string; email: string; onboardedAt: string | null }>,
  ): Promise<Coach>
  /** Updates shared business settings. Callers must check the actor is the academy owner. */
  updateAcademySettings(
    academyId: string,
    patch: Partial<{
      businessName: string
      defaultRateCents: number
      attendanceWindow: AttendanceWindow
      theme: Theme
      timezone: string
    }>,
  ): Promise<Academy>

  // ---- players ----
  listPlayers(coachId: string, opts?: { includeDeleted?: boolean }): Promise<Player[]>
  getPlayer(coachId: string, playerId: string): Promise<Player | null>
  createPlayer(coachId: string, input: NewPlayerInput): Promise<Player>
  updatePlayer(coachId: string, playerId: string, patch: UpdatePlayerInput): Promise<Player>

  // ---- sessions ----
  listSessions(coachId: string): Promise<Session[]>
  getSession(coachId: string, sessionId: string): Promise<Session | null>
  createSession(coachId: string, input: NewSessionInput): Promise<Session>
  updateSession(
    coachId: string,
    sessionId: string,
    patch: UpdateSessionInput,
  ): Promise<Session>

  // ---- enrollments / attendance ----
  listEnrollments(coachId: string): Promise<Enrollment[]>
  listEnrollmentsForSession(coachId: string, sessionId: string): Promise<Enrollment[]>
  addEnrollment(
    coachId: string,
    sessionId: string,
    playerId: string,
    opts?: { expected?: boolean },
  ): Promise<Enrollment>
  /** Enroll many players in one session with a single write. */
  addEnrollments(
    coachId: string,
    sessionId: string,
    playerIds: string[],
    opts?: { expected?: boolean },
  ): Promise<void>
  /** The planning list for an occurrence — see `Enrollment.expected`. */
  setExpected(
    coachId: string,
    sessionId: string,
    marks: Array<{ playerId: string; expected: boolean }>,
  ): Promise<void>
  removeEnrollment(coachId: string, sessionId: string, playerId: string): Promise<void>
  setAttendance(
    coachId: string,
    sessionId: string,
    marks: Array<{ playerId: string; attendance: AttendanceStatus }>,
  ): Promise<void>

  // ---- team ----
  listMemberships(coachId: string): Promise<Membership[]>
  /** Owner only (RLS). Removes a coach; never an owner. */
  removeMembership(coachId: string, membershipId: string): Promise<void>
  listInvites(coachId: string): Promise<Invite[]>
  createInvite(coachId: string, input: { email: string; invitedBy: string }): Promise<Invite>
  revokeInvite(coachId: string, inviteId: string): Promise<void>
  /**
   * What the signed-out invitation page may show. Not tenant-scoped: the token
   * is the credential. `null` for an unknown token.
   */
  getInvitePreview(token: string): Promise<InvitePreview | null>
  /** Who worked a session (membership ids). */
  listSessionCoaches(coachId: string, sessionId: string): Promise<string[]>
  setSessionCoaches(coachId: string, sessionId: string, membershipIds: string[]): Promise<void>

  // ---- availability ----
  listAvailability(coachId: string): Promise<AvailabilityWindow[]>
  /**
   * Replace one member's weekly hours. A day absent from `windows` becomes
   * unavailable. Only the member themself may do this.
   */
  replaceAvailability(
    coachId: string,
    membershipId: string,
    windows: Array<{ weekday: number; startMin: number; endMin: number }>,
  ): Promise<void>

  // ---- programs ----
  listPrograms(coachId: string): Promise<Program[]>
  getProgram(coachId: string, programId: string): Promise<Program | null>
  createProgram(coachId: string, input: NewProgramInput): Promise<Program>
  updateProgram(coachId: string, programId: string, patch: UpdateProgramInput): Promise<Program>
  listPriceOptions(coachId: string): Promise<ProgramPriceOption[]>
  createPriceOption(coachId: string, input: NewPriceOptionInput): Promise<ProgramPriceOption>
  updatePriceOption(
    coachId: string,
    optionId: string,
    patch: UpdatePriceOptionInput,
  ): Promise<ProgramPriceOption>
  listProgramEnrollments(coachId: string): Promise<ProgramEnrollment[]>
  createProgramEnrollment(
    coachId: string,
    input: NewProgramEnrollmentInput,
  ): Promise<ProgramEnrollment>
  updateProgramEnrollment(
    coachId: string,
    enrollmentId: string,
    patch: UpdateProgramEnrollmentInput,
  ): Promise<ProgramEnrollment>

  // ---- financial records ----
  listCharges(coachId: string): Promise<Charge[]>
  listPayments(coachId: string): Promise<Payment[]>
  listCredits(coachId: string): Promise<Credit[]>
  getCharge(coachId: string, chargeId: string): Promise<Charge | null>
  createCharge(coachId: string, input: NewChargeInput): Promise<Charge>
  createCharges(coachId: string, inputs: NewChargeInput[]): Promise<Charge[]>
  updateCharge(
    coachId: string,
    chargeId: string,
    patch: Partial<
      Pick<
        Charge,
        'amountCents' | 'dueDate' | 'note' | 'label' | 'voidedAt' | 'voidNote' | 'priceSource'
      >
    >,
  ): Promise<Charge>
  recordPayment(coachId: string, input: NewPaymentInput): Promise<Payment>
  recordCredit(coachId: string, input: NewCreditInput): Promise<Credit>
  /** Remove all payments against a charge (used by "Mark Unpaid"). */
  clearPayments(coachId: string, chargeId: string): Promise<void>
  listPaymentsForCharge(coachId: string, chargeId: string): Promise<Payment[]>
  listCreditsForCharge(coachId: string, chargeId: string): Promise<Credit[]>

  /**
   * Run a set of mutations atomically. The mock adapter snapshots and rolls
   * back; the Supabase adapter delegates to a Postgres function so the whole
   * unit commits or aborts together.
   */
  transaction<T>(fn: (store: DataStore) => Promise<T>): Promise<T>
}
