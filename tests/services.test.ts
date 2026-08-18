import { beforeEach, describe, expect, it } from 'vitest'
import { MockDataStore, createTestStore } from '@/lib/data/mock/store'
import { todayISO, addDays } from '@/lib/domain/dates'
import { attendanceState, isPast } from '@/lib/domain/sessions'
import { loadFinance, recordCredit, recordPayment, markUnpaid } from '@/lib/services/finance'
import {
  addPlayerToSession,
  buildDuplicateDraft,
  cancelSession,
  createSession,
  removePlayerFromSession,
  saveAttendance,
  skipAttendance,
  updateSession,
} from '@/lib/services/sessions'
import { createPlayer, deletePlayer, setPlayerArchived } from '@/lib/services/players'
import { DomainError } from '@/lib/services/errors'

const TODAY = todayISO()
const CLOCK = { today: TODAY, nowMinutes: 12 * 60 }

let store: MockDataStore
let coachId: string

beforeEach(() => {
  const created = createTestStore('established')
  store = created.store
  coachId = created.coachId
})

describe('session creation', () => {
  it('creates an enrollment and a charge per player for a paid session', async () => {
    const session = await createSession(store, coachId, {
      type: 'group',
      name: 'Test Group',
      date: addDays(TODAY, 30),
      startMin: 600,
      durationMin: 60,
      priceCents: 4000,
      isFree: false,
      location: 'Court 9',
      capacity: 6,
      playerIds: ['p1', 'p2'],
    })

    const enrollments = await store.listEnrollmentsForSession(coachId, session.id)
    expect(enrollments).toHaveLength(2)
    expect(enrollments.every((e) => e.attendance === 'unmarked')).toBe(true)

    const finance = await loadFinance(store, coachId, TODAY)
    const charges = finance.forSession(session.id)
    expect(charges).toHaveLength(2)
    expect(charges.every((c) => c.amountCents === 4000)).toBe(true)
    expect(finance.outstandingForSession(session.id)).toBe(8000)
  })

  it('creates enrollments but NO charge for a free session', async () => {
    const session = await createSession(store, coachId, {
      type: 'group',
      name: 'Free Clinic',
      date: addDays(TODAY, 31),
      startMin: 600,
      durationMin: 60,
      priceCents: 0,
      isFree: true,
      location: 'Court 9',
      capacity: 6,
      playerIds: ['p1', 'p2'],
    })

    const enrollments = await store.listEnrollmentsForSession(coachId, session.id)
    expect(enrollments).toHaveLength(2)

    const finance = await loadFinance(store, coachId, TODAY)
    expect(finance.forSession(session.id)).toHaveLength(0)
    expect(finance.outstandingForSession(session.id)).toBe(0)
  })

  it('refuses a priced session with no price', async () => {
    await expect(
      createSession(store, coachId, {
        type: 'private',
        name: 'Nope',
        date: addDays(TODAY, 32),
        startMin: 600,
        durationMin: 60,
        priceCents: 0,
        isFree: false,
        location: '',
        capacity: null,
        playerIds: ['p1'],
      }),
    ).rejects.toThrow(DomainError)
  })

  it('refuses a session with no players', async () => {
    await expect(
      createSession(store, coachId, {
        type: 'private',
        name: 'Nope',
        date: addDays(TODAY, 33),
        startMin: 600,
        durationMin: 60,
        priceCents: 5000,
        isFree: false,
        location: '',
        capacity: null,
        playerIds: [],
      }),
    ).rejects.toThrow(DomainError)
  })

  it('flags a scheduling conflict but allows an acknowledged override', async () => {
    const date = addDays(TODAY, 34)
    await createSession(store, coachId, {
      type: 'private',
      name: 'First',
      date,
      startMin: 600,
      durationMin: 60,
      priceCents: 5000,
      isFree: false,
      location: '',
      capacity: null,
      playerIds: ['p1'],
    })

    await expect(
      createSession(store, coachId, {
        type: 'private',
        name: 'Overlapping',
        date,
        startMin: 630,
        durationMin: 60,
        priceCents: 5000,
        isFree: false,
        location: '',
        capacity: null,
        playerIds: ['p2'],
      }),
    ).rejects.toThrow(/Overlaps/)

    const forced = await createSession(store, coachId, {
      type: 'private',
      name: 'Overlapping',
      date,
      startMin: 630,
      durationMin: 60,
      priceCents: 5000,
      isFree: false,
      location: '',
      capacity: null,
      playerIds: ['p2'],
      allowConflict: true,
    })
    expect(forced.id).toBeTruthy()
  })
})

