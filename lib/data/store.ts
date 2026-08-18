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
  AttendanceStatus,
  Charge,
  Coach,
  Credit,
  Enrollment,
  ISODate,
  Payment,
  Player,
  Session,
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
  dueDate: ISODate
  isManual: boolean
  label: string
  note: string
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
  getCoach(coachId: string): Promise<Coach | null>
  getCoachByAuthId(authId: string): Promise<Coach | null>
  createCoach(authId: string, input: { name: string; email: string }): Promise<Coach>
  updateCoach(coachId: string, patch: Partial<Omit<Coach, 'id'>>): Promise<Coach>

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
  addEnrollment(coachId: string, sessionId: string, playerId: string): Promise<Enrollment>
  removeEnrollment(coachId: string, sessionId: string, playerId: string): Promise<void>
  setAttendance(
    coachId: string,
    sessionId: string,
    marks: Array<{ playerId: string; attendance: AttendanceStatus }>,
  ): Promise<void>

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
    patch: Partial<Pick<Charge, 'amountCents' | 'dueDate' | 'note' | 'label' | 'voidedAt' | 'voidNote'>>,
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
