/**
 * In-memory DataStore adapter.
 *
 * Purpose: let the application run, be clicked through and be tested without
 * any Supabase credentials configured. It is selected automatically when
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are absent.
 *
 * It is NOT a production store: state lives in the Node process and is lost on
 * restart. It exists so that a fresh clone runs, and so the domain/service
 * layer has a fast, deterministic backend to test against.
 */

import { DEFAULT_TIME_ZONE } from '@/lib/domain/dates'
import type {
  AttendanceStatus,
  Charge,
  Coach,
  Credit,
  Enrollment,
  Payment,
  Player,
  Session,
} from '@/lib/domain/types'
import type {
  DataStore,
  NewChargeInput,
  NewCreditInput,
  NewPaymentInput,
  NewPlayerInput,
  NewSessionInput,
  UpdatePlayerInput,
  UpdateSessionInput,
} from '../store'
import { buildSeed, type SeedProfile } from './seed'

interface Tables {
  coaches: Coach[]
  /** Maps Supabase auth user id -> coach id. */
  authLinks: Record<string, string>
  players: Player[]
  sessions: Session[]
  enrollments: Enrollment[]
  charges: Charge[]
  payments: Payment[]
  credits: Credit[]
}

function emptyTables(): Tables {
  return {
    coaches: [],
    authLinks: {},
    players: [],
    sessions: [],
    enrollments: [],
    charges: [],
    payments: [],
    credits: [],
  }
}

let seq = 1000
function nextId(prefix: string): string {
  seq += 1
  return `${prefix}_${seq.toString(36)}`
}