describe('attendance', () => {
  it('has four distinct states and skipped is not unmarked', async () => {
    const session = await createSession(store, coachId, {
      type: 'group',
      name: 'Attendance Test',
      date: addDays(TODAY, -1),
      startMin: 600,
      durationMin: 60,
      priceCents: 1000,
      isFree: false,
      location: '',
      capacity: 6,
      playerIds: ['p1', 'p2', 'p3'],
    })

    let enrollments = await store.listEnrollmentsForSession(coachId, session.id)
    let current = await store.getSession(coachId, session.id)
    expect(attendanceState(current!, enrollments)).toBe('unmarked')

    await saveAttendance(store, coachId, session.id, [
      { playerId: 'p1', attendance: 'present' },
    ])
    enrollments = await store.listEnrollmentsForSession(coachId, session.id)
    current = await store.getSession(coachId, session.id)
    expect(attendanceState(current!, enrollments)).toBe('partial')

    await saveAttendance(store, coachId, session.id, [
      { playerId: 'p2', attendance: 'absent' },
      { playerId: 'p3', attendance: 'present' },
    ])
    enrollments = await store.listEnrollmentsForSession(coachId, session.id)
    current = await store.getSession(coachId, session.id)
    expect(attendanceState(current!, enrollments)).toBe('complete')

    await skipAttendance(store, coachId, session.id)
    enrollments = await store.listEnrollmentsForSession(coachId, session.id)
    current = await store.getSession(coachId, session.id)
    expect(current!.attendanceSkipped).toBe(true)
    expect(attendanceState(current!, enrollments)).toBe('skipped')
    expect(enrollments.every((e) => e.attendance === 'skipped')).toBe(true)
  })

  it('clearing a mark returns it to unmarked, not to skipped', async () => {
    const session = await createSession(store, coachId, {
      type: 'private',
      name: 'Toggle Test',
      date: addDays(TODAY, -1),
      startMin: 480,
      durationMin: 60,
      priceCents: 1000,
      isFree: false,
      location: '',
      capacity: null,
      playerIds: ['p1'],
    })

    await saveAttendance(store, coachId, session.id, [
      { playerId: 'p1', attendance: 'present' },
    ])
    await saveAttendance(store, coachId, session.id, [
      { playerId: 'p1', attendance: 'unmarked' },
    ])

    const enrollments = await store.listEnrollmentsForSession(coachId, session.id)
    expect(enrollments[0].attendance).toBe('unmarked')
  })

  it('refuses attendance for a player who is not enrolled', async () => {
    const session = await createSession(store, coachId, {
      type: 'private',
      name: 'Guard Test',
      date: addDays(TODAY, -1),
      startMin: 700,
      durationMin: 60,
      priceCents: 1000,
      isFree: false,
      location: '',
      capacity: null,
      playerIds: ['p1'],
    })

    await expect(
      saveAttendance(store, coachId, session.id, [
        { playerId: 'p2', attendance: 'present' },
      ]),
    ).rejects.toThrow(DomainError)
  })
})

