/**
 * Session service — scheduling, editing, cancellation, duplication and the
 * financial consequences of each.
 *
 * Rules preserved from the prototype:
 *  - a priced session creates one charge per enrolled player, at the price
 *    captured when the session was scheduled;
 *  - free sessions never create a financial obligation;
 *  - cancelling asks what to do with UNPAID charges; paid charges are never
 *    touched;
 *  - editing a price asks whether to update unpaid charges; paid charges are
 *    never rewritten;
 *  - duplicating creates a brand-new session with fresh enrollments and fresh
 *    charges, and copies no attendance or payment history.
 */

import type { DataStore, NewSessionInput } from '@/lib/data/store'
import {
  attendanceMissing,
  attendanceState,
  compareSessions,
  findConflict,
  isPast,
  type Clock,
} from '@/lib/domain/sessions'
import type {
  AttendanceStatus,
  Enrollment,
  ISODate,
  Player,
  Session,
} from '@/lib/domain/types'
import { DomainError } from './errors'
import { loadFinance } from './finance'

export interface SessionDetail {
  session: Session
  enrollments: Enrollment[]
  players: Map<string, Player>
  outstandingCents: number
  attendance: ReturnType<typeof attendanceState>
  past: boolean
}

export async function listSessions(store: DataStore, coachId: string): Promise<Session[]> {
  const sessions = await store.listSessions(coachId)
  return sessions.sort(compareSessions)
}

export async function getSession(
  store: DataStore,
  coachId: string,
  sessionId: string,
): Promise<Session> {
  const session = await store.getSession(coachId, sessionId)
  if (!session) throw new DomainError('NOT_FOUND', 'That session could not be found.')
  return session
}

export async function getSessionDetail(
  store: DataStore,
  coachId: string,
  sessionId: string,
  clock: Clock,
): Promise<SessionDetail> {
  const session = await getSession(store, coachId, sessionId)
  const [enrollments, allPlayers, finance] = await Promise.all([
    store.listEnrollmentsForSession(coachId, sessionId),
    store.listPlayers(coachId, { includeDeleted: true }),
    loadFinance(store, coachId, clock.today),
  ])
  return {
    session,
    enrollments,
    players: new Map(allPlayers.map((p) => [p.id, p])),
    outstandingCents: finance.outstandingForSession(sessionId),
    attendance: attendanceState(session, enrollments),
    past: isPast(session, clock),
  }
}

export interface CreateSessionArgs extends NewSessionInput {
  playerIds: string[]
  /** Set once the coach has acknowledged a scheduling conflict. */
  allowConflict?: boolean
}

/**
 * Create a session, enroll the chosen players, and — unless the session is
 * free — create one charge per player at the session price. All of it commits
 * together or not at all.
 */