function nowISO(): string {
  return new Date().toISOString()
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export class MockDataStore implements DataStore {
  private db: Tables

  constructor(db?: Tables) {
    this.db = db ?? emptyTables()
  }

  /** Load a seed profile into this store, replacing anything already there. */
  loadSeed(profile: SeedProfile = 'established', authId = 'demo-auth-user'): Coach {
    const seed = buildSeed(profile)
    this.db = emptyTables()
    this.db.coaches.push(seed.coach)
    this.db.authLinks[authId] = seed.coach.id
    this.db.players.push(...seed.players)
    this.db.sessions.push(...seed.sessions)
    this.db.enrollments.push(...seed.enrollments)
    this.db.charges.push(...seed.charges)
    this.db.payments.push(...seed.payments)
    this.db.credits.push(...seed.credits)
    return seed.coach
  }

  // ---- coach ----

  async getCoach(coachId: string): Promise<Coach | null> {
    return clone(this.db.coaches.find((c) => c.id === coachId) ?? null)
  }

  async getCoachByAuthId(authId: string): Promise<Coach | null> {
    const coachId = this.db.authLinks[authId]
    if (!coachId) return null
    return this.getCoach(coachId)
  }

  async createCoach(authId: string, input: { name: string; email: string }): Promise<Coach> {
    const coach: Coach = {
      id: nextId('coach'),
      name: input.name,
      email: input.email,
      businessName: '',
      defaultRateCents: 7000,
      attendanceWindow: '24 hours',
      theme: 'Light',
      timezone: DEFAULT_TIME_ZONE,
      onboardedAt: null,
    }
    this.db.coaches.push(coach)
    this.db.authLinks[authId] = coach.id
    return clone(coach)
  }

  async updateCoach(coachId: string, patch: Partial<Omit<Coach, 'id'>>): Promise<Coach> {
    const coach = this.db.coaches.find((c) => c.id === coachId)
    if (!coach) throw new Error('Coach not found')
    Object.assign(coach, patch)
    return clone(coach)
  }

  // ---- players ----

  async listPlayers(coachId: string, opts?: { includeDeleted?: boolean }): Promise<Player[]> {
    return clone(
      this.db.players.filter(
        (p) => p.coachId === coachId && (opts?.includeDeleted ? true : p.deletedAt === null),
      ),
    )
  }

  async getPlayer(coachId: string, playerId: string): Promise<Player | null> {
    return clone(
      this.db.players.find((p) => p.id === playerId && p.coachId === coachId) ?? null,
    )
  }

  async createPlayer(coachId: string, input: NewPlayerInput): Promise<Player> {
    const player: Player = {
      id: nextId('p'),
      coachId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      level: input.level,
      defaultRateCents: input.defaultRateCents,
      notes: input.notes,
      archived: false,
      deletedAt: null,
      createdAt: nowISO(),
    }
    this.db.players.push(player)
    return clone(player)
  }

  async updatePlayer(
    coachId: string,
    playerId: string,
    patch: UpdatePlayerInput,
  ): Promise<Player> {
    const player = this.db.players.find((p) => p.id === playerId && p.coachId === coachId)
    if (!player) throw new Error('Player not found')
    Object.assign(player, patch)
    return clone(player)
  }

  // ---- sessions ----

  async listSessions(coachId: string): Promise<Session[]> {
    return clone(this.db.sessions.filter((s) => s.coachId === coachId))
  }

  async getSession(coachId: string, sessionId: string): Promise<Session | null> {
    return clone(
      this.db.sessions.find((s) => s.id === sessionId && s.coachId === coachId) ?? null,
    )
  }

  async createSession(coachId: string, input: NewSessionInput): Promise<Session> {
    const session: Session = {
      id: nextId('s'),
      coachId,
      type: input.type,
      name: input.name,
      date: input.date,
      startMin: input.startMin,
      durationMin: input.durationMin,
      priceCents: input.priceCents,
      isFree: input.isFree,
      location: input.location,
      capacity: input.capacity,
      status: 'scheduled',
      attendanceSkipped: false,
      cancelledAt: null,
      createdAt: nowISO(),
    }
    this.db.sessions.push(session)
    return clone(session)
  }

  async updateSession(
    coachId: string,
    sessionId: string,
    patch: UpdateSessionInput,
  ): Promise<Session> {
    const session = this.db.sessions.find((s) => s.id === sessionId && s.coachId === coachId)
    if (!session) throw new Error('Session not found')
    Object.assign(session, patch)
    return clone(session)
  }

  // ---- enrollments ----

  async listEnrollments(coachId: string): Promise<Enrollment[]> {
    return clone(this.db.enrollments.filter((e) => e.coachId === coachId))
  }

  async listEnrollmentsForSession(coachId: string, sessionId: string): Promise<Enrollment[]> {
    return clone(
      this.db.enrollments.filter((e) => e.coachId === coachId && e.sessionId === sessionId),
    )
  }

  async addEnrollment(
    coachId: string,
    sessionId: string,
    playerId: string,
  ): Promise<Enrollment> {
    const existing = this.db.enrollments.find(
      (e) => e.coachId === coachId && e.sessionId === sessionId && e.playerId === playerId,
    )
    if (existing) return clone(existing)
    const enrollment: Enrollment = {
      id: nextId('e'),
      coachId,
      sessionId,
      playerId,
      attendance: 'unmarked',
      createdAt: nowISO(),
    }
    this.db.enrollments.push(enrollment)
    return clone(enrollment)
  }

  async removeEnrollment(
    coachId: string,
    sessionId: string,
    playerId: string,
  ): Promise<void> {
    this.db.enrollments = this.db.enrollments.filter(
      (e) =>
        !(e.coachId === coachId && e.sessionId === sessionId && e.playerId === playerId),
    )
  }

  async setAttendance(
    coachId: string,
    sessionId: string,
    marks: Array<{ playerId: string; attendance: AttendanceStatus }>,
  ): Promise<void> {
    for (const mark of marks) {
      const enrollment = this.db.enrollments.find(
        (e) =>
          e.coachId === coachId &&
          e.sessionId === sessionId &&
          e.playerId === mark.playerId,
      )
      if (enrollment) enrollment.attendance = mark.attendance
    }
  }

  // ---- financial ----

  async listCharges(coachId: string): Promise<Charge[]> {
    return clone(this.db.charges.filter((c) => c.coachId === coachId))
  }

  async listPayments(coachId: string): Promise<Payment[]> {
    return clone(this.db.payments.filter((p) => p.coachId === coachId))
  }

  async listCredits(coachId: string): Promise<Credit[]> {
    return clone(this.db.credits.filter((c) => c.coachId === coachId))
  }

  async getCharge(coachId: string, chargeId: string): Promise<Charge | null> {
    return clone(
      this.db.charges.find((c) => c.id === chargeId && c.coachId === coachId) ?? null,
    )
  }

  async createCharge(coachId: string, input: NewChargeInput): Promise<Charge> {
    const charge: Charge = {
      id: nextId('c'),
      coachId,
      playerId: input.playerId,
      sessionId: input.sessionId,
      amountCents: input.amountCents,
      dueDate: input.dueDate,
      isManual: input.isManual,
      label: input.label,
      note: input.note,
      voidedAt: null,
      voidNote: '',
      createdAt: nowISO(),
    }
    this.db.charges.push(charge)
    return clone(charge)
  }

  async createCharges(coachId: string, inputs: NewChargeInput[]): Promise<Charge[]> {
    const created: Charge[] = []
    for (const input of inputs) {
      created.push(await this.createCharge(coachId, input))
    }
    return created
  }

  async updateCharge(
    coachId: string,
    chargeId: string,
    patch: Partial<
      Pick<Charge, 'amountCents' | 'dueDate' | 'note' | 'label' | 'voidedAt' | 'voidNote'>
    >,
  ): Promise<Charge> {
    const charge = this.db.charges.find((c) => c.id === chargeId && c.coachId === coachId)
    if (!charge) throw new Error('Charge not found')
    Object.assign(charge, patch)
    return clone(charge)
  }

  async recordPayment(coachId: string, input: NewPaymentInput): Promise<Payment> {
    const charge = this.db.charges.find(
      (c) => c.id === input.chargeId && c.coachId === coachId,
    )
    if (!charge) throw new Error('Charge not found')
    const payment: Payment = {
      id: nextId('pay'),
      coachId,
      chargeId: input.chargeId,
      amountCents: input.amountCents,
      paidOn: input.paidOn,
      note: input.note,
      createdAt: nowISO(),
    }
    this.db.payments.push(payment)
    return clone(payment)
  }

  async recordCredit(coachId: string, input: NewCreditInput): Promise<Credit> {
    const charge = this.db.charges.find(
      (c) => c.id === input.chargeId && c.coachId === coachId,
    )
    if (!charge) throw new Error('Charge not found')
    const credit: Credit = {
      id: nextId('cr'),
      coachId,
      chargeId: input.chargeId,
      amountCents: input.amountCents,
      reason: input.reason,
      createdAt: nowISO(),
    }
    this.db.credits.push(credit)
    return clone(credit)
  }

  async clearPayments(coachId: string, chargeId: string): Promise<void> {
    this.db.payments = this.db.payments.filter(
      (p) => !(p.coachId === coachId && p.chargeId === chargeId),
    )
  }

  async listPaymentsForCharge(coachId: string, chargeId: string): Promise<Payment[]> {
    return clone(
      this.db.payments.filter((p) => p.coachId === coachId && p.chargeId === chargeId),
    )
  }

  async listCreditsForCharge(coachId: string, chargeId: string): Promise<Credit[]> {
    return clone(
      this.db.credits.filter((c) => c.coachId === coachId && c.chargeId === chargeId),
    )
  }

  /**
   * Snapshot / restore transaction. Good enough for a single-process in-memory
   * store: if the callback throws, every mutation it made is rolled back.
   */
  async transaction<T>(fn: (store: DataStore) => Promise<T>): Promise<T> {
    const snapshot = clone(this.db)
    try {
      return await fn(this)
    } catch (error) {
      this.db = snapshot
      throw error
    }
  }
}

/**
 * Process-wide mock store. Kept on globalThis so Next.js dev-server hot reloads
 * don't reset the data on every edit.
 */
const globalRef = globalThis as unknown as { __coachosMockStore?: MockDataStore }

export function getMockStore(): MockDataStore {
  if (!globalRef.__coachosMockStore) {
    const store = new MockDataStore()
    store.loadSeed('established')
    globalRef.__coachosMockStore = store
  }
  return globalRef.__coachosMockStore
}

/** Fresh, isolated store for tests. */
export function createTestStore(profile: SeedProfile = 'established'): {
  store: MockDataStore
  coachId: string
} {
  const store = new MockDataStore()
  const coach = store.loadSeed(profile)
  return { store, coachId: coach.id }
}