describe('cancellation', () => {
  it('cancel + void writes off unpaid charges and leaves paid ones alone', async () => {
    const session = await createSession(store, coachId, {
      type: 'group',
      name: 'To Cancel',
      date: addDays(TODAY, 20),
      startMin: 600,
      durationMin: 60,
      priceCents: 5000,
      isFree: false,
      location: '',
      capacity: 6,
      playerIds: ['p1', 'p2'],
    })

    let finance = await loadFinance(store, coachId, TODAY)
    const charges = finance.forSession(session.id)
    // Pay one of the two charges in full first.
    await recordPayment(store, coachId, {
      chargeId: charges[0].charge.id,
      amountCents: 5000,
      today: TODAY,
    })

    await cancelSession(store, coachId, session.id, 'void', TODAY)

    finance = await loadFinance(store, coachId, TODAY)
    const after = finance.forSession(session.id)
    const paid = after.find((v) => v.charge.id === charges[0].charge.id)!
    const voided = after.find((v) => v.charge.id === charges[1].charge.id)!

    expect(paid.status).toBe('paid')
    expect(paid.charge.voidedAt).toBeNull()
    expect(voided.status).toBe('voided')
    expect(finance.outstandingForSession(session.id)).toBe(0)

    const updated = await store.getSession(coachId, session.id)
    expect(updated!.status).toBe('cancelled')
  })

  it('cancel + keep leaves unpaid charges owing', async () => {
    const session = await createSession(store, coachId, {
      type: 'group',
      name: 'To Cancel Keep',
      date: addDays(TODAY, 21),
      startMin: 600,
      durationMin: 60,
      priceCents: 5000,
      isFree: false,
      location: '',
      capacity: 6,
      playerIds: ['p1', 'p2'],
    })

    await cancelSession(store, coachId, session.id, 'keep', TODAY)

    const finance = await loadFinance(store, coachId, TODAY)
    expect(finance.outstandingForSession(session.id)).toBe(10000)
    const updated = await store.getSession(coachId, session.id)
    expect(updated!.status).toBe('cancelled')
  })
})

describe('duplication', () => {
  it('produces a new session with new enrollments and no copied history', async () => {
    // A slot far outside the seed data so neither the original nor its copy
    // trips the conflict guard.
    const original = await createSession(store, coachId, {
      type: 'group',
      name: 'Original',
      date: addDays(TODAY, 40),
      startMin: 300,
      durationMin: 90,
      priceCents: 3000,
      isFree: false,
      location: 'Court 4',
      capacity: 6,
      playerIds: ['p1', 'p2'],
      allowConflict: true,
    })

    // Give the original attendance and a payment.
    await saveAttendance(store, coachId, original.id, [
      { playerId: 'p1', attendance: 'present' },
      { playerId: 'p2', attendance: 'absent' },
    ])
    let finance = await loadFinance(store, coachId, TODAY)
    await recordPayment(store, coachId, {
      chargeId: finance.forSession(original.id)[0].charge.id,
      amountCents: 3000,
      today: TODAY,
    })

    const draft = await buildDuplicateDraft(store, coachId, original.id, CLOCK)
    const copy = await createSession(store, coachId, {
      type: draft.type,
      name: 'Copy',
      date: draft.date,
      startMin: draft.startMin,
      durationMin: draft.durationMin,
      priceCents: draft.priceCents,
      isFree: draft.isFree,
      location: draft.location,
      capacity: draft.capacity,
      playerIds: draft.playerIds,
      allowConflict: true,
    })

    expect(copy.id).not.toBe(original.id)

    const copyEnrollments = await store.listEnrollmentsForSession(coachId, copy.id)
    expect(copyEnrollments).toHaveLength(2)
    // No attendance carried over.
    expect(copyEnrollments.every((e) => e.attendance === 'unmarked')).toBe(true)

    finance = await loadFinance(store, coachId, TODAY)
    const copyCharges = finance.forSession(copy.id)
    expect(copyCharges).toHaveLength(2)
    // Fresh charges: nothing paid, no shared identity with the originals.
    expect(copyCharges.every((c) => c.paidCents === 0)).toBe(true)
    const originalChargeIds = new Set(
      finance.forSession(original.id).map((v) => v.charge.id),
    )
    expect(copyCharges.every((c) => !originalChargeIds.has(c.charge.id))).toBe(true)
  })
})