export async function createSession(
  store: DataStore,
  coachId: string,
  args: CreateSessionArgs,
): Promise<Session> {
  if (args.playerIds.length === 0) {
    throw new DomainError(
      'INVALID',
      args.type === 'private'
        ? 'Choose a player for this lesson.'
        : 'Add at least one player.',
    )
  }
  if (args.type === 'private' && args.playerIds.length > 1) {
    throw new DomainError('INVALID', 'A private lesson takes exactly one player.')
  }
  if (args.type === 'group' && args.capacity && args.playerIds.length > args.capacity) {
    throw new DomainError('INVALID', 'More players selected than capacity allows.')
  }
  if (!args.isFree && args.priceCents <= 0) {
    throw new DomainError('INVALID', 'Set a price, or mark the session free.')
  }

  // Every named player must actually belong to this coach and be selectable.
  const players = await store.listPlayers(coachId)
  const selectable = new Set(
    players.filter((p) => !p.archived && !p.deletedAt).map((p) => p.id),
  )
  for (const playerId of args.playerIds) {
    if (!selectable.has(playerId)) {
      throw new DomainError('FORBIDDEN', 'One of those players is not available.')
    }
  }

  if (!args.allowConflict) {
    const sessions = await store.listSessions(coachId)
    const conflict = findConflict(
      sessions,
      args.date,
      args.startMin,
      args.startMin + args.durationMin,
    )
    if (conflict) {
      throw new DomainError('CONFLICT', `Overlaps ${conflict.name} that day.`)
    }
  }

  return store.transaction(async (tx) => {
    const session = await tx.createSession(coachId, {
      type: args.type,
      name: args.name,
      date: args.date,
      startMin: args.startMin,
      durationMin: args.durationMin,
      priceCents: args.isFree ? 0 : args.priceCents,
      isFree: args.isFree,
      location: args.location,
      capacity: args.type === 'group' ? args.capacity : null,
    })

    for (const playerId of args.playerIds) {
      await tx.addEnrollment(coachId, session.id, playerId)
    }

    if (!args.isFree && args.priceCents > 0) {
      await tx.createCharges(
        coachId,
        args.playerIds.map((playerId) => ({
          playerId,
          sessionId: session.id,
          amountCents: args.priceCents,
          dueDate: args.date,
          isManual: false,
          label: '',
          note: '',
        })),
      )
    }

    return session
  })
}

export interface UpdateSessionArgs {
  name: string
  date: ISODate
  startMin: number
  durationMin: number
  priceCents: number
  location: string
  capacity: number | null
  /**
   * What to do with UNPAID charges when the price changed.
   * 'keep'   — leave existing charges alone (historical amounts preserved)
   * 'update' — reprice unpaid charges to the new amount
   * Paid charges are never modified under either option.
   */
  priceChangeDecision?: 'keep' | 'update'
}

export async function updateSession(
  store: DataStore,
  coachId: string,
  sessionId: string,
  args: UpdateSessionArgs,
): Promise<{ requiresPriceDecision: boolean; unpaidCount: number }> {
  const session = await getSession(store, coachId, sessionId)
  if (!args.name.trim()) throw new DomainError('INVALID', 'Session needs a name.')
  if (!session.isFree && args.priceCents <= 0) {
    throw new DomainError('INVALID', 'Enter a valid price.')
  }

  const sessions = await store.listSessions(coachId)
  const conflict = findConflict(
    sessions,
    args.date,
    args.startMin,
    args.startMin + args.durationMin,
    sessionId,
  )
  if (conflict) {
    throw new DomainError('CONFLICT', `Conflicts with ${conflict.name} that day.`)
  }

  const finance = await loadFinance(store, coachId)
  const unpaid = finance.forSession(sessionId).filter((v) => v.isPending)
  const priceChanged = !session.isFree && args.priceCents !== session.priceCents

  // Ask the coach before touching money they've already committed to.
  if (priceChanged && unpaid.length > 0 && !args.priceChangeDecision) {
    return { requiresPriceDecision: true, unpaidCount: unpaid.length }
  }

  await store.transaction(async (tx) => {
    await tx.updateSession(coachId, sessionId, {
      name: args.name.trim(),
      date: args.date,
      startMin: args.startMin,
      durationMin: args.durationMin,
      priceCents: session.isFree ? 0 : args.priceCents,
      location: args.location.trim(),
      capacity: session.type === 'group' ? args.capacity : null,
    })

    for (const view of unpaid) {
      const patch: { dueDate: ISODate; amountCents?: number } = { dueDate: args.date }
      if (priceChanged && args.priceChangeDecision === 'update') {
        patch.amountCents = args.priceCents
      }
      await tx.updateCharge(coachId, view.charge.id, patch)
    }
  })

  return { requiresPriceDecision: false, unpaidCount: unpaid.length }
}

/**
 * Cancel a session. Cancellation and the decision about its unpaid charges are
 * one logical operation, applied atomically.
 */