describe('roster changes', () => {
  it('adding a player to a priced session creates a charge', async () => {
    const session = await createSession(store, coachId, {
      type: 'group',
      name: 'Add Test',
      date: addDays(TODAY, 22),
      startMin: 600,
      durationMin: 60,
      priceCents: 2500,
      isFree: false,
      location: '',
      capacity: 6,
      playerIds: ['p1'],
    })

    await addPlayerToSession(store, coachId, session.id, 'p2')

    const finance = await loadFinance(store, coachId, TODAY)
    expect(finance.forSession(session.id)).toHaveLength(2)
    expect(finance.outstandingForSession(session.id)).toBe(5000)
  })

  it('adding a player to a free session creates no charge', async () => {
    const session = await createSession(store, coachId, {
      type: 'group',
      name: 'Free Add Test',
      date: addDays(TODAY, 23),
      startMin: 600,
      durationMin: 60,
      priceCents: 0,
      isFree: true,
      location: '',
      capacity: 6,
      playerIds: ['p1'],
    })

    await addPlayerToSession(store, coachId, session.id, 'p2')

    const finance = await loadFinance(store, coachId, TODAY)
    expect(finance.forSession(session.id)).toHaveLength(0)
  })

  it('removing with "keep" preserves the obligation', async () => {
    const session = await createSession(store, coachId, {
      type: 'group',
      name: 'Remove Keep',
      date: addDays(TODAY, 24),
      startMin: 600,
      durationMin: 60,
      priceCents: 2500,
      isFree: false,
      location: '',
      capacity: 6,
      playerIds: ['p1', 'p2'],
    })

    await removePlayerFromSession(store, coachId, session.id, 'p2', 'keep', TODAY)

    const enrollments = await store.listEnrollmentsForSession(coachId, session.id)
    expect(enrollments).toHaveLength(1)

    const finance = await loadFinance(store, coachId, TODAY)
    // The charge survives the removal — history is never erased.
    expect(finance.forSession(session.id)).toHaveLength(2)
    expect(finance.outstandingForSession(session.id)).toBe(5000)
  })

  it('removing with "credit" writes the balance down to zero but keeps the record', async () => {
    const session = await createSession(store, coachId, {
      type: 'group',
      name: 'Remove Credit',
      date: addDays(TODAY, 25),
      startMin: 600,
      durationMin: 60,
      priceCents: 2500,
      isFree: false,
      location: '',
      capacity: 6,
      playerIds: ['p1', 'p2'],
    })

    await removePlayerFromSession(store, coachId, session.id, 'p2', 'credit', TODAY)

    const finance = await loadFinance(store, coachId, TODAY)
    const views = finance.forSession(session.id)
    expect(views).toHaveLength(2)
    const credited = views.find((v) => v.charge.playerId === 'p2')!
    expect(credited.outstandingCents).toBe(0)
    expect(credited.creditedCents).toBe(2500)
    expect(credited.status).toBe('credited')
    expect(finance.outstandingForSession(session.id)).toBe(2500)
  })
})

describe('price changes', () => {
  it('asks before repricing unpaid charges, and never rewrites paid ones', async () => {
    const session = await createSession(store, coachId, {
      type: 'group',
      name: 'Reprice',
      date: addDays(TODAY, 26),
      startMin: 600,
      durationMin: 60,
      priceCents: 3000,
      isFree: false,
      location: '',
      capacity: 6,
      playerIds: ['p1', 'p2'],
    })

    let finance = await loadFinance(store, coachId, TODAY)
    const charges = finance.forSession(session.id)
    await recordPayment(store, coachId, {
      chargeId: charges[0].charge.id,
      amountCents: 3000,
      today: TODAY,
    })

    const args = {
      name: 'Reprice',
      date: addDays(TODAY, 26),
      startMin: 600,
      durationMin: 60,
      priceCents: 4000,
      location: '',
      capacity: 6,
    }

    // First attempt returns a decision request rather than acting.
    const asked = await updateSession(store, coachId, session.id, args, TODAY)
    expect(asked.requiresPriceDecision).toBe(true)
    expect(asked.unpaidCount).toBe(1)

    await updateSession(
      store,
      coachId,
      session.id,
      { ...args, priceChangeDecision: 'update' },
      TODAY,
    )

    finance = await loadFinance(store, coachId, TODAY)
    const after = finance.forSession(session.id)
    const paid = after.find((v) => v.charge.id === charges[0].charge.id)!
    const unpaid = after.find((v) => v.charge.id === charges[1].charge.id)!

    expect(paid.amountCents).toBe(3000) // untouched
    expect(unpaid.amountCents).toBe(4000) // repriced
  })

  it('changing a player default rate never rewrites historical charges', async () => {
    const session = await createSession(store, coachId, {
      type: 'private',
      name: 'Rate History',
      date: addDays(TODAY, 27),
      startMin: 600,
      durationMin: 60,
      priceCents: 7500,
      isFree: false,
      location: '',
      capacity: null,
      playerIds: ['p1'],
    })

    await store.updatePlayer(coachId, 'p1', { defaultRateCents: 12000 })

    const finance = await loadFinance(store, coachId, TODAY)
    expect(finance.forSession(session.id)[0].amountCents).toBe(7500)
  })
})

describe('players', () => {
  it('archiving keeps history and balances intact', async () => {
    const before = await loadFinance(store, coachId, TODAY)
    const owedBefore = before.outstandingFor('p1')

    await setPlayerArchived(store, coachId, 'p1', true)

    const player = await store.getPlayer(coachId, 'p1')
    expect(player!.archived).toBe(true)
    expect(player!.deletedAt).toBeNull()

    const after = await loadFinance(store, coachId, TODAY)
    expect(after.outstandingFor('p1')).toBe(owedBefore)
    expect(after.forPlayer('p1').length).toBe(before.forPlayer('p1').length)
  })

  it('deleting is a soft delete that preserves financial records', async () => {
    const before = await loadFinance(store, coachId, TODAY)
    const chargeCount = before.forPlayer('p1').length
    expect(chargeCount).toBeGreaterThan(0)

    await deletePlayer(store, coachId, 'p1', 'Maya Okonkwo')

    const player = await store.getPlayer(coachId, 'p1')
    expect(player!.deletedAt).not.toBeNull()

    const after = await loadFinance(store, coachId, TODAY)
    expect(after.forPlayer('p1').length).toBe(chargeCount)
  })

  it('refuses deletion when the typed confirmation does not match', async () => {
    await expect(deletePlayer(store, coachId, 'p1', 'Wrong Name')).rejects.toThrow(
      DomainError,
    )
  })

  it('a new player starts with no charges', async () => {
    const player = await createPlayer(store, coachId, {
      name: 'Test Player',
      phone: '',
      email: '',
      level: 'Beginner',
      defaultRateCents: null,
      notes: '',
    })
    const finance = await loadFinance(store, coachId, TODAY)
    expect(finance.forPlayer(player.id)).toHaveLength(0)
    expect(finance.outstandingFor(player.id)).toBe(0)
  })
})

describe('payment recording', () => {
  it('rejects a duplicate settle attempt via the outstanding guard', async () => {
    const session = await createSession(store, coachId, {
      type: 'private',
      name: 'Double Pay',
      date: addDays(TODAY, 28),
      startMin: 600,
      durationMin: 60,
      priceCents: 5000,
      isFree: false,
      location: '',
      capacity: null,
      playerIds: ['p1'],
    })
    const finance = await loadFinance(store, coachId, TODAY)
    const chargeId = finance.forSession(session.id)[0].charge.id

    await recordPayment(store, coachId, {
      chargeId,
      amountCents: 5000,
      expectedOutstandingCents: 5000,
      today: TODAY,
    })

    // The same submission replayed must not record the money twice.
    await expect(
      recordPayment(store, coachId, {
        chargeId,
        amountCents: 5000,
        expectedOutstandingCents: 5000,
      today: TODAY,
    }),
    ).rejects.toThrow(DomainError)

    const after = await loadFinance(store, coachId, TODAY)
    expect(after.forSession(session.id)[0].paidCents).toBe(5000)
  })

  it('rejects a payment larger than the balance', async () => {
    const finance = await loadFinance(store, coachId, TODAY)
    const pending = finance.pending()[0]
    await expect(
      recordPayment(store, coachId, {
        chargeId: pending.charge.id,
        amountCents: pending.outstandingCents + 1,
      today: TODAY,
    }),
    ).rejects.toThrow(DomainError)
  })

  it('supports partial payment then settlement', async () => {
    const session = await createSession(store, coachId, {
      type: 'private',
      name: 'Partial',
      date: addDays(TODAY, 29),
      startMin: 600,
      durationMin: 60,
      priceCents: 5000,
      isFree: false,
      location: '',
      capacity: null,
      playerIds: ['p1'],
    })
    let finance = await loadFinance(store, coachId, TODAY)
    const chargeId = finance.forSession(session.id)[0].charge.id

    await recordPayment(store, coachId, { chargeId, amountCents: 2000 , today: TODAY })
    finance = await loadFinance(store, coachId, TODAY)
    let view = finance.forSession(session.id)[0]
    expect(view.outstandingCents).toBe(3000)
    expect(view.status).toBe('partial')

    await recordPayment(store, coachId, { chargeId, amountCents: 3000 , today: TODAY })
    finance = await loadFinance(store, coachId, TODAY)
    view = finance.forSession(session.id)[0]
    expect(view.outstandingCents).toBe(0)
    expect(view.status).toBe('paid')
  })

  it('mark unpaid removes payments and returns the charge to pending', async () => {
    const finance = await loadFinance(store, coachId, TODAY)
    const paid = finance.views.find((v) => v.status === 'paid')!

    await markUnpaid(store, coachId, paid.charge.id)

    const after = await loadFinance(store, coachId, TODAY)
    const view = after.byChargeId.get(paid.charge.id)!
    expect(view.paidCents).toBe(0)
    expect(view.isPending).toBe(true)
  })

  it('credits reduce the balance without counting as revenue', async () => {
    const finance = await loadFinance(store, coachId, TODAY)
    const pending = finance.pending().find((v) => v.outstandingCents >= 2000)!
    const revenueBefore = finance.revenue(addDays(TODAY, -365), addDays(TODAY, 365))

    await recordCredit(store, coachId, {
      chargeId: pending.charge.id,
      amountCents: 2000,
      reason: 'Goodwill',
      today: TODAY,
    })

    const after = await loadFinance(store, coachId, TODAY)
    const view = after.byChargeId.get(pending.charge.id)!
    expect(view.outstandingCents).toBe(pending.outstandingCents - 2000)
    expect(after.revenue(addDays(TODAY, -365), addDays(TODAY, 365))).toBe(revenueBefore)
  })
})