export async function cancelSession(
  store: DataStore,
  coachId: string,
  sessionId: string,
  chargeDecision: 'void' | 'keep',
): Promise<void> {
  const session = await getSession(store, coachId, sessionId)
  if (session.status === 'cancelled') {
    throw new DomainError('CONFLICT', 'This session is already cancelled.')
  }

  const finance = await loadFinance(store, coachId)
  const unpaid = finance.forSession(sessionId).filter((v) => v.isPending)
  const stamp = new Date().toISOString()

  await store.transaction(async (tx) => {
    await tx.updateSession(coachId, sessionId, {
      status: 'cancelled',
      cancelledAt: stamp,
    })
    if (chargeDecision === 'void') {
      for (const view of unpaid) {
        await tx.updateCharge(coachId, view.charge.id, {
          voidedAt: stamp,
          voidNote: 'Written off — session cancelled',
        })
      }
    }
  })
}

/** How many unpaid charges a cancellation would have to decide about. */
export async function cancellationImpact(
  store: DataStore,
  coachId: string,
  sessionId: string,
): Promise<{ unpaidCount: number; unpaidCents: number }> {
  const finance = await loadFinance(store, coachId)
  const unpaid = finance.forSession(sessionId).filter((v) => v.isPending)
  return {
    unpaidCount: unpaid.length,
    unpaidCents: unpaid.reduce((total, v) => total + v.outstandingCents, 0),
  }
}

/**
 * Build the prefilled draft for duplicating a session. Deliberately copies only
 * the shape of the session — never attendance, payments or charge history.
 */
export async function buildDuplicateDraft(
  store: DataStore,
  coachId: string,
  sessionId: string,
  clock: Clock,
): Promise<{
  type: Session['type']
  playerIds: string[]
  date: ISODate
  startMin: number
  durationMin: number
  priceCents: number
  isFree: boolean
  location: string
  capacity: number
}> {
  const session = await getSession(store, coachId, sessionId)
  const [enrollments, players] = await Promise.all([
    store.listEnrollmentsForSession(coachId, sessionId),
    store.listPlayers(coachId),
  ])
  const selectable = new Set(
    players.filter((p) => !p.archived && !p.deletedAt).map((p) => p.id),
  )
  const base = session.date >= clock.today ? session.date : clock.today
  const nextDay = (() => {
    const d = new Date(base + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    const p = (n: number) => (n < 10 ? '0' + n : String(n))
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  })()

  return {
    type: session.type,
    playerIds: enrollments.map((e) => e.playerId).filter((id) => selectable.has(id)),
    date: nextDay,
    startMin: session.startMin,
    durationMin: session.durationMin,
    priceCents: session.priceCents,
    isFree: session.isFree,
    location: session.location,
    capacity: session.capacity ?? 6,
  }
}

/** Add a player to an existing session, creating a charge if the session is priced. */
export async function addPlayerToSession(
  store: DataStore,
  coachId: string,
  sessionId: string,
  playerId: string,
): Promise<void> {
  const session = await getSession(store, coachId, sessionId)
  if (session.status === 'cancelled') {
    throw new DomainError('CONFLICT', 'This session was cancelled.')
  }
  const player = await store.getPlayer(coachId, playerId)
  if (!player || player.deletedAt || player.archived) {
    throw new DomainError('FORBIDDEN', 'That player is not available.')
  }

  const enrollments = await store.listEnrollmentsForSession(coachId, sessionId)
  if (enrollments.some((e) => e.playerId === playerId)) {
    throw new DomainError('CONFLICT', 'That player is already on this session.')
  }
  if (session.capacity && enrollments.length >= session.capacity) {
    throw new DomainError('CONFLICT', 'This session is at capacity.')
  }

  await store.transaction(async (tx) => {
    await tx.addEnrollment(coachId, sessionId, playerId)
    if (!session.isFree && session.priceCents > 0) {
      await tx.createCharge(coachId, {
        playerId,
        sessionId,
        amountCents: session.priceCents,
        dueDate: session.date,
        isManual: false,
        label: '',
        note: '',
      })
    }
  })
}

/**
 * Remove a player from a session.
 *
 * `chargeDecision` mirrors the prototype: keeping the charge preserves the
 * obligation, crediting it writes the balance down to zero. Either way the
 * financial record survives — removal never erases history.
 */
export async function removePlayerFromSession(
  store: DataStore,
  coachId: string,
  sessionId: string,
  playerId: string,
  chargeDecision: 'keep' | 'credit',
): Promise<void> {
  await getSession(store, coachId, sessionId)
  const finance = await loadFinance(store, coachId)
  const pending = finance
    .forSession(sessionId)
    .filter((v) => v.charge.playerId === playerId && v.isPending)

  await store.transaction(async (tx) => {
    if (chargeDecision === 'credit') {
      for (const view of pending) {
        await tx.recordCredit(coachId, {
          chargeId: view.charge.id,
          amountCents: view.outstandingCents,
          reason: 'Removed from session',
        })
      }
    }
    await tx.removeEnrollment(coachId, sessionId, playerId)
  })
}

// ---- attendance ----

export async function getAttendance(
  store: DataStore,
  coachId: string,
  sessionId: string,
): Promise<Enrollment[]> {
  await getSession(store, coachId, sessionId)
  return store.listEnrollmentsForSession(coachId, sessionId)
}

/**
 * Save attendance marks. Saving any real mark clears a previous "skipped"
 * decision for the session, because the coach has evidently changed their mind.
 */
export async function saveAttendance(
  store: DataStore,
  coachId: string,
  sessionId: string,
  marks: Array<{ playerId: string; attendance: AttendanceStatus }>,
): Promise<void> {
  const session = await getSession(store, coachId, sessionId)
  if (session.status === 'cancelled') {
    throw new DomainError('CONFLICT', 'This session was cancelled.')
  }
  const enrollments = await store.listEnrollmentsForSession(coachId, sessionId)
  const enrolled = new Set(enrollments.map((e) => e.playerId))
  for (const mark of marks) {
    if (!enrolled.has(mark.playerId)) {
      throw new DomainError('FORBIDDEN', 'That player is not on this session.')
    }
  }

  await store.transaction(async (tx) => {
    await tx.setAttendance(coachId, sessionId, marks)
    if (session.attendanceSkipped) {
      await tx.updateSession(coachId, sessionId, { attendanceSkipped: false })
    }
  })
}

/**
 * Deliberately skip attendance for a session. This is a distinct state from
 * "unmarked": the session stops appearing in "needs attention" and is excluded
 * from attendance percentages.
 */
export async function skipAttendance(
  store: DataStore,
  coachId: string,
  sessionId: string,
): Promise<void> {
  await getSession(store, coachId, sessionId)
  const enrollments = await store.listEnrollmentsForSession(coachId, sessionId)
  await store.transaction(async (tx) => {
    await tx.updateSession(coachId, sessionId, { attendanceSkipped: true })
    await tx.setAttendance(
      coachId,
      sessionId,
      enrollments.map((e) => ({ playerId: e.playerId, attendance: 'skipped' as const })),
    )
  })
}

/** Sessions that still owe the coach an attendance decision. */
export async function sessionsNeedingAttendance(
  store: DataStore,
  coachId: string,
  clock: Clock,
): Promise<Array<{ session: Session; enrollments: Enrollment[] }>> {
  const [sessions, enrollments] = await Promise.all([
    store.listSessions(coachId),
    store.listEnrollments(coachId),
  ])
  const bySession = new Map<string, Enrollment[]>()
  for (const e of enrollments) {
    const list = bySession.get(e.sessionId) ?? []
    list.push(e)
    bySession.set(e.sessionId, list)
  }
  return sessions
    .filter((s) => attendanceMissing(s, bySession.get(s.id) ?? [], clock))
    .sort(compareSessions)
    .map((session) => ({ session, enrollments: bySession.get(session.id) ?? [] }))
}