describe('consistency across screens', () => {
  it('player, session and global totals all come from the same derivation', async () => {
    const finance = await loadFinance(store, coachId, TODAY)

    const perPlayerSum = [...new Set(finance.views.map((v) => v.charge.playerId))]
      .map((playerId) => finance.outstandingFor(playerId))
      .reduce((total, amount) => total + amount, 0)

    expect(perPlayerSum).toBe(finance.totalOutstanding())

    const sessionIds = [
      ...new Set(
        finance.views.map((v) => v.charge.sessionId).filter((id): id is string => !!id),
      ),
    ]
    const perSessionSum = sessionIds
      .map((id) => finance.outstandingForSession(id))
      .reduce((total, amount) => total + amount, 0)
    const manualOutstanding = finance
      .views.filter((v) => v.charge.sessionId === null)
      .reduce((total, v) => total + v.outstandingCents, 0)

    expect(perSessionSum + manualOutstanding).toBe(finance.totalOutstanding())
  })

  it('seed data exercises every charge status', async () => {
    const finance = await loadFinance(store, coachId, TODAY)
    const statuses = new Set(finance.views.map((v) => v.status))
    expect(statuses).toContain('paid')
    expect(statuses).toContain('unpaid')
    expect(statuses).toContain('overdue')
    expect(statuses).toContain('voided')
    expect(statuses).toContain('credited')
    expect(statuses).toContain('partial')
  })

  it('seed data exercises every attendance state', async () => {
    const sessions = await store.listSessions(coachId)
    const enrollments = await store.listEnrollments(coachId)
    const bySession = new Map<string, typeof enrollments>()
    for (const enrollment of enrollments) {
      const list = bySession.get(enrollment.sessionId) ?? []
      list.push(enrollment)
      bySession.set(enrollment.sessionId, list)
    }
    const states = new Set(
      sessions.map((session) => attendanceState(session, bySession.get(session.id) ?? [])),
    )
    expect(states).toContain('unmarked')
    expect(states).toContain('complete')
    expect(states).toContain('skipped')
    expect(states).toContain('na') // the cancelled session

    const marks = new Set(enrollments.map((e) => e.attendance))
    expect(marks).toContain('present')
    expect(marks).toContain('absent')
    expect(marks).toContain('unmarked')
    expect(marks).toContain('skipped')

    // And an archived player exists.
    const players = await store.listPlayers(coachId)
    expect(players.some((p) => p.archived)).toBe(true)
    // And a past session that still needs attendance.
    expect(
      sessions.some(
        (s) =>
          isPast(s, CLOCK) &&
          s.status !== 'cancelled' &&
          !s.attendanceSkipped &&
          attendanceState(s, bySession.get(s.id) ?? []) === 'unmarked',
      ),
    ).toBe(true)
  })
})
